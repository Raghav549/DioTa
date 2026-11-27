package app.diota;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The DioTa browser: links opened with DioTa ("Open with" / default browser / shared links) load
 * here, full screen, with DioTa's protections on every page:
 *
 *  - The anti-fingerprinting shield (src/lib/data/privacy-shield.js) is put into each page's HTML
 *    before any of the page's own scripts (the page is fetched by the app, the script is inserted at
 *    the top of <head>, and the page's Content-Security-Policy is extended with the script's hash
 *    only). Pages that couldn't be fetched that way get it as soon as they start loading.
 *  - Requests to known tracker endpoints (src/lib/data/trackers.json) never leave the phone: the page
 *    gets an empty, successful answer ({"status":"ok","success":true}, an empty script or a blank
 *    image), so nothing breaks, and the attempt (with the data it carried in its URL) is recorded.
 *  - Every fingerprinting attempt is recorded under the page's host. Both go to the user's DioTa
 *    account (Vault, Activities) through InterceptStore, like the tracker shield's.
 *  - Global Privacy Control and Do Not Track headers on every page load, third-party cookies off,
 *    location and camera / microphone requests refused, no file access.
 */
public class BrowserActivity extends Activity {
    static final String LABEL = "DioTa browser";
    private static final String TRIGGER = "foreground";
    private static final Pattern HEAD = Pattern.compile("<head(\\s[^>]*)?>", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTML = Pattern.compile("<html(\\s[^>]*)?>", Pattern.CASE_INSENSITIVE);
    private static final Pattern FP_API = Pattern.compile("^[A-Za-z]{2,24}$");
    private static final byte[] GIF = Base64.decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", Base64.DEFAULT);
    private static final Map<String, String> PRIVACY_HEADERS = new HashMap<>();

    static {
        PRIVACY_HEADERS.put("Sec-GPC", "1");
        PRIVACY_HEADERS.put("DNT", "1");
    }

    private WebView web;
    private String shieldJs = "";
    private String shieldHash = "";
    private String userAgent = "";
    private final Map<String, Long> fpSeen = new ConcurrentHashMap<>();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        boolean dark = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).getBoolean(MainActivity.PREF_DARK, false);
        setTheme(dark ? R.style.AppTheme_Dark : R.style.AppTheme);
        super.onCreate(savedInstanceState);
        Trackers.load(this);
        loadShield();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(dark ? SplashView.BG_DARK : SplashView.BG_LIGHT);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSafeBrowsingEnabled(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        userAgent = s.getUserAgentString();

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, false);

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, ua, disposition, mime, length) -> openOutside(Uri.parse(url)));

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else open(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        open(intent);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void open(Intent intent) {
        if (intent == null || web == null) return;
        Uri u = intent.getData();
        if (u == null && Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null) {
                Matcher m = Pattern.compile("https?://\\S+").matcher(text);
                if (m.find()) u = Uri.parse(m.group());
            }
        }
        if (u == null || !isWeb(u)) {
            if (web.getUrl() == null) finish();
            return;
        }
        web.loadUrl(u.toString(), PRIVACY_HEADERS);
    }

    private static boolean isWeb(Uri u) {
        String s = u.getScheme();
        return s != null && (s.equalsIgnoreCase("https") || s.equalsIgnoreCase("http"));
    }

    private void openOutside(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    // ---------- the shield script ----------

    private void loadShield() {
        try (InputStream in = getAssets().open("privacy-shield.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            String src = out.toString("UTF-8").replace("</script", "<\\/script");
            shieldJs = "window.__dtFpLog=1;\n" + src;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(shieldJs.getBytes(StandardCharsets.UTF_8));
            shieldHash = "'sha256-" + Base64.encodeToString(digest, Base64.NO_WRAP) + "'";
        } catch (Exception e) {
            shieldJs = "";
            shieldHash = "";
        }
    }

    /** The page's HTML with the shield as the first thing in <head> (byte-exact otherwise). */
    private byte[] inject(byte[] html) {
        if (shieldJs.isEmpty()) return html;
        // ISO-8859-1 maps bytes 1:1, so the page's own encoding is left untouched.
        String s = new String(html, StandardCharsets.ISO_8859_1);
        int scan = Math.min(s.length(), 256 * 1024);
        String head = s.substring(0, scan);
        int at;
        Matcher m = HEAD.matcher(head);
        if (m.find()) at = m.end();
        else {
            Matcher h = HTML.matcher(head);
            at = h.find() ? h.end() : 0;
        }
        String tag = "<script>" + shieldJs + "</script>";
        String out = s.substring(0, at) + tag + s.substring(at);
        return out.getBytes(StandardCharsets.ISO_8859_1);
    }

    /** Adds the shield's hash to a Content-Security-Policy so the page's policy still allows it. */
    static String allowScript(String policy, String hash) {
        if (policy == null || hash.isEmpty()) return policy;
        String[] dirs = policy.split(";");
        boolean hasScript = false;
        for (String d : dirs) {
            String name = d.trim().split("\\s+")[0].toLowerCase(Locale.ROOT);
            if (name.equals("script-src") || name.equals("script-src-elem")) hasScript = true;
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < dirs.length; i++) {
            String d = dirs[i];
            String name = d.trim().split("\\s+")[0].toLowerCase(Locale.ROOT);
            if (name.equals("script-src") || name.equals("script-src-elem") || (name.equals("default-src") && !hasScript)) {
                d = addSource(d, hash);
            }
            if (i > 0) sb.append(';');
            sb.append(d);
        }
        return sb.toString();
    }

    private static String addSource(String dir, String hash) {
        String low = dir.toLowerCase(Locale.ROOT);
        // 'unsafe-inline' without nonces / hashes already allows inline scripts; a hash would turn it off.
        if (low.contains("'unsafe-inline'") && !low.contains("'nonce-") && !low.contains("'sha")) return dir;
        if (low.contains("'none'")) return dir.replaceAll("(?i)'none'", hash);
        return dir + " " + hash;
    }

    // ---------- requests ----------

    private static String header(WebResourceRequest r, String name) {
        Map<String, String> h = r.getRequestHeaders();
        if (h == null) return "";
        for (Map.Entry<String, String> e : h.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue() == null ? "" : e.getValue();
        }
        return "";
    }

    /** The empty, successful answer a blocked tracker request gets, in the form the page expects. */
    private static WebResourceResponse synthetic(WebResourceRequest r) {
        String accept = header(r, "Accept").toLowerCase(Locale.ROOT);
        String dest = header(r, "Sec-Fetch-Dest").toLowerCase(Locale.ROOT);
        String path = r.getUrl().getPath() == null ? "" : r.getUrl().getPath().toLowerCase(Locale.ROOT);
        String mime;
        byte[] body;
        if (dest.equals("image") || (accept.startsWith("image/") && !accept.contains("text/html")) || path.endsWith(".gif") || path.endsWith(".png")) {
            mime = "image/gif";
            body = GIF;
        } else if (dest.equals("script") || path.endsWith(".js")) {
            mime = "text/javascript";
            body = new byte[0];
        } else if (dest.equals("iframe") || dest.equals("document") || accept.contains("text/html")) {
            mime = "text/html";
            body = new byte[0];
        } else {
            mime = "application/json";
            body = "{\"status\":\"ok\",\"success\":true}".getBytes(StandardCharsets.UTF_8);
        }
        Map<String, String> h = new HashMap<>();
        String origin = header(r, "Origin");
        h.put("Access-Control-Allow-Origin", origin.isEmpty() ? "*" : origin);
        if (!origin.isEmpty()) h.put("Access-Control-Allow-Credentials", "true");
        h.put("Cache-Control", "no-store");
        return new WebResourceResponse(mime, "utf-8", 200, "OK", h, new ByteArrayInputStream(body));
    }

    /** Fetches a page (with the privacy headers and the browser's cookies) and puts the shield in. */
    private WebResourceResponse fetchPage(WebResourceRequest r) {
        String url = r.getUrl().toString();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            c.setConnectTimeout(15_000);
            c.setReadTimeout(30_000);
            Map<String, String> req = r.getRequestHeaders();
            boolean ua = false;
            if (req != null) {
                for (Map.Entry<String, String> e : req.entrySet()) {
                    String k = e.getKey();
                    if (k == null || e.getValue() == null) continue;
                    String lk = k.toLowerCase(Locale.ROOT);
                    // Compression is negotiated (and undone) by the connection itself.
                    if (lk.equals("accept-encoding") || lk.equals("cookie") || lk.equals("sec-gpc") || lk.equals("dnt")) continue;
                    if (lk.equals("user-agent")) ua = true;
                    c.setRequestProperty(k, e.getValue());
                }
            }
            if (!ua) c.setRequestProperty("User-Agent", userAgent);
            c.setRequestProperty("Sec-GPC", "1");
            c.setRequestProperty("DNT", "1");
            CookieManager cm = CookieManager.getInstance();
            String cookie = cm.getCookie(url);
            if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);

            int code = c.getResponseCode();
            Map<String, List<String>> fields = c.getHeaderFields();
            for (Map.Entry<String, List<String>> e : fields.entrySet()) {
                if (e.getKey() != null && e.getKey().equalsIgnoreCase("Set-Cookie") && e.getValue() != null) {
                    for (String v : e.getValue()) cm.setCookie(url, v);
                }
            }
            // Redirects (and anything unusual) are left to the WebView; the new address comes back here.
            if (code < 200 || code >= 300 && code < 400 || code > 599) {
                c.disconnect();
                return null;
            }

            String type = c.getContentType();
            String mime = "application/octet-stream";
            String charset = null;
            if (type != null) {
                String[] parts = type.split(";");
                mime = parts[0].trim().toLowerCase(Locale.ROOT);
                for (int i = 1; i < parts.length; i++) {
                    String p = parts[i].trim();
                    if (p.toLowerCase(Locale.ROOT).startsWith("charset=")) charset = p.substring(8).replace("\"", "").trim();
                }
            }
            boolean html = mime.equals("text/html") || mime.equals("application/xhtml+xml");

            Map<String, String> headers = new HashMap<>();
            for (Map.Entry<String, List<String>> e : fields.entrySet()) {
                String k = e.getKey();
                if (k == null || e.getValue() == null) continue;
                String lk = k.toLowerCase(Locale.ROOT);
                if (lk.equals("content-encoding") || lk.equals("content-length") || lk.equals("transfer-encoding")
                        || lk.equals("set-cookie") || lk.equals("connection") || lk.equals("keep-alive") || lk.equals("content-type")) continue;
                StringBuilder v = new StringBuilder();
                for (String part : e.getValue()) {
                    if (part == null) continue;
                    String val = html && (lk.equals("content-security-policy") || lk.equals("content-security-policy-report-only")) ? allowScript(part, shieldHash) : part;
                    if (v.length() > 0) v.append(", ");
                    v.append(val);
                }
                headers.put(k, v.toString());
            }

            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in == null) in = new ByteArrayInputStream(new byte[0]);
            String reason = c.getResponseMessage();
            if (reason == null || reason.trim().isEmpty()) reason = "OK";
            if (!html) return new WebResourceResponse(mime, charset, code, reason, headers, in);

            ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
            try (InputStream i = in) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = i.read(buf)) > 0) out.write(buf, 0, n);
            }
            return new WebResourceResponse(mime, charset, code, reason, headers, new ByteArrayInputStream(inject(out.toByteArray())));
        } catch (Exception e) {
            if (c != null) c.disconnect();
            return null; // the WebView loads it itself; the shield is then added as the page starts
        }
    }

    private void recordTracker(Uri u) {
        String host = u.getHost();
        if (host == null) return;
        String q = u.getEncodedQuery();
        String payload = q == null ? null : (u.getEncodedPath() + "?" + q);
        InterceptStore.get(this).record(getPackageName(), LABEL, host.toLowerCase(Locale.ROOT), TRIGGER, false, null, payload);
    }

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (u == null || !isWeb(u)) return null;
            String host = u.getHost();
            if (!r.isForMainFrame() && host != null && Trackers.match(host) != null) {
                recordTracker(u);
                return synthetic(r);
            }
            if (!"GET".equalsIgnoreCase(r.getMethod())) return null;
            String dest = header(r, "Sec-Fetch-Dest").toLowerCase(Locale.ROOT);
            boolean doc = r.isForMainFrame() || dest.equals("iframe") || dest.equals("document")
                    || (dest.isEmpty() && header(r, "Accept").toLowerCase(Locale.ROOT).startsWith("text/html"));
            return doc ? fetchPage(r) : null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (u == null || isWeb(u)) return false;
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("intent")) {
                try {
                    Intent i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                    String fallback = i.getStringExtra("browser_fallback_url");
                    i.setComponent(null);
                    i.setSelector(null);
                    i.addCategory(Intent.CATEGORY_BROWSABLE);
                    try {
                        startActivity(i);
                    } catch (ActivityNotFoundException e) {
                        if (fallback != null && isWeb(Uri.parse(fallback))) view.loadUrl(fallback, PRIVACY_HEADERS);
                    }
                } catch (Exception ignored) {
                }
                return true;
            }
            if (scheme.equals("javascript") || scheme.equals("file") || scheme.equals("content")) return true;
            openOutside(u);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            // Backup for pages the app couldn't fetch itself (it is a no-op where it already ran).
            if (!shieldJs.isEmpty()) view.evaluateJavascript(shieldJs, null);
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            String msg = m == null ? null : m.message();
            if (msg == null || !msg.startsWith("[dt-fp] ")) return super.onConsoleMessage(m);
            String api = msg.substring(8).trim();
            String page = web == null ? null : web.getUrl();
            String host = page == null ? null : Uri.parse(page).getHost();
            if (host == null || !FP_API.matcher(api).matches()) return true;
            host = host.toLowerCase(Locale.ROOT);
            // One record per page host and API per minute.
            String key = host + '|' + api;
            long now = System.currentTimeMillis();
            Long last = fpSeen.get(key);
            if (last != null && now - last < 60_000) return true;
            fpSeen.put(key, now);
            InterceptStore.get(BrowserActivity.this).record(getPackageName(), LABEL, host, TRIGGER, false, api, null);
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }
    }
}
