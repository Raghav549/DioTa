package app.diota;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

/** Stored firewall settings: which apps are blocked and how many connection attempts were stopped. */
final class Firewall {
    private static final String PREFS = "firewall";
    private static final String KEY_BLOCKED = "blocked";
    private static final String KEY_ATTEMPTS = "attempts";
    private static final Object LOCK = new Object();

    private Firewall() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Set<String> blocked(Context c) {
        return new HashSet<>(prefs(c).getStringSet(KEY_BLOCKED, new HashSet<>()));
    }

    static void saveBlocked(Context c, Set<String> packages) {
        prefs(c).edit().putStringSet(KEY_BLOCKED, new HashSet<>(packages)).apply();
    }

    static Map<String, Long> attempts(Context c) {
        Map<String, Long> out = new HashMap<>();
        try {
            JSONObject o = new JSONObject(prefs(c).getString(KEY_ATTEMPTS, "{}"));
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                out.put(k, o.optLong(k));
            }
        } catch (JSONException ignored) {
        }
        return out;
    }

    /** Adds new blocked-attempt counts (called by the firewall every few seconds). */
    static void addAttempts(Context c, Map<String, Long> add) {
        if (add.isEmpty()) return;
        synchronized (LOCK) {
            Map<String, Long> cur = attempts(c);
            for (Map.Entry<String, Long> e : add.entrySet()) {
                Long prev = cur.get(e.getKey());
                cur.put(e.getKey(), (prev == null ? 0 : prev) + e.getValue());
            }
            prefs(c).edit().putString(KEY_ATTEMPTS, new JSONObject(cur).toString()).apply();
        }
    }

    static JSONObject state(Context c) throws JSONException {
        JSONObject o = new JSONObject();
        o.put("packages", new JSONArray(blocked(c)));
        o.put("running", FirewallService.isRunning());
        JSONObject a = new JSONObject();
        for (Map.Entry<String, Long> e : attempts(c).entrySet()) a.put(e.getKey(), e.getValue());
        o.put("attempts", a);
        return o;
    }
}
