package app.diota;

import android.content.Context;
import android.os.Process;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Blocked attempts recorded by the tracker shield, on their way to the user's DioTa account.
 *
 * Everything runs on one low-priority background thread (never the UI thread):
 *  1. attempts are grouped in memory (same app + endpoint + situation, counted),
 *  2. every few seconds the groups are written to a queue file encrypted with a key that lives in
 *     the Android Keystore (it never leaves the phone's secure hardware),
 *  3. the queue is sent to the account (/api/intercepts) using the app's signed-in session, and
 *     removed only after the server stored it. Offline or signed out: it waits and retries.
 */
final class InterceptStore {
    private static final String KEY_ALIAS = "dioTa.intercepts";
    private static final int MAX_QUEUED = 5000;
    private static final int CHUNK = 200;
    private static InterceptStore instance;

    private final Context app;
    private final File file;
    private final ScheduledExecutorService exec;
    private final Map<String, Agg> pending = new ConcurrentHashMap<>();
    private volatile boolean started = false;
    private long nextUploadAt = 0;
    private long backoffMs = 0;

    private static final class Agg {
        final String pkg, label, domain, trigger;
        final boolean app;
        long count, first, last;

        Agg(String pkg, String label, String domain, String trigger, boolean app, long now) {
            this.pkg = pkg;
            this.label = label;
            this.domain = domain;
            this.trigger = trigger;
            this.app = app;
            this.first = now;
        }
    }

    static synchronized InterceptStore get(Context c) {
        if (instance == null) instance = new InterceptStore(c.getApplicationContext());
        return instance;
    }

    private InterceptStore(Context app) {
        this.app = app;
        this.file = new File(app.getNoBackupFilesDir(), "intercepts.queue");
        this.exec = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(() -> {
                Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
                r.run();
            }, "dioTa-intercepts");
            t.setDaemon(true);
            return t;
        });
    }

    /** Starts the background cycle (idempotent). */
    void start() {
        if (started) return;
        synchronized (this) {
            if (started) return;
            started = true;
            exec.scheduleWithFixedDelay(this::cycleSafe, 2, 5, TimeUnit.SECONDS);
        }
    }

    /** Records one blocked attempt. Cheap and thread-safe: called from the DNS worker threads. */
    void record(String pkg, String label, String domain, String trigger, boolean wholeApp) {
        long now = System.currentTimeMillis();
        String key = pkg + '|' + domain + '|' + trigger + '|' + wholeApp;
        pending.compute(key, (k, a) -> {
            if (a == null) a = new Agg(pkg, label, domain, trigger, wholeApp, now);
            a.count++;
            a.last = now;
            return a;
        });
        start();
    }

    /** Sends everything now (the app was opened or a screen asked). Returns how many are still queued. */
    int flushNow() throws Exception {
        start();
        nextUploadAt = 0;
        backoffMs = 0;
        return exec.submit(() -> {
            cycle();
            return readQueue().size();
        }).get(25, TimeUnit.SECONDS);
    }

    private void cycleSafe() {
        try {
            cycle();
        } catch (Throwable ignored) {
            // Never let one failure stop the schedule.
        }
    }

    private void cycle() throws Exception {
        List<JSONObject> drained = drain();
        if (!drained.isEmpty()) appendQueue(drained);
        long now = System.currentTimeMillis();
        if (now < nextUploadAt || !file.exists() || file.length() == 0) return;
        List<JSONObject> queued = readQueue();
        if (queued.isEmpty()) return;
        List<JSONObject> left = new ArrayList<>();
        boolean failed = false;
        for (int i = 0; i < queued.size(); i += CHUNK) {
            List<JSONObject> chunk = queued.subList(i, Math.min(queued.size(), i + CHUNK));
            if (failed) {
                left.addAll(chunk);
                continue;
            }
            int code = upload(chunk);
            if (code >= 200 && code < 300) continue;
            if (code == 400 || code == 413) continue; // rejected as invalid: drop it, never retry forever
            failed = true;
            left.addAll(chunk);
        }
        writeQueue(left);
        if (failed) {
            backoffMs = backoffMs == 0 ? 15_000 : Math.min(backoffMs * 2, 5 * 60_000);
            nextUploadAt = now + backoffMs;
        } else {
            backoffMs = 0;
            nextUploadAt = 0;
        }
    }

    private List<JSONObject> drain() throws Exception {
        List<JSONObject> out = new ArrayList<>();
        for (String k : new ArrayList<>(pending.keySet())) {
            Agg a = pending.remove(k);
            if (a == null) continue;
            JSONObject o = new JSONObject();
            o.put("pkg", a.pkg);
            o.put("label", a.label);
            o.put("domain", a.domain);
            o.put("trigger", a.trigger);
            if (a.app) o.put("app", true);
            o.put("count", a.count);
            o.put("first", a.first);
            o.put("last", a.last);
            out.add(o);
        }
        return out;
    }

    // ---------- the encrypted queue file ----------

    private void appendQueue(List<JSONObject> events) throws Exception {
        JSONArray arr = new JSONArray();
        for (JSONObject e : events) arr.put(e);
        try (OutputStream out = new FileOutputStream(file, true)) {
            out.write(seal(arr.toString()).getBytes(StandardCharsets.US_ASCII));
            out.write('\n');
        }
    }

    private List<JSONObject> readQueue() {
        List<JSONObject> out = new ArrayList<>();
        if (!file.exists()) return out;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.US_ASCII))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isEmpty()) continue;
                try {
                    JSONArray arr = new JSONArray(open(line));
                    for (int i = 0; i < arr.length(); i++) out.add(arr.getJSONObject(i));
                } catch (Exception ignored) {
                    // unreadable line (e.g. the Keystore key was reset): skip it
                }
            }
        } catch (Exception ignored) {
        }
        // Keep the newest if the phone was offline for a very long time.
        if (out.size() > MAX_QUEUED) return new ArrayList<>(out.subList(out.size() - MAX_QUEUED, out.size()));
        return out;
    }

    private void writeQueue(List<JSONObject> events) throws Exception {
        if (events.isEmpty()) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            return;
        }
        File tmp = new File(file.getPath() + ".tmp");
        JSONArray arr = new JSONArray();
        for (JSONObject e : events) arr.put(e);
        try (OutputStream out = new FileOutputStream(tmp, false)) {
            out.write(seal(arr.toString()).getBytes(StandardCharsets.US_ASCII));
            out.write('\n');
        }
        if (!tmp.renameTo(file)) throw new Exception("queue_write_failed");
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
            return kg.generateKey();
        }
        return (SecretKey) ks.getKey(KEY_ALIAS, null);
    }

    /** AES-256-GCM with a Keystore key: base64(iv | ciphertext+tag). */
    private static String seal(String plain) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = c.getIV();
        byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        byte[] out = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(ct, 0, out, iv.length, ct.length);
        return Base64.encodeToString(out, Base64.NO_WRAP);
    }

    private static String open(String sealed) throws Exception {
        byte[] all = Base64.decode(sealed, Base64.NO_WRAP);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
        return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
    }

    // ---------- sending to the account ----------

    /** POSTs a chunk with the app's own session cookie. Returns the HTTP status (or -1 on network errors). */
    private int upload(List<JSONObject> chunk) {
        String base = BuildConfig.SITE_URL;
        String cookie;
        try {
            cookie = CookieManager.getInstance().getCookie(base);
        } catch (Throwable t) {
            return -1;
        }
        if (cookie == null || cookie.isEmpty()) return 401; // signed out: keep waiting
        HttpURLConnection con = null;
        try {
            JSONArray arr = new JSONArray();
            for (JSONObject e : chunk) arr.put(e);
            byte[] body = new JSONObject().put("events", arr).toString().getBytes(StandardCharsets.UTF_8);
            con = (HttpURLConnection) new URL(base + "/api/intercepts").openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(15_000);
            con.setReadTimeout(20_000);
            con.setDoOutput(true);
            con.setUseCaches(false);
            con.setInstanceFollowRedirects(false);
            con.setFixedLengthStreamingMode(body.length);
            con.setRequestProperty("Content-Type", "application/json");
            con.setRequestProperty("x-dt-csrf", "1");
            con.setRequestProperty("Origin", base);
            con.setRequestProperty("Cookie", cookie);
            con.setRequestProperty("User-Agent", "DioTaAndroid/" + BuildConfig.VERSION_NAME);
            try (OutputStream out = con.getOutputStream()) {
                out.write(body);
            }
            return con.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
