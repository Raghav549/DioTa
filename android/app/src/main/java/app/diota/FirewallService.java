package app.diota;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.system.OsConstants;

import java.io.FileInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

/**
 * On-device firewall. Android's VpnService lets an app capture the traffic of chosen apps:
 * only the apps the user blocked are routed here (addAllowedApplication), and their packets are
 * dropped, so they have no internet. Nothing is forwarded or sent anywhere. Each new connection
 * attempt is attributed to its app (getConnectionOwnerUid) and counted.
 */
public class FirewallService extends VpnService {
    private static final String ACTION_APPLY = "app.diota.firewall.APPLY";
    private static final String ACTION_STOP = "app.diota.firewall.STOP";
    private static volatile boolean running = false;

    private ParcelFileDescriptor tun;
    private Thread reader;

    static boolean isRunning() {
        return running;
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
        if (blocked.isEmpty()) return false;

        Builder b = new Builder();
        b.setSession("DioTa firewall");
        b.addAddress("10.215.173.1", 32);
        b.addAddress("fd00:d10:7a::1", 128);
        b.addRoute("0.0.0.0", 0);
        b.addRoute("::", 0);
        b.setMtu(1500);
        b.setBlocking(true);
        b.setMetered(false);
        Intent open = new Intent(this, MainActivity.class);
        b.setConfigureIntent(PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

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
        final ParcelFileDescriptor fd = next;
        final Set<String> blockedNow = blocked;
        reader = new Thread(() -> readLoop(fd, blockedNow), "dioTa-firewall");
        reader.start();
        return true;
    }

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
