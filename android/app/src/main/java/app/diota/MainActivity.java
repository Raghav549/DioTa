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
import android.provider.MediaStore;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
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
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * The DioTa Android app: a WebView around the DioTa website plus a native bridge
 * ({@link NativeBridge}) that gives the website real phone data and the firewall.
 */
public class MainActivity extends Activity {
    static final int REQ_PERMS = 41;
    static final int REQ_VPN = 42;
    static final int REQ_SETTINGS = 43;
    static final int REQ_FILE = 44;

    private WebView web;
    private View offline;
    private ProgressBar progress;
    private NativeBridge bridge;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private Uri siteUri;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        siteUri = Uri.parse(BuildConfig.SITE_URL);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.bg));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        root.addView(progress, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4), Gravity.TOP));

        offline = buildOfflineView();
        offline.setVisibility(View.GONE);
        root.addView(offline, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Edge-to-edge (enforced on Android 15): keep content clear of the status bar, nav bar and keyboard.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);

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

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, false);

        bridge = new NativeBridge(this, web);
        web.addJavascriptInterface(bridge, "DioTaNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(BuildConfig.SITE_URL + "/home");
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
            progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            bridge.setPageTrusted(isTrusted(Uri.parse(url)));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                offline.setVisibility(View.VISIBLE);
                progress.setVisibility(View.GONE);
            }
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int p) {
            if (p >= 100) progress.setVisibility(View.GONE);
        }

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
        box.setBackgroundColor(getColor(R.color.bg));
        box.setClickable(true);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(getColor(R.color.fg));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView body = new TextView(this);
        body.setText(R.string.offline_body);
        body.setTextColor(getColor(R.color.fg));
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
            String url = web.getUrl();
            if (url == null || !isTrusted(Uri.parse(url))) web.loadUrl(BuildConfig.SITE_URL + "/home");
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
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        bridge.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        bridge.shutdown();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMS) bridge.onPermissionsResult(permissions, grantResults);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) finishFileChooser(resultCode, data);
        else if (requestCode == REQ_VPN) bridge.onVpnConsent(resultCode == RESULT_OK);
        else if (requestCode == REQ_SETTINGS) bridge.onSettingsReturned();
    }
}
