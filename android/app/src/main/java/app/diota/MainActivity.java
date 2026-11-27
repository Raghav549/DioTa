package app.diota;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * The DioTa Android app: a WebView around the DioTa website plus a native bridge
 * ({@link NativeBridge}) that gives the website real phone data and the firewall.
 *
 * Launch: the window starts in the app's own background colour (no icon, no white), and the DioTa
 * splash ({@link SplashView}) is drawn natively in the very first frame. The WebView is created right
 * after that frame and loads the website behind the splash, which then fades away onto the screen
 * the website opened (Home when signed in, the intro for someone new, else sign-in). The page draws
 * edge to edge; the status/navigation bar sizes are handed to it as CSS variables.
 */
public class MainActivity extends Activity {
    /** Global Privacy Control and Do Not Track on the app's page loads. */
    private static final Map<String, String> PRIVACY_HEADERS = new HashMap<>();

    static {
        PRIVACY_HEADERS.put("Sec-GPC", "1");
        PRIVACY_HEADERS.put("DNT", "1");
    }

    static final int REQ_PERMS = 41;
    static final int REQ_VPN = 42;
    static final int REQ_SETTINGS = 43;
    static final int REQ_FILE = 44;
    static final int REQ_UPI = 45;

    /** The splash plays at least this long, like the website's (it starts leaving at 2.6 s). */
    private static final long SPLASH_MIN_MS = 2600;
    private static final long SPLASH_MAX_MS = 12000;
    static final String PREFS = "dioTa.ui";
    static final String PREF_DARK = "dark";

    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout content;
    private WebView web;
    private View offline;
    private SplashView splash;
    private NativeBridge bridge;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private Uri siteUri;
    private boolean dark;
    private int insetTop, insetBottom;
    private boolean resumed;
    private final ConcurrentLinkedQueue<JSONObject> live = new ConcurrentLinkedQueue<>();
    private boolean liveScheduled;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        dark = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_DARK, false);
        setTheme(dark ? R.style.AppTheme_Dark : R.style.AppTheme);
        super.onCreate(savedInstanceState);
        siteUri = Uri.parse(BuildConfig.SITE_URL);
        edgeToEdge();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(dark ? SplashView.BG_DARK : SplashView.BG_LIGHT);
        content = new FrameLayout(this);
        root.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        offline = buildOfflineView();
        offline.setVisibility(View.GONE);
        content.addView(offline, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // A new launch (not a rotation / return from the background): the splash, in the first frame.
        if (savedInstanceState == null) {
            splash = new SplashView(this, dark);
            root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            main.postDelayed(() -> hideSplash(0), SPLASH_MAX_MS); // never stuck on it
        }

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            applyInsets(insets);
            return WindowInsets.CONSUMED; // the WebView gets none: the page uses the CSS variables instead
        });
        setContentView(root);

        // Creating a WebView takes a moment on a cold start; doing it after the first frame is what
        // puts the splash on screen instantly.
        final Bundle saved = savedInstanceState;
        root.getViewTreeObserver().addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                root.getViewTreeObserver().removeOnPreDrawListener(this);
                main.post(() -> createWebView(saved));
                return true;
            }
        });
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void createWebView(Bundle savedInstanceState) {
        if (isFinishing() || isDestroyed() || web != null) return;
        web = new WebView(this);
        web.setBackgroundColor(dark ? SplashView.BG_DARK : SplashView.BG_LIGHT); // never a white page
        content.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " DioTaAndroid/" + BuildConfig.VERSION_NAME);
        s.setSafeBrowsingEnabled(true);
        // Keep the renderer at high priority while the app is in front, so taps and scrolling get frames first.
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, false);
        saveInsetsCookie();

        bridge = new NativeBridge(this, web);
        web.addJavascriptInterface(bridge, "DioTaNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        if (resumed) bridge.onResume();

        // launch=native: the website skips its own splash (this one already played) and opens the
        // right screen at once: Home when signed in, the intro for someone new, else sign-in.
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(BuildConfig.SITE_URL + "/?launch=native", PRIVACY_HEADERS);
    }

    // ---------- edge to edge ----------

    private void edgeToEdge() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.setStatusBarContrastEnforced(false);
        w.setNavigationBarContrastEnforced(false);
        WindowManager.LayoutParams a = w.getAttributes();
        a.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        w.setAttributes(a);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) w.setDecorFitsSystemWindows(false);
        applyBarIcons();
    }

    /** Dark status/navigation bar icons on the light theme, light icons on the dark one. */
    @SuppressWarnings("deprecation")
    private void applyBarIcons() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : light, light);
            }
        } else {
            int f = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (!dark) f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            w.getDecorView().setSystemUiVisibility(f);
        }
    }

    /** The website's theme (it tells us when it changes): bar icons, and the colours of the next launch. */
    void setAppearance(boolean isDark) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_DARK, isDark).apply();
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                getSplashScreen().setSplashScreenTheme(isDark ? R.style.AppTheme_Dark : R.style.AppTheme);
            } catch (Exception ignored) {
            }
        }
        if (isDark == dark) return;
        dark = isDark;
        applyBarIcons();
        int bg = dark ? SplashView.BG_DARK : SplashView.BG_LIGHT;
        View root = (View) content.getParent();
        if (root != null) root.setBackgroundColor(bg);
        if (web != null) web.setBackgroundColor(bg);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(bg));
    }

    @SuppressWarnings("deprecation")
    private void applyInsets(WindowInsets insets) {
        int left, right, top, bottom, ime;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets kb = insets.getInsets(WindowInsets.Type.ime());
            left = bars.left;
            right = bars.right;
            top = bars.top;
            bottom = bars.bottom;
            ime = kb.bottom;
        } else {
            left = insets.getSystemWindowInsetLeft();
            right = insets.getSystemWindowInsetRight();
            top = insets.getSystemWindowInsetTop();
            int b = insets.getSystemWindowInsetBottom();
            // Android 10 reports the keyboard as a tall bottom inset.
            boolean keyboard = b > getResources().getDisplayMetrics().heightPixels / 5;
            bottom = keyboard ? 0 : b;
            ime = keyboard ? b : 0;
        }
        // The keyboard pushes the page up (the page shrinks); the bars are drawn over by the page.
        content.setPadding(left, 0, right, ime > bottom ? ime : 0);
        int t = Math.round(top / getResources().getDisplayMetrics().density);
        int bt = ime > bottom ? 0 : Math.round(bottom / getResources().getDisplayMetrics().density);
        if (t != insetTop || bt != insetBottom) {
            insetTop = t;
            insetBottom = bt;
            saveInsetsCookie();
            pushInsets();
        }
    }

    /** The server renders the next page with the right spacing from the first paint (no jump). */
    private void saveInsetsCookie() {
        if (web == null) return;
        try {
            CookieManager.getInstance().setCookie(BuildConfig.SITE_URL,
                    "dt_insets=" + insetTop + "," + insetBottom + "; Path=/; Max-Age=31536000; Secure; SameSite=Lax");
        } catch (Exception ignored) {
        }
    }

    /** Live update (rotation, keyboard) for the page that is already open. */
    private void pushInsets() {
        if (web == null || bridge == null || !bridge.isPageTrusted()) return;
        web.evaluateJavascript("(function(d){d.classList.add('dt-app');d.style.setProperty('--dt-sat','" + insetTop
                + "px');d.style.setProperty('--dt-sab','" + insetBottom + "px')})(document.documentElement)", null);
    }

    // ---------- splash ----------

    /** The website has opened its first screen: let the splash finish, then fade it away. */
    void onWebReady() {
        if (splash == null) return;
        hideSplash(Math.max(0, SPLASH_MIN_MS - splash.elapsed()));
    }

    private void hideSplash(long delay) {
        final SplashView s = splash;
        if (s == null) return;
        main.postDelayed(() -> {
            if (splash != s) return;
            splash = null;
            s.leave(null);
        }, delay);
    }

    // ---------- blocked attempts, live ----------

    /** Called from the tracker shield's threads for every blocked attempt; delivered to the page at once. */
    void onAttempt(JSONObject e) {
        if (live.size() < 200) live.add(e);
        main.post(this::scheduleLive);
    }

    private void scheduleLive() {
        if (liveScheduled) return;
        liveScheduled = true;
        // Coalesce bursts (an app can make dozens of lookups at once) into one update per frame or so.
        main.postDelayed(() -> {
            liveScheduled = false;
            JSONArray arr = new JSONArray();
            JSONObject e;
            while ((e = live.poll()) != null && arr.length() < 50) arr.put(e);
            live.clear();
            if (arr.length() == 0 || web == null || bridge == null || !bridge.isPageTrusted()) return;
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('dt:intercepts',{detail:" + arr + "}))", null);
        }, 32);
    }

    /** Only the DioTa website itself may load inside the app (and use the bridge). */
    boolean isTrusted(Uri u) {
        if (u == null) return false;
        return "https".equals(u.getScheme()) && siteUri.getHost() != null && siteUri.getHost().equalsIgnoreCase(u.getHost())
                && (u.getPort() == -1 || u.getPort() == 443);
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (isTrusted(u)) return false;
            // Everything else (GitHub, mail, tel, other sites) opens outside the app.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            bridge.setPageTrusted(isTrusted(Uri.parse(url)));
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            pushInsets();
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            bridge.setPageTrusted(isTrusted(Uri.parse(url)));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pushInsets();
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                offline.setVisibility(View.VISIBLE);
                hideSplash(0);
            }
        }
    }

    private class Chrome extends WebChromeClient {
        /** <input type="file"> for the profile photo: gallery, plus the camera when allowed. */
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            cameraUri = null;

            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("image/*");
            Intent chooser = Intent.createChooser(pick, getString(R.string.choose_photo));

            if (checkSelfPermission(android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Images.Media.DISPLAY_NAME, "dioTa-photo-" + System.currentTimeMillis() + ".jpg");
                    v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/DioTa");
                    cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    if (cameraUri != null) {
                        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                    }
                } catch (Exception ignored) {
                    cameraUri = null;
                }
            }
            try {
                startActivityForResult(chooser, REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    private void finishFileChooser(int resultCode, Intent data) {
        if (fileCallback == null) return;
        Uri result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) result = data.getData();
            else result = cameraUri;
        }
        if (result == null && cameraUri != null) {
            try {
                getContentResolver().delete(cameraUri, null, null);
            } catch (Exception ignored) {
            }
        } else if (result != null && cameraUri != null && !result.equals(cameraUri)) {
            try {
                getContentResolver().delete(cameraUri, null, null);
            } catch (Exception ignored) {
            }
        }
        fileCallback.onReceiveValue(result == null ? null : new Uri[]{result});
        fileCallback = null;
        cameraUri = null;
    }

    private View buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        box.setBackgroundColor(dark ? SplashView.BG_DARK : SplashView.BG_LIGHT);
        box.setClickable(true);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(getColor(dark ? R.color.fg_dark : R.color.fg));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView body = new TextView(this);
        body.setText(R.string.offline_body);
        body.setTextColor(getColor(dark ? R.color.fg_dark : R.color.fg));
        body.setAlpha(0.65f);
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(8), 0, dp(24));
        box.addView(body);

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setAllCaps(false);
        retry.setTextColor(Color.WHITE);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(Color.parseColor("#0D0D0F"));
        bg.setCornerRadius(dp(28));
        retry.setBackground(bg);
        retry.setPadding(dp(32), dp(14), dp(32), dp(14));
        retry.setOnClickListener(v -> {
            offline.setVisibility(View.GONE);
            String url = web == null ? null : web.getUrl();
            if (web == null) return;
            if (url == null || !isTrusted(Uri.parse(url))) web.loadUrl(BuildConfig.SITE_URL + "/home", PRIVACY_HEADERS);
            else web.reload();
        });
        box.addView(retry, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return box;
    }

    int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (web != null) web.onResume();
        if (bridge != null) bridge.onResume();
        // Blocked attempts reach the open page the moment they happen.
        InterceptStore.setListener(this::onAttempt);
        // Send blocked attempts that waited while the app was closed (on the store's own thread).
        InterceptStore.get(this).flushAsync();
    }

    @Override
    protected void onPause() {
        resumed = false;
        InterceptStore.setListener(null);
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (bridge != null) bridge.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMS && bridge != null) bridge.onPermissionsResult(permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) finishFileChooser(resultCode, data);
        else if (bridge == null) return;
        else if (requestCode == REQ_VPN) bridge.onVpnConsent(resultCode == RESULT_OK);
        else if (requestCode == REQ_SETTINGS) bridge.onSettingsReturned();
        else if (requestCode == REQ_UPI) bridge.onUpiResult(resultCode, data);
    }
}
