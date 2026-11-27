package app.diota;

import java.io.ByteArrayOutputStream;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * DNS over TCP for the tracker shield (RFC 7766), so no lookup can slip past it by switching to
 * TCP: a resolver retries over TCP when an answer was too large for UDP. This is a minimal TCP
 * endpoint for the shield's own DNS addresses only (the tunnel is a local, lossless link): it
 * accepts the connection, reads length-prefixed queries, answers each through the same path as UDP
 * lookups (tracker refusal, then encrypted DNS) and closes when the client does.
 *
 * Any other TCP port on the DNS addresses (notably 853, DNS-over-TLS, which Android's "Private DNS:
 * Automatic" probes first) is refused at once with a reset, so the phone immediately uses the
 * shield's DNS instead of waiting for a time-out.
 */
final class TcpDns {
    interface Host {
        /** The DNS answer to a query from (client, port): tracker refusal or the resolved answer. */
        byte[] answer(byte[] query, byte[] client, int sport, byte[] server, int dport);

        void execute(Runnable r);

        void write(byte[] packet);
    }

    private static final int SYN = 0x02, RST = 0x04, PSH = 0x08, ACK = 0x10, FIN = 0x01;
    private static final int MAX_CONNS = 256;
    private static final long IDLE_MS = 30_000;

    private final Host host;
    private final SecureRandom rnd = new SecureRandom();
    private final Map<String, Conn> conns = new LinkedHashMap<>();

    private static final class Conn {
        final int version;
        final byte[] client, server;
        final int sport, dport;
        long clientNext; // next sequence number expected from the client
        long ourNext;    // next sequence number we send
        long seen;
        final ByteArrayOutputStream buf = new ByteArrayOutputStream();

        Conn(int version, byte[] client, byte[] server, int sport, int dport) {
            this.version = version;
            this.client = client;
            this.server = server;
            this.sport = sport;
            this.dport = dport;
        }
    }

    TcpDns(Host host) {
        this.host = host;
    }

    /** Handles one TCP packet read from the tunnel (called in tunnel-read order). */
    void handle(byte[] p) {
        int n = p.length;
        int version = (p[0] >> 4) & 0xF;
        int ipHdr, srcOff, addrLen, ipTotal;
        if (version == 4 && n >= 40) {
            if ((p[9] & 0xFF) != 6) return;
            ipHdr = (p[0] & 0xF) * 4;
            srcOff = 12;
            addrLen = 4;
            ipTotal = Math.min(n, u16(p, 2));
        } else if (version == 6 && n >= 60) {
            if ((p[6] & 0xFF) != 6) return; // no extension headers on these local packets
            ipHdr = 40;
            srcOff = 8;
            addrLen = 16;
            ipTotal = Math.min(n, 40 + u16(p, 4));
        } else {
            return;
        }
        if (ipTotal < ipHdr + 20) return;
        int t = ipHdr;
        int sport = u16(p, t);
        int dport = u16(p, t + 2);
        long seq = u32(p, t + 4);
        long ackNo = u32(p, t + 8);
        int dataOff = ((p[t + 12] >> 4) & 0xF) * 4;
        int flags = p[t + 13] & 0x3F;
        if (dataOff < 20 || t + dataOff > ipTotal) return;
        int payloadLen = ipTotal - t - dataOff;
        byte[] client = Arrays.copyOfRange(p, srcOff, srcOff + addrLen);
        byte[] server = Arrays.copyOfRange(p, srcOff + addrLen, srcOff + 2 * addrLen);

        if ((flags & RST) != 0) {
            synchronized (conns) {
                conns.remove(key(client, sport, server, dport));
            }
            return;
        }
        if (dport != 53) {
            refuse(version, client, server, sport, dport, seq, ackNo, flags, payloadLen);
            return;
        }

        String k = key(client, sport, server, dport);
        long now = System.currentTimeMillis();
        Conn c;
        synchronized (conns) {
            if ((flags & SYN) != 0 && (flags & ACK) == 0) {
                prune(now);
                c = new Conn(version, client, server, sport, dport);
                c.clientNext = (seq + 1) & 0xFFFFFFFFL;
                long isn = rnd.nextInt() & 0xFFFFFFFFL;
                c.ourNext = (isn + 1) & 0xFFFFFFFFL;
                c.seen = now;
                conns.put(k, c);
                send(c, isn, SYN | ACK, null, 0, 0);
                return;
            }
            c = conns.get(k);
        }
        if (c == null) {
            // Unknown connection: reset anything but a bare ACK (e.g. the last ACK after closing).
            if (payloadLen > 0 || (flags & (FIN | SYN)) != 0) refuse(version, client, server, sport, dport, seq, ackNo, flags, payloadLen);
            return;
        }

        synchronized (c) {
            c.seen = now;
            if (payloadLen > 0) {
                if (seq == c.clientNext) {
                    c.buf.write(p, t + dataOff, payloadLen);
                    c.clientNext = (c.clientNext + payloadLen) & 0xFFFFFFFFL;
                }
                send(c, c.ourNext, ACK, null, 0, 0);
                drainQueries(c);
            }
            if ((flags & FIN) != 0) {
                if (((seq + payloadLen) & 0xFFFFFFFFL) == c.clientNext) c.clientNext = (c.clientNext + 1) & 0xFFFFFFFFL;
                send(c, c.ourNext, FIN | ACK, null, 0, 0);
                c.ourNext = (c.ourNext + 1) & 0xFFFFFFFFL;
                synchronized (conns) {
                    conns.remove(k);
                }
            }
        }
    }

    /** Every complete (2-byte length prefixed) query in the buffer is answered asynchronously. */
    private void drainQueries(final Conn c) {
        byte[] all = c.buf.toByteArray();
        int i = 0;
        while (all.length - i >= 2) {
            int len = u16(all, i);
            if (len < 12 || len > 65535) {
                // Not DNS: drop the connection.
                synchronized (conns) {
                    conns.remove(key(c.client, c.sport, c.server, c.dport));
                }
                send(c, c.ourNext, RST | ACK, null, 0, 0);
                c.buf.reset();
                return;
            }
            if (all.length - i - 2 < len) break;
            final byte[] q = Arrays.copyOfRange(all, i + 2, i + 2 + len);
            i += 2 + len;
            host.execute(() -> reply(c, q));
        }
        c.buf.reset();
        if (i < all.length) c.buf.write(all, i, all.length - i);
    }

    private void reply(Conn c, byte[] q) {
        byte[] a;
        try {
            a = host.answer(q, c.client, c.sport, c.server, c.dport);
        } catch (Exception e) {
            a = null;
        }
        if (a == null) return;
        byte[] framed = new byte[a.length + 2];
        framed[0] = (byte) (a.length >> 8);
        framed[1] = (byte) a.length;
        System.arraycopy(a, 0, framed, 2, a.length);
        int mss = c.version == 4 ? 1460 : 1440;
        synchronized (c) {
            for (int off = 0; off < framed.length; off += mss) {
                int len = Math.min(mss, framed.length - off);
                send(c, c.ourNext, PSH | ACK, framed, off, len);
                c.ourNext = (c.ourNext + len) & 0xFFFFFFFFL;
            }
        }
    }

    private void refuse(int version, byte[] client, byte[] server, int sport, int dport, long seq, long ackNo, int flags, int payloadLen) {
        if ((flags & ACK) != 0) {
            host.write(packet(version, server, client, dport, sport, ackNo, 0, RST, null, 0, 0));
        } else {
            long ack = (seq + payloadLen + ((flags & SYN) != 0 ? 1 : 0) + ((flags & FIN) != 0 ? 1 : 0)) & 0xFFFFFFFFL;
            host.write(packet(version, server, client, dport, sport, 0, ack, RST | ACK, null, 0, 0));
        }
    }

    private void send(Conn c, long seq, int flags, byte[] data, int off, int len) {
        host.write(packet(c.version, c.server, c.client, c.dport, c.sport, seq, c.clientNext, flags, data, off, len));
    }

    private void prune(long now) {
        Iterator<Map.Entry<String, Conn>> it = conns.entrySet().iterator();
        while (it.hasNext()) {
            Conn c = it.next().getValue();
            if (now - c.seen > IDLE_MS || conns.size() >= MAX_CONNS) it.remove();
            else break; // insertion order: the rest are newer
        }
    }

    private static String key(byte[] client, int sport, byte[] server, int dport) {
        return Arrays.toString(client) + ':' + sport + '>' + Arrays.toString(server) + ':' + dport;
    }

    /** An IPv4/IPv6 + TCP packet (no options) with correct checksums. */
    static byte[] packet(int version, byte[] src, byte[] dst, int sport, int dport, long seq, long ack, int flags, byte[] data, int off, int len) {
        int ipHdr = version == 4 ? 20 : 40;
        int tcpLen = 20 + len;
        byte[] p = new byte[ipHdr + tcpLen];
        if (version == 4) {
            int total = p.length;
            p[0] = 0x45;
            p[2] = (byte) (total >> 8);
            p[3] = (byte) total;
            p[6] = 0x40;
            p[8] = 64;
            p[9] = 6;
            System.arraycopy(src, 0, p, 12, 4);
            System.arraycopy(dst, 0, p, 16, 4);
            int s = checksum(p, 0, 20, 0);
            p[10] = (byte) (s >> 8);
            p[11] = (byte) s;
        } else {
            p[0] = 0x60;
            p[4] = (byte) (tcpLen >> 8);
            p[5] = (byte) tcpLen;
            p[6] = 6;
            p[7] = 64;
            System.arraycopy(src, 0, p, 8, 16);
            System.arraycopy(dst, 0, p, 24, 16);
        }
        int t = ipHdr;
        p[t] = (byte) (sport >> 8);
        p[t + 1] = (byte) sport;
        p[t + 2] = (byte) (dport >> 8);
        p[t + 3] = (byte) dport;
        put32(p, t + 4, seq);
        put32(p, t + 8, ack);
        p[t + 12] = (byte) (5 << 4);
        p[t + 13] = (byte) flags;
        p[t + 14] = (byte) 0xFF; // window 65535
        p[t + 15] = (byte) 0xFF;
        if (len > 0) System.arraycopy(data, off, p, t + 20, len);
        // Pseudo-header: addresses, protocol, TCP length.
        int addrOff = version == 4 ? 12 : 8;
        int addrEnd = version == 4 ? 20 : 40;
        int pseudo = 0;
        for (int i = addrOff; i < addrEnd; i += 2) pseudo += ((p[i] & 0xFF) << 8) | (p[i + 1] & 0xFF);
        pseudo += 6 + tcpLen;
        int s = checksum(p, t, tcpLen, pseudo);
        p[t + 16] = (byte) (s >> 8);
        p[t + 17] = (byte) s;
        return p;
    }

    private static int checksum(byte[] p, int off, int len, int initial) {
        long sum = initial & 0xFFFFFFFFL;
        int i = off;
        int end = off + len;
        for (; i + 1 < end; i += 2) sum += ((p[i] & 0xFF) << 8) | (p[i + 1] & 0xFF);
        if (i < end) sum += (p[i] & 0xFF) << 8;
        while ((sum >> 16) != 0) sum = (sum & 0xFFFF) + (sum >> 16);
        return (int) (~sum & 0xFFFF);
    }

    private static int u16(byte[] a, int i) {
        return ((a[i] & 0xFF) << 8) | (a[i + 1] & 0xFF);
    }

    private static long u32(byte[] a, int i) {
        return ((long) (a[i] & 0xFF) << 24) | ((a[i + 1] & 0xFF) << 16) | ((a[i + 2] & 0xFF) << 8) | (a[i + 3] & 0xFF);
    }

    private static void put32(byte[] a, int i, long v) {
        a[i] = (byte) (v >> 24);
        a[i + 1] = (byte) (v >> 16);
        a[i + 2] = (byte) (v >> 8);
        a[i + 3] = (byte) v;
    }
}
