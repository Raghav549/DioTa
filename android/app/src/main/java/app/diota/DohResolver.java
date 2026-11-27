package app.diota;

import android.net.Network;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Encrypted DNS for the tracker shield: every lookup that is not refused is answered over
 * DNS-over-HTTPS (RFC 8484), never by the mobile network's / Wi-Fi's own DNS servers. The ISP
 * therefore neither sees nor answers the phone's lookups, and DNS leak tests show the encrypted
 * resolver instead of the carrier's.
 *
 * Resolvers are addressed by IP (their certificates cover the IP), so no plain-text lookup is needed
 * to reach them. Answers are cached (LRU, honouring the record TTLs, at most 10 minutes) so repeated
 * lookups are answered instantly from the phone. If every encrypted resolver is unreachable (for
 * example a network that blocks HTTPS to them) the lookup goes to the same public resolvers over
 * plain DNS, still never to the network's own DNS servers.
 */
final class DohResolver {
    interface Net {
        /** The real (non-VPN) network to send the lookups on, or null for the default one. */
        Network underlying();

        /** Keep a socket outside the tunnel. */
        boolean protect(DatagramSocket s);
    }

    private static final String[] DOH = {
        "https://1.1.1.1/dns-query",   // Cloudflare
        "https://9.9.9.9/dns-query",   // Quad9 (malware-filtering)
        "https://8.8.8.8/dns-query",   // Google
    };
    private static final byte[][] PLAIN = {{1, 1, 1, 1}, {9, 9, 9, 9}, {8, 8, 8, 8}};
    private static final int CACHE_MAX = 2048;
    private static final int MAX_TTL = 600;

    private final Net net;
    private volatile int preferred = 0;
    private final Map<String, Cached> cache = new LinkedHashMap<String, Cached>(256, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Cached> e) {
            return size() > CACHE_MAX;
        }
    };

    private static final class Cached {
        final byte[] answer;
        final long expires;

        Cached(byte[] answer, long expires) {
            this.answer = answer;
            this.expires = expires;
        }
    }

    DohResolver(Net net) {
        this.net = net;
    }

    void clear() {
        synchronized (cache) {
            cache.clear();
        }
    }

    /** The answer to a raw DNS query (same transaction ID), or null if no resolver answered. */
    byte[] resolve(byte[] query, int questionEnd) {
        if (query.length < 12 || questionEnd <= 12 || questionEnd > query.length) return null;
        String key = cacheKey(query, questionEnd);
        long now = System.currentTimeMillis();
        synchronized (cache) {
            Cached e = cache.get(key);
            if (e != null) {
                if (e.expires > now) {
                    byte[] r = e.answer.clone();
                    r[0] = query[0];
                    r[1] = query[1];
                    setTtls(r, (int) Math.max(1, (e.expires - now) / 1000));
                    return r;
                }
                cache.remove(key);
            }
        }

        // RFC 8484: ID 0 on the wire (the resolver's HTTP cache can then share answers).
        byte[] wire = query.clone();
        wire[0] = 0;
        wire[1] = 0;
        byte[] answer = null;
        int start = preferred;
        for (int k = 0; k < DOH.length && answer == null; k++) {
            int i = (start + k) % DOH.length;
            answer = post(DOH[i], wire);
            if (answer != null) preferred = i;
        }
        if (answer == null) answer = plain(wire);
        if (answer == null || answer.length < 12) return null;
        answer[0] = query[0];
        answer[1] = query[1];

        int rcode = answer[3] & 0x0F;
        boolean truncated = (answer[2] & 0x02) != 0;
        if ((rcode == 0 || rcode == 3) && !truncated) {
            int ttl = minTtl(answer);
            if (ttl > 0) {
                synchronized (cache) {
                    cache.put(key, new Cached(answer.clone(), now + Math.min(ttl, MAX_TTL) * 1000L));
                }
            }
        }
        return answer;
    }

    private byte[] post(String endpoint, byte[] wire) {
        HttpURLConnection c = null;
        try {
            URL url = new URL(endpoint);
            Network n = net.underlying();
            c = (HttpURLConnection) (n != null ? n.openConnection(url) : url.openConnection());
            c.setConnectTimeout(2500);
            c.setReadTimeout(3500);
            c.setUseCaches(false);
            c.setDoOutput(true);
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/dns-message");
            c.setRequestProperty("Accept", "application/dns-message");
            c.setFixedLengthStreamingMode(wire.length);
            try (OutputStream o = c.getOutputStream()) {
                o.write(wire);
            }
            if (c.getResponseCode() != 200) {
                drain(c.getErrorStream());
                return null;
            }
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream(512);
                byte[] buf = new byte[2048];
                int r;
                while ((r = in.read(buf)) > 0) {
                    out.write(buf, 0, r);
                    if (out.size() > 65535) return null;
                }
                byte[] a = out.toByteArray();
                return a.length >= 12 ? a : null;
            }
        } catch (Exception e) {
            if (c != null) c.disconnect();
            return null;
        }
    }

    private static void drain(InputStream in) {
        if (in == null) return;
        try (InputStream i = in) {
            byte[] b = new byte[512];
            while (i.read(b) > 0) {
                // discard, so the connection can be reused
            }
        } catch (Exception ignored) {
        }
    }

    private byte[] plain(byte[] wire) {
        for (byte[] ip : PLAIN) {
            try (DatagramSocket s = new DatagramSocket()) {
                net.protect(s);
                Network n = net.underlying();
                if (n != null) {
                    try {
                        n.bindSocket(s);
                    } catch (Exception ignored) {
                    }
                }
                s.setSoTimeout(2500);
                s.send(new DatagramPacket(wire, wire.length, InetAddress.getByAddress(ip), 53));
                byte[] buf = new byte[4096];
                DatagramPacket r = new DatagramPacket(buf, buf.length);
                s.receive(r);
                if (r.getLength() >= 12) return Arrays.copyOf(buf, r.getLength());
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    /** Question (lower-cased name, type, class) plus the DNSSEC-OK / checking-disabled flags. */
    private static String cacheKey(byte[] q, int questionEnd) {
        StringBuilder sb = new StringBuilder(questionEnd * 2);
        for (int i = 12; i < questionEnd; i++) {
            int b = q[i] & 0xFF;
            if (b >= 'A' && b <= 'Z') b += 32;
            sb.append(Character.forDigit(b >> 4, 16)).append(Character.forDigit(b & 15, 16));
        }
        sb.append('/').append(q[3] & 0x10); // CD bit
        return sb.toString();
    }

    private static int u16(byte[] a, int i) {
        return ((a[i] & 0xFF) << 8) | (a[i + 1] & 0xFF);
    }

    /** Offset just past a (possibly compressed) name, or -1 if malformed. */
    private static int skipName(byte[] a, int i) {
        while (i < a.length) {
            int len = a[i] & 0xFF;
            if (len == 0) return i + 1;
            if ((len & 0xC0) == 0xC0) return i + 2;
            if ((len & 0xC0) != 0) return -1;
            i += 1 + len;
        }
        return -1;
    }

    /** Smallest TTL of the answer / authority records (OPT excluded); 30 s for an empty answer. */
    static int minTtl(byte[] a) {
        try {
            int qd = u16(a, 4);
            int rr = u16(a, 6) + u16(a, 8) + u16(a, 10);
            int i = 12;
            for (int k = 0; k < qd; k++) {
                i = skipName(a, i);
                if (i < 0) return 0;
                i += 4;
            }
            int min = Integer.MAX_VALUE;
            for (int k = 0; k < rr; k++) {
                i = skipName(a, i);
                if (i < 0 || i + 10 > a.length) return 0;
                int type = u16(a, i);
                long ttl = ((long) (a[i + 4] & 0xFF) << 24) | ((a[i + 5] & 0xFF) << 16) | ((a[i + 6] & 0xFF) << 8) | (a[i + 7] & 0xFF);
                int rdlen = u16(a, i + 8);
                if (type != 41) min = (int) Math.min(min, Math.min(ttl, Integer.MAX_VALUE));
                i += 10 + rdlen;
            }
            return min == Integer.MAX_VALUE ? 30 : min;
        } catch (Exception e) {
            return 0;
        }
    }

    /** Rewrites the TTL of every record (OPT excluded) to the time left in the cache. */
    static void setTtls(byte[] a, int secs) {
        try {
            int qd = u16(a, 4);
            int rr = u16(a, 6) + u16(a, 8) + u16(a, 10);
            int i = 12;
            for (int k = 0; k < qd; k++) {
                i = skipName(a, i);
                if (i < 0) return;
                i += 4;
            }
            for (int k = 0; k < rr; k++) {
                i = skipName(a, i);
                if (i < 0 || i + 10 > a.length) return;
                if (u16(a, i) != 41) {
                    long ttl = ((long) (a[i + 4] & 0xFF) << 24) | ((a[i + 5] & 0xFF) << 16) | ((a[i + 6] & 0xFF) << 8) | (a[i + 7] & 0xFF);
                    int t = (int) Math.min(ttl, secs);
                    a[i + 4] = (byte) (t >> 24);
                    a[i + 5] = (byte) (t >> 16);
                    a[i + 6] = (byte) (t >> 8);
                    a[i + 7] = (byte) t;
                }
                i += 10 + u16(a, i + 8);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Fits an answer into a UDP reply for this client: the size the query advertised (EDNS), or 512
     * bytes without EDNS, never more than one tunnel packet. A larger answer is cut to its header and
     * question with the "truncated" flag, as a DNS server would do.
     */
    static byte[] fitUdp(byte[] query, int questionEnd, byte[] answer) {
        int limit = 512;
        try {
            int ar = u16(query, 10);
            int i = questionEnd;
            for (int k = 0; k < ar && i < query.length; k++) {
                i = skipName(query, i);
                if (i < 0 || i + 10 > query.length) break;
                if (u16(query, i) == 41) {
                    limit = Math.max(512, u16(query, i + 2));
                    break;
                }
                i += 10 + u16(query, i + 8);
            }
        } catch (Exception ignored) {
        }
        limit = Math.min(limit, 1500 - 40 - 8);
        if (answer.length <= limit) return answer;
        int end = Math.max(12, Math.min(questionEnd, answer.length));
        byte[] r = Arrays.copyOf(answer, end);
        r[2] = (byte) (r[2] | 0x02); // TC
        r[4] = 0;
        r[5] = (byte) (end > 12 ? 1 : 0);
        for (int k = 6; k < 12; k++) r[k] = 0;
        return r;
    }
}
