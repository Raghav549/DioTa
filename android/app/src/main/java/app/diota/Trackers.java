package app.diota;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Known tracker endpoints (advertising, analytics, attribution, location brokers, fingerprinting,
 * OEM telemetry). The list is src/lib/data/trackers.json in the repo, packaged as an app asset, so
 * the phone and the server always agree. Matching is by domain suffix: "a.b.doubleclick.net" matches
 * "doubleclick.net".
 */
final class Trackers {
    /** [organisation, kind] by domain. */
    private static volatile Map<String, String[]> byDomain;

    private Trackers() {
    }

    static void load(Context c) {
        if (byDomain != null) return;
        synchronized (Trackers.class) {
            if (byDomain != null) return;
            Map<String, String[]> m = new HashMap<>();
            try (InputStream in = c.getAssets().open("trackers.json")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                JSONArray list = new JSONObject(out.toString("UTF-8")).getJSONArray("trackers");
                for (int i = 0; i < list.length(); i++) {
                    JSONArray t = list.getJSONArray(i);
                    m.put(t.getString(0).toLowerCase(Locale.ROOT), new String[]{t.getString(1), t.getString(2)});
                }
            } catch (Exception ignored) {
                // A broken asset only disables tracker matching; app blocking keeps working.
            }
            byDomain = m;
        }
    }

    /** [organisation, kind] if the domain (or a parent domain) is a known tracker, else null. */
    static String[] match(String domain) {
        Map<String, String[]> m = byDomain;
        if (m == null || domain == null || domain.isEmpty()) return null;
        String d = domain.toLowerCase(Locale.ROOT);
        if (d.endsWith(".")) d = d.substring(0, d.length() - 1);
        int i = 0;
        while (true) {
            String[] hit = m.get(d.substring(i));
            if (hit != null) return hit;
            int dot = d.indexOf('.', i);
            if (dot < 0 || d.indexOf('.', dot + 1) < 0) return null; // stop before the bare TLD
            i = dot + 1;
        }
    }
}
