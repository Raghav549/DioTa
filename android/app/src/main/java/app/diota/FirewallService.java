package app.diota;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.os.Process;
import android.system.OsConstants;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * On-device firewall and tracker shield, built on Android's VpnService. Two modes:
 *
 * Tracker shield (Protection on): only DNS is routed here, for every app on the phone (user apps,
 * system apps and browsers, in the foreground, the background or with the screen off). Each lookup
 * is attributed to the app that made it (getConnectionOwnerUid). Lookups of known tracker endpoints
 * (src/lib/data/trackers.json) are answered "does not exist", so the app cannot connect and nothing
 * is sent; every other lookup is answered over encrypted DNS-over-HTTPS (DohResolver, cached), never
 * by the network's own DNS servers, so the carrier can't see or log the lookups. Lookups over TCP are
 * answered too (TcpDns), and DNS-over-TLS probes to the shield are refused so Android falls back to
 * it at once. Apps the user
 * blocked get no answers at all. Each blocked attempt is recorded (app, endpoint, tracker, situation)
 * and sent, encrypted, to the user's DioTa account (InterceptStore). DioTa itself is excluded.
 *
 * App firewall only (Protection off, some apps blocked): only the blocked apps are routed here
 * (addAllowedApplication) and all their packets are dropped, so they have no internet at all.
 *
 * Nothing is decrypted or inspected beyond the DNS name: the shield never sees the content of any
 * app's traffic.
 */
public class FirewallService extends VpnService {
    private static final String ACTION_APPLY = "app.diota.firewall.APPLY";
    private static final String ACTION_STOP = "app.diota.firewall.STOP";
    private static final String ADDR4 = "10.215.173.1";
    private static final String ADDR6 = "fd00:d10:7a::1";
    private static final String DNS4 = "10.215.173.2";
    private static final String DNS6 = "fd00:d10:7a::2";
    private static volatile boolean running = false;
    private static volatile boolean shieldRunning = false;

    private ParcelFileDescriptor tun;
    private Thread reader;
    private volatile ThreadPoolExecutor dnsPool;
    private final Object tunWriteLock = new Object();
    private volatile FileOutputStream tunOut;
    private volatile Set<String> blockedNow = new java.util.HashSet<>();
    private ForegroundTracker foreground;
    private final Map<Integer, String> uidToPkg = new ConcurrentHashMap<>();
    private final Map<String, String> labels = new ConcurrentHashMap<>();
    private final Map<String, Long> pendingAttempts = new HashMap<>();
    private long attemptsFlushedAt = 0;
    private volatile DohResolver doh;
    private volatile TcpDns tcpDns;

    static boolean isRunning() {
        return running;
    }

    static boolean isShieldRunning() {
        return shieldRunning;
    }

    static void apply(Context c) {
        c.startService(new Intent(c, FirewallService.class).setAction(ACTION_APPLY));
    }

    static void stop(Context c) {
        if (!running) return;
        try {
            c.startService(new Intent(c, FirewallService.class).setAction(ACTION_STOP));
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_APPLY : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            shutdown();
            stopSelf();
            return START_NOT_STICKY;
        }
        // ACTION_APPLY, or started by the system (e.g. always-on VPN).
        if (!establish()) {
            shutdown();
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    private synchronized boolean establish() {
        Set<String> blocked = Firewall.blocked(this);
        blocked.remove(getPackageName());
        final boolean shield = Firewall.shield(this);
        if (blocked.isEmpty() && !shield) return false;

        Builder b = new Builder();
        b.setSession(shield ? "DioTa tracker shield" : "DioTa firewall");
        b.addAddress(ADDR4, 32);
        b.addAddress(ADDR6, 128);
        b.setMtu(1500);
        b.setBlocking(true);
        b.setMetered(false);
        Intent open = new Intent(this, MainActivity.class);
        b.setConfigureIntent(PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        if (shield) {
            // Only DNS comes through the tunnel; all other traffic goes straight to the network.
            b.addDnsServer(DNS4);
            b.addDnsServer(DNS6);
            b.addRoute(DNS4, 32);
            b.addRoute(DNS6, 128);
            try {
                b.addDisallowedApplication(getPackageName());
            } catch (PackageManager.NameNotFoundException ignored) {
            }
        } else {
            b.addRoute("0.0.0.0", 0);
            b.addRoute("::", 0);
            int routed = 0;
            for (String pkg : blocked) {
                try {
                    b.addAllowedApplication(pkg);
                    routed++;
                } catch (PackageManager.NameNotFoundException ignored) {
                    // Uninstalled since it was blocked.
                }
            }
            if (routed == 0) return false;
        }

        ParcelFileDescriptor next;
        try {
            next = b.establish();
        } catch (Exception e) {
            return false;
        }
        if (next == null) return false; // the user withdrew VPN consent

        closeTun();
        tun = next;
        running = true;
        shieldRunning = shield;
        blockedNow = blocked;
        final ParcelFileDescriptor fd = next;
        if (shield) {
            Trackers.load(this);
            if (foreground == null) foreground = new ForegroundTracker(this);
            uidToPkg.clear();
            if (doh == null) doh = new DohResolver(new DohResolver.Net() {
                @Override
                public Network underlying() {
                    return underlyingNetwork();
                }

                @Override
                public boolean protect(java.net.DatagramSocket s) {
                    return FirewallService.this.protect(s);
                }
            });
            if (tcpDns == null) tcpDns = new TcpDns(new TcpDns.Host() {
                @Override
                public byte[] answer(byte[] query, byte[] client, int sport, byte[] server, int dport) {
                    return answerFor(query, client, sport, server, dport, OsConstants.IPPROTO_TCP, false);
                }

                @Override
                public void execute(Runnable r) {
                    ThreadPoolExecutor pool = dnsPool;
                    if (pool == null) return;
                    try {
                        pool.execute(r);
                    } catch (RejectedExecutionException ignored) {
                    }
                }

                @Override
                public void write(byte[] packet) {
                    writeRaw(packet);
                }
            });
            // Encrypted lookups wait on the network, so several run at once (idle threads exit).
            ThreadPoolExecutor pool = new ThreadPoolExecutor(10, 10, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(512), r -> {
                Thread t = new Thread(r, "dioTa-dns");
                t.setPriority(Thread.NORM_PRIORITY - 1);
                return t;
            }, new ThreadPoolExecutor.DiscardOldestPolicy());
            pool.allowCoreThreadTimeOut(true);
            dnsPool = pool;
            InterceptStore.get(this).start();
            reader = new Thread(() -> dnsLoop(fd), "dioTa-shield");
        } else {
            final Set<String> only = blocked;
            reader = new Thread(() -> readLoop(fd, only), "dioTa-firewall");
        }
        reader.start();
        return true;
    }

    // ---------- tracker shield (DNS) ----------

    private void dnsLoop(ParcelFileDescriptor fd) {
        byte[] buf = new byte[32767];
        final FileOutputStream out = new FileOutputStream(fd.getFileDescriptor());
        try (FileInputStream in = new FileInputStream(fd.getFileDescriptor())) {
            tunOut = out;
            while (!Thread.currentThread().isInterrupted()) {
                int n = in.read(buf);
                if (n < 0) break;
                if (n == 0) continue;
                final byte[] pkt = Arrays.copyOf(buf, n);
                int ver = (pkt[0] >> 4) & 0xF;
                int proto = ver == 4 && n >= 20 ? pkt[9] & 0xFF : ver == 6 && n >= 40 ? pkt[6] & 0xFF : -1;
                if (proto == 6) {
                    // DNS over TCP / DNS-over-TLS probes: handled in arrival order (cheap; lookups run in the pool).
                    TcpDns t = tcpDns;
                    if (t != null) {
                        try {
                            t.handle(pkt);
                        } catch (Exception ignored) {
                        }
                    }
                    continue;
                }
                // Always the current pool/tunnel: a lookup read during a reconfiguration is still answered.
                ThreadPoolExecutor pool = dnsPool;
                if (pool == null) continue;
                try {
                    pool.execute(() -> handleDns(pkt));
                } catch (RejectedExecutionException ignored) {
                    // shutting down
                }
            }
        } catch (IOException ignored) {
            // The tunnel was closed (stopped or reconfigured).
        } finally {
            synchronized (tunWriteLock) {
                if (tunOut == out) tunOut = null; // only if a newer tunnel hasn't taken over
            }
            flushAttempts(true);
        }
    }

    private void handleDns(byte[] p) {
        try {
            int n = p.length;
            int version = (p[0] >> 4) & 0xF;
            int hdr;
            int proto;
            int srcOff;
            int addrLen;
            if (version == 4 && n >= 20) {
                hdr = (p[0] & 0xF) * 4;
                proto = p[9] & 0xFF;
                srcOff = 12;
                addrLen = 4;
            } else if (version == 6 && n >= 40) {
                hdr = 40;
                proto = p[6] & 0xFF;
                srcOff = 8;
                addrLen = 16;
            } else {
                return;
            }
            if (proto != 17 || n < hdr + 8 + 12) return; // UDP DNS only
            int sport = u16(p, hdr);
            int dport = u16(p, hdr + 2);
            if (dport != 53) return;
            int dnsLen = Math.min(u16(p, hdr + 4) - 8, n - hdr - 8);
            if (dnsLen < 12) return;
            byte[] query = Arrays.copyOfRange(p, hdr + 8, hdr + 8 + dnsLen);
            byte[] client = Arrays.copyOfRange(p, srcOff, srcOff + addrLen);
            byte[] server = Arrays.copyOfRange(p, srcOff + addrLen, srcOff + 2 * addrLen);

            byte[] answer = answerFor(query, client, sport, server, dport, OsConstants.IPPROTO_UDP, true);
            if (answer != null) writeToTun(version, client, server, sport, answer);
        } catch (Exception ignored) {
            // A malformed packet never takes the shield down.
        }
    }

    /**
     * The answer to one lookup, over UDP or TCP: "does not exist" for tracker endpoints and blocked
     * apps (and the attempt is recorded), otherwise the encrypted-DNS answer. Null if unanswerable.
     */
    private byte[] answerFor(byte[] query, byte[] client, int sport, byte[] server, int dport, int proto, boolean udp) {
        int[] qEnd = new int[1];
        String name = DnsPackets.questionName(query, qEnd);
        String pkg = ownerPackage(proto, client, sport, server, dport);
        boolean appBlocked = pkg != null && blockedNow.contains(pkg);
        String[] tracker = name == null ? null : Trackers.match(name);

        if (appBlocked || tracker != null) {
            if (pkg != null && name != null) {
                long now = System.currentTimeMillis();
                String trigger = foreground.trigger(pkg, now);
                InterceptStore.get(this).record(pkg, label(pkg), name, trigger, tracker == null);
            }
            if (appBlocked) countAttempt(pkg);
            return DnsPackets.nxdomain(query, qEnd[0]);
        }
        DohResolver r = doh;
        if (r == null || qEnd[0] <= 12) return null;
        byte[] answer = r.resolve(query, qEnd[0]);
        if (answer == null) return null;
        return udp ? DohResolver.fitUdp(query, qEnd[0], answer) : answer;
    }

    private static int u16(byte[] a, int i) {
        return ((a[i] & 0xFF) << 8) | (a[i + 1] & 0xFF);
    }

    private void writeToTun(int version, byte[] client, byte[] server, int clientPort, byte[] payload) throws IOException {
        byte[] pkt = version == 4 ? DnsPackets.udp4(server, client, 53, clientPort, payload) : DnsPackets.udp6(server, client, 53, clientPort, payload);
        FileOutputStream out = tunOut;
        if (out == null) return;
        synchronized (tunWriteLock) {
            out.write(pkt);
        }
    }

    private void writeRaw(byte[] pkt) {
        FileOutputStream out = tunOut;
        if (out == null) return;
        try {
            synchronized (tunWriteLock) {
                out.write(pkt);
            }
        } catch (IOException ignored) {
        }
    }

    /** The phone's real network (Wi-Fi / mobile data) under the tunnel, for the encrypted lookups. */
    private volatile Network underlying;
    private volatile long underlyingAt = 0;

    private Network underlyingNetwork() {
        long now = System.currentTimeMillis();
        if (now - underlyingAt < 5_000) return underlying;
        underlying = findUnderlying();
        underlyingAt = now;
        return underlying;
    }

    private Network findUnderlying() {
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            Network active = cm.getActiveNetwork();
            List<Network> nets = new ArrayList<>();
            if (active != null) nets.add(active);
            for (Network n : cm.getAllNetworks()) if (!n.equals(active)) nets.add(n);
            for (Network n : nets) {
                NetworkCapabilities c = cm.getNetworkCapabilities(n);
                if (c == null || c.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || !c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
                return n;
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /** The app that made this lookup (Android attributes DNS sockets to the requesting app). */
    private String ownerPackage(int proto, byte[] client, int sport, byte[] server, int dport) {
        int uid;
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            uid = cm.getConnectionOwnerUid(proto,
                    new InetSocketAddress(InetAddress.getByAddress(client), sport),
                    new InetSocketAddress(InetAddress.getByAddress(server), dport));
        } catch (Exception e) {
            return null;
        }
        if (uid < 0 || uid == Process.myUid()) return null;
        String cached = uidToPkg.get(uid);
        if (cached != null) return cached.isEmpty() ? null : cached;
        String pkg = "";
        String[] pkgs = getPackageManager().getPackagesForUid(uid);
        if (pkgs != null && pkgs.length > 0) {
            Arrays.sort(pkgs);
            pkg = pkgs[0];
            for (String s : pkgs) {
                if (blockedNow.contains(s)) {
                    pkg = s;
                    break;
                }
                if ("android".equals(s)) pkg = s;
            }
        }
        uidToPkg.put(uid, pkg);
        return pkg.isEmpty() ? null : pkg;
    }

    private String label(String pkg) {
        String l = labels.get(pkg);
        if (l != null) return l;
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            l = pm.getApplicationLabel(ai).toString().trim();
        } catch (Exception e) {
            l = pkg;
        }
        if (l.isEmpty()) l = pkg;
        if (l.length() > 80) l = l.substring(0, 80);
        labels.put(pkg, l);
        return l;
    }

    private void countAttempt(String pkg) {
        synchronized (pendingAttempts) {
            Long c = pendingAttempts.get(pkg);
            pendingAttempts.put(pkg, (c == null ? 0 : c) + 1);
        }
        flushAttempts(false);
    }

    private void flushAttempts(boolean force) {
        Map<String, Long> out;
        synchronized (pendingAttempts) {
            long now = System.currentTimeMillis();
            if (pendingAttempts.isEmpty() || (!force && now - attemptsFlushedAt < 5000)) return;
            out = new HashMap<>(pendingAttempts);
            pendingAttempts.clear();
            attemptsFlushedAt = now;
        }
        Firewall.addAttempts(this, out);
    }

    // ---------- app firewall (drop everything of blocked apps) ----------

    private void readLoop(ParcelFileDescriptor fd, Set<String> blocked) {
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        PackageManager pm = getPackageManager();
        Map<Integer, String> uidToPkg = new HashMap<>();
        Map<String, Long> recent = new HashMap<>();
        Map<String, Long> pending = new HashMap<>();
        long lastFlush = System.currentTimeMillis();
        byte[] buf = new byte[32767];
        String only = blocked.size() == 1 ? blocked.iterator().next() : null;

        try (FileInputStream in = new FileInputStream(fd.getFileDescriptor())) {
            while (!Thread.currentThread().isInterrupted()) {
                int n = in.read(buf);
                if (n < 0) break;
                long now = System.currentTimeMillis();
                if (n > 0) {
                    String pkg = attempt(buf, n, now, cm, pm, uidToPkg, recent, blocked, only);
                    if (pkg != null) {
                        Long p = pending.get(pkg);
                        pending.put(pkg, (p == null ? 0 : p) + 1);
                    }
                }
                if (now - lastFlush > 5000 && !pending.isEmpty()) {
                    Firewall.addAttempts(this, pending);
                    pending = new HashMap<>();
                    lastFlush = now;
                }
            }
        } catch (IOException ignored) {
            // The tunnel was closed (firewall stopped or reconfigured).
        } finally {
            if (!pending.isEmpty()) Firewall.addAttempts(this, pending);
        }
    }

    /** Returns the blocked app's package if this packet is a NEW connection attempt, else null. */
    private static String attempt(byte[] p, int n, long now, ConnectivityManager cm, PackageManager pm, Map<Integer, String> uidToPkg,
                                  Map<String, Long> recent, Set<String> blocked, String only) {
        int version = (p[0] >> 4) & 0xF;
        int proto;
        int hdr;
        byte[] src;
        byte[] dst;
        if (version == 4 && n >= 20) {
            hdr = (p[0] & 0xF) * 4;
            proto = p[9] & 0xFF;
            src = slice(p, 12, 4);
            dst = slice(p, 16, 4);
        } else if (version == 6 && n >= 40) {
            hdr = 40;
            proto = p[6] & 0xFF;
            src = slice(p, 8, 16);
            dst = slice(p, 24, 16);
        } else {
            return null;
        }
        if (proto != 6 && proto != 17) return null;
        if (n < hdr + (proto == 6 ? 14 : 8)) return null;
        if (proto == 6) {
            int flags = p[hdr + 13] & 0xFF;
            boolean syn = (flags & 0x02) != 0;
            boolean ack = (flags & 0x10) != 0;
            if (!syn || ack) return null; // only count new TCP connections
        }
        int sport = ((p[hdr] & 0xFF) << 8) | (p[hdr + 1] & 0xFF);
        int dport = ((p[hdr + 2] & 0xFF) << 8) | (p[hdr + 3] & 0xFF);

        // Retransmissions of the same attempt are counted once.
        String key = proto + ":" + sport + ":" + java.util.Arrays.hashCode(dst) + ":" + dport;
        Long seen = recent.get(key);
        if (seen != null && now - seen < 15000) return null;
        recent.put(key, now);
        if (recent.size() > 2000) {
            Iterator<Map.Entry<String, Long>> it = recent.entrySet().iterator();
            while (it.hasNext()) if (now - it.next().getValue() > 15000) it.remove();
        }

        int uid = -1;
        try {
            InetSocketAddress local = new InetSocketAddress(InetAddress.getByAddress(src), sport);
            InetSocketAddress remote = new InetSocketAddress(InetAddress.getByAddress(dst), dport);
            uid = cm.getConnectionOwnerUid(proto == 6 ? OsConstants.IPPROTO_TCP : OsConstants.IPPROTO_UDP, local, remote);
        } catch (Exception ignored) {
        }
        if (uid < 0) return only;
        if (uidToPkg.containsKey(uid)) return uidToPkg.get(uid);
        String pkg = only;
        String[] pkgs = pm.getPackagesForUid(uid);
        if (pkgs != null) {
            for (String s : pkgs) {
                if (blocked.contains(s)) {
                    pkg = s;
                    break;
                }
            }
        }
        uidToPkg.put(uid, pkg);
        return pkg;
    }

    private static byte[] slice(byte[] a, int from, int len) {
        byte[] out = new byte[len];
        System.arraycopy(a, from, out, 0, len);
        return out;
    }

    private synchronized void closeTun() {
        if (reader != null) reader.interrupt();
        reader = null;
        if (dnsPool != null) dnsPool.shutdownNow();
        dnsPool = null;
        if (tun != null) {
            try {
                tun.close();
            } catch (IOException ignored) {
            }
        }
        tun = null;
    }

    private synchronized void shutdown() {
        closeTun();
        running = false;
        shieldRunning = false;
    }

    @Override
    public void onRevoke() {
        // Another VPN was turned on, or the user turned DioTa's off in Settings.
        shutdown();
        stopSelf();
        super.onRevoke();
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }
}
