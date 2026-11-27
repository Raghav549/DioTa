package app.diota;

import java.util.Arrays;

/** Minimal, allocation-light DNS and IP/UDP packet helpers for the tracker shield. */
final class DnsPackets {
    private DnsPackets() {
    }

    /**
     * The name asked in a DNS query ("graph.example.com"), lower-case, or null if malformed.
     * questionEnd[0] receives the offset just after the question section.
     */
    static String questionName(byte[] q, int[] questionEnd) {
        questionEnd[0] = 12;
        if (q.length < 12) return null;
        int qd = ((q[4] & 0xFF) << 8) | (q[5] & 0xFF);
        if (qd < 1) return null;
        StringBuilder sb = new StringBuilder(64);
        int i = 12;
        while (true) {
            if (i >= q.length) return null;
            int len = q[i] & 0xFF;
            if (len == 0) {
                i++;
                break;
            }
            if ((len & 0xC0) != 0 || i + 1 + len > q.length) return null; // no compression in questions
            if (sb.length() > 0) sb.append('.');
            for (int k = i + 1; k <= i + len; k++) {
                int ch = q[k] & 0xFF;
                if (ch >= 'A' && ch <= 'Z') ch += 32;
                boolean ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_';
                if (!ok) return null;
                sb.append((char) ch);
            }
            if (sb.length() > 253) return null;
            i += 1 + len;
        }
        if (i + 4 > q.length) return null;
        questionEnd[0] = i + 4;
        return sb.length() == 0 ? null : sb.toString();
    }

    /** "This name does not exist" answer to a query: the app can't connect, and nothing is sent. */
    static byte[] nxdomain(byte[] query, int questionEnd) {
        int end = Math.max(12, Math.min(questionEnd, query.length));
        byte[] r = Arrays.copyOf(query, end);
        r[2] = (byte) (0x80 | (query[2] & 0x79)); // QR=1, keep opcode + RD, clear AA/TC
        r[3] = (byte) (0x80 | 3);                // RA=1, RCODE=NXDOMAIN
        r[4] = 0;
        r[5] = (byte) (end > 12 ? 1 : 0);
        for (int i = 6; i < 12; i++) r[i] = 0;
        return r;
    }

    static byte[] udp4(byte[] src, byte[] dst, int sport, int dport, byte[] payload) {
        int total = 20 + 8 + payload.length;
        byte[] p = new byte[total];
        p[0] = 0x45;
        p[2] = (byte) (total >> 8);
        p[3] = (byte) total;
        p[6] = 0x40; // don't fragment
        p[8] = 64;   // TTL
        p[9] = 17;   // UDP
        System.arraycopy(src, 0, p, 12, 4);
        System.arraycopy(dst, 0, p, 16, 4);
        int sum = checksum(p, 0, 20, 0);
        p[10] = (byte) (sum >> 8);
        p[11] = (byte) sum;
        udpHeader(p, 20, sport, dport, payload);
        // IPv4 allows a zero UDP checksum ("not computed").
        return p;
    }

    static byte[] udp6(byte[] src, byte[] dst, int sport, int dport, byte[] payload) {
        int udpLen = 8 + payload.length;
        byte[] p = new byte[40 + udpLen];
        p[0] = 0x60;
        p[4] = (byte) (udpLen >> 8);
        p[5] = (byte) udpLen;
        p[6] = 17;
        p[7] = 64;
        System.arraycopy(src, 0, p, 8, 16);
        System.arraycopy(dst, 0, p, 24, 16);
        udpHeader(p, 40, sport, dport, payload);
        // IPv6 requires the UDP checksum: pseudo-header (addresses, length, next header) + UDP.
        int pseudo = 0;
        for (int i = 8; i < 40; i += 2) pseudo += ((p[i] & 0xFF) << 8) | (p[i + 1] & 0xFF);
        pseudo += udpLen;
        pseudo += 17;
        int sum = checksum(p, 40, udpLen, pseudo);
        if (sum == 0) sum = 0xFFFF;
        p[46] = (byte) (sum >> 8);
        p[47] = (byte) sum;
        return p;
    }

    private static void udpHeader(byte[] p, int off, int sport, int dport, byte[] payload) {
        int len = 8 + payload.length;
        p[off] = (byte) (sport >> 8);
        p[off + 1] = (byte) sport;
        p[off + 2] = (byte) (dport >> 8);
        p[off + 3] = (byte) dport;
        p[off + 4] = (byte) (len >> 8);
        p[off + 5] = (byte) len;
        System.arraycopy(payload, 0, p, off + 8, payload.length);
    }

    /** One's-complement Internet checksum over p[off, off+len) plus an initial sum. */
    private static int checksum(byte[] p, int off, int len, int initial) {
        long sum = initial & 0xFFFFFFFFL;
        int i = off;
        int end = off + len;
        for (; i + 1 < end; i += 2) sum += ((p[i] & 0xFF) << 8) | (p[i + 1] & 0xFF);
        if (i < end) sum += (p[i] & 0xFF) << 8;
        while ((sum >> 16) != 0) sum = (sum & 0xFFFF) + (sum >> 16);
        return (int) (~sum & 0xFFFF);
    }
}
