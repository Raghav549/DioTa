package app.diota;

import android.Manifest;
import android.app.AppOpsManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.net.VpnService;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * window.DioTaNative.call(id, method, argsJson) -> window.__dioTaResolve(id, ok, payload).
 * See src/lib/native.ts for the JavaScript side. Only the DioTa website can use it.
 */
public class NativeBridge {
    private final MainActivity activity;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean pageTrusted = false;

    /** The one permission/settings flow in progress (Android shows one at a time). */
    private String pendingId;
    private String pendingName;
    private boolean pendingWaitsForResume;
    /** setBlocked / setShield waiting for the VPN consent dialog. */
    private String vpnPendingId;
    private boolean vpnPendingIsBlock;
    private Set<String> vpnPendingPackages;
    private Set<String> vpnPreviousPackages;

    NativeBridge(MainActivity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    void setPageTrusted(boolean trusted) {
        pageTrusted = trusted;
    }

    void shutdown() {
        worker.shutdownNow();
    }

    @JavascriptInterface
    public void call(final String id, final String method, final String argsJson) {
        if (!pageTrusted || id == null || id.length() > 64) return;
        final JSONObject args;
        try {
            args = argsJson == null || argsJson.isEmpty() ? new JSONObject() : new JSONObject(argsJson);
        } catch (JSONException e) {
            reject(id, "bad_args");
            return;
        }
        switch (method == null ? "" : method) {
            case "status":
                worker.execute(() -> resolveSafe(id, this::status));
                break;
            case "listApps":
                worker.execute(() -> resolveSafe(id, () -> PhoneData.listApps(activity, args.optBoolean("includeSystem"), args.optBoolean("icons"), stringSet(args.optJSONArray("packages")))));
                break;
            case "firewall":
                worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
                break;
            case "request":
                main.post(() -> request(id, args.optString("name")));
                break;
            case "setBlocked":
                main.post(() -> setBlocked(id, stringSet(args.optJSONArray("packages"))));
                break;
            case "setShield":
                main.post(() -> setShield(id, args.optBoolean("on"), args.optBoolean("ask", true)));
                break;
            case "flushIntercepts":
                worker.execute(() -> resolveSafe(id, () -> new JSONObject().put("queued", InterceptStore.get(activity).flushNow())));
                break;
            case "openAppSettings":
                main.post(() -> openAppSettings(id, args.optString("pkg")));
                break;
            case "notify":
                worker.execute(() -> resolveSafe(id, () -> notify(args.optString("title"), args.optString("body"))));
                break;
            case "saveFile":
                worker.execute(() -> resolveSafe(id, () -> saveFile(args.optString("name"), args.optString("mime"), args.optString("base64"))));
                break;
            default:
                reject(id, "unknown_method");
        }
    }

    // ---------- results ----------

    interface Work {
        JSONObject run() throws Exception;
    }

    private void resolveSafe(String id, Work w) {
        try {
            resolve(id, w.run());
        } catch (SecurityException e) {
            reject(id, "no_permission");
        } catch (Exception e) {
            reject(id, e.getMessage() == null ? "native_error" : e.getMessage());
        }
    }

    private void resolve(String id, JSONObject payload) {
        send(id, true, payload.toString());
    }

    private void reject(String id, String message) {
        send(id, false, JSONObject.quote(message));
    }

    private void send(String id, boolean ok, String payloadJs) {
        final String js = "window.__dioTaResolve&&window.__dioTaResolve(" + JSONObject.quote(id) + "," + ok + "," + payloadJs + ")";
        main.post(() -> {
            if (pageTrusted) web.evaluateJavascript(js, null);
        });
    }

    private static Set<String> stringSet(JSONArray a) {
        if (a == null) return null;
        Set<String> out = new HashSet<>();
        for (int i = 0; i < a.length() && i < 2000; i++) {
            String s = a.optString(i, null);
            if (s != null && !s.isEmpty() && s.length() <= 200) out.add(s);
        }
        return out;
    }

    // ---------- status & permissions ----------

    boolean hasUsageAccess() {
        AppOpsManager ops = (AppOpsManager) activity.getSystemService(android.content.Context.APP_OPS_SERVICE);
        int mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), activity.getPackageName());
        if (mode == AppOpsManager.MODE_DEFAULT) return activity.checkSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED;
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private boolean granted(String perm) {
        return activity.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean notificationsOn() {
        NotificationManager nm = activity.getSystemService(NotificationManager.class);
        boolean enabled = nm != null && nm.areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= 33) return enabled && granted(Manifest.permission.POST_NOTIFICATIONS);
        return enabled;
    }

    private boolean photosOn() {
        if (Build.VERSION.SDK_INT >= 34) return granted(Manifest.permission.READ_MEDIA_IMAGES) || granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
        if (Build.VERSION.SDK_INT >= 33) return granted(Manifest.permission.READ_MEDIA_IMAGES);
        return granted(Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    private boolean batteryOn() {
        PowerManager pm = activity.getSystemService(PowerManager.class);
        return pm != null && pm.isIgnoringBatteryOptimizations(activity.getPackageName());
    }

    JSONObject status() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("usage", hasUsageAccess());
        o.put("notifications", notificationsOn());
        o.put("vpn", VpnService.prepare(activity) == null);
        o.put("battery", batteryOn());
        o.put("camera", granted(Manifest.permission.CAMERA));
        o.put("photos", photosOn());
        o.put("apps", Build.VERSION.SDK_INT < 30 || granted(Manifest.permission.QUERY_ALL_PACKAGES));
        o.put("firewallRunning", FirewallService.isRunning());
        o.put("shield", Firewall.shield(activity));
        o.put("shieldRunning", FirewallService.isShieldRunning());
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("version", BuildConfig.VERSION_NAME);
        return o;
    }

    private String[] runtimePermsFor(String name) {
        switch (name) {
            case "camera":
                return new String[]{Manifest.permission.CAMERA};
            case "photos":
                if (Build.VERSION.SDK_INT >= 34) return new String[]{Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED};
                if (Build.VERSION.SDK_INT >= 33) return new String[]{Manifest.permission.READ_MEDIA_IMAGES};
                return new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
            case "notifications":
                return Build.VERSION.SDK_INT >= 33 ? new String[]{Manifest.permission.POST_NOTIFICATIONS} : null;
            default:
                return null;
        }
    }

    private void request(String id, String name) {
        if (pendingId != null) {
            // A previous dialog was abandoned; answer it so the page doesn't wait forever.
            resolveStatus(pendingId);
        }
        pendingId = id;
        pendingName = name;
        pendingWaitsForResume = false;
        try {
            switch (name) {
                case "camera":
                case "photos":
                case "notifications": {
                    String[] perms = runtimePermsFor(name);
                    if (perms != null && !allGranted(perms)) {
                        activity.requestPermissions(perms, MainActivity.REQ_PERMS);
                        return;
                    }
                    if ("notifications".equals(name) && !notificationsOn()) {
                        openSettings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName()));
                        return;
                    }
                    finishPending();
                    return;
                }
                case "usage": {
                    if (hasUsageAccess()) {
                        finishPending();
                        return;
                    }
                    Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + activity.getPackageName()));
                    if (i.resolveActivity(activity.getPackageManager()) == null) i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
                    openSettings(i);
                    return;
                }
                case "battery": {
                    if (batteryOn()) {
                        finishPending();
                        return;
                    }
                    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + activity.getPackageName()));
                    if (i.resolveActivity(activity.getPackageManager()) == null) i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    openSettings(i);
                    return;
                }
                case "vpn": {
                    Intent consent = VpnService.prepare(activity);
                    if (consent == null) {
                        finishPending();
                        return;
                    }
                    activity.startActivityForResult(consent, MainActivity.REQ_VPN);
                    return;
                }
                default:
                    String pid = pendingId;
                    pendingId = null;
                    reject(pid, "unknown_permission");
            }
        } catch (ActivityNotFoundException e) {
            finishPending();
        }
    }

    private boolean allGranted(String[] perms) {
        for (String p : perms) if (granted(p)) return true; // any one is enough (photos: full or selected)
        return false;
    }

    private void openSettings(Intent i) {
        pendingWaitsForResume = true;
        activity.startActivityForResult(i, MainActivity.REQ_SETTINGS);
    }

    private void finishPending() {
        if (pendingId == null) return;
        String id = pendingId;
        pendingId = null;
        pendingName = null;
        pendingWaitsForResume = false;
        resolveStatus(id);
    }

    private void resolveStatus(String id) {
        worker.execute(() -> resolveSafe(id, this::status));
    }

    void onPermissionsResult(String[] permissions, int[] results) {
        if (pendingId == null) return;
        boolean anyGranted = false;
        for (int r : results) anyGranted |= r == PackageManager.PERMISSION_GRANTED;
        if (!anyGranted && permissions.length > 0 && !activity.shouldShowRequestPermissionRationale(permissions[0])) {
            // "Don't ask again" (or denied twice): Android won't show the dialog, so open the app's settings page.
            try {
                openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName())));
                return;
            } catch (ActivityNotFoundException ignored) {
            }
        }
        if (anyGranted && "notifications".equals(pendingName) && !notificationsOn()) {
            openSettings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName()));
            return;
        }
        finishPending();
    }

    void onSettingsReturned() {
        if (pendingWaitsForResume) finishPending();
    }

    void onResume() {
        // Some settings screens don't return a result; answer when the user comes back to the app.
        if (pendingWaitsForResume) main.postDelayed(() -> {
            if (pendingWaitsForResume) finishPending();
        }, 400);
    }

    // ---------- firewall ----------

    private void setBlocked(String id, Set<String> packages) {
        if (packages == null) packages = new HashSet<>();
        packages.remove(activity.getPackageName()); // never block DioTa itself
        Set<String> previous = Firewall.blocked(activity);
        Firewall.saveBlocked(activity, packages);
        if (!Firewall.wanted(activity)) {
            FirewallService.stop(activity);
            worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
            return;
        }
        Intent consent = VpnService.prepare(activity);
        if (consent != null) {
            if (packages.isEmpty()) {
                // Only the shield wants the VPN and it isn't allowed yet: nothing to start now.
                worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
                return;
            }
            if (vpnPendingId != null) reject(vpnPendingId, "cancelled");
            vpnPendingId = id;
            vpnPendingIsBlock = true;
            vpnPendingPackages = packages;
            vpnPreviousPackages = previous;
            try {
                activity.startActivityForResult(consent, MainActivity.REQ_VPN);
            } catch (ActivityNotFoundException e) {
                onVpnConsent(false);
            }
            return;
        }
        FirewallService.apply(activity);
        worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
    }

    void onVpnConsent(boolean ok) {
        if (vpnPendingId != null) {
            String id = vpnPendingId;
            if (ok) FirewallService.apply(activity);
            else if (vpnPendingIsBlock) Firewall.saveBlocked(activity, vpnPreviousPackages == null ? new HashSet<>() : vpnPreviousPackages);
            // (a declined shield stays wanted: it starts once the VPN is allowed on the phone access screen)
            vpnPendingId = null;
            vpnPendingIsBlock = false;
            vpnPendingPackages = null;
            vpnPreviousPackages = null;
            worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
        }
        if (pendingId != null && "vpn".equals(pendingName)) {
            if (ok && Firewall.wanted(activity)) FirewallService.apply(activity);
            finishPending();
        }
    }

    /** Tracker shield on/off (follows Protection). `ask` = may show the VPN permission dialog. */
    private void setShield(String id, boolean on, boolean ask) {
        boolean was = Firewall.shield(activity);
        Firewall.setShield(activity, on);
        if (!on) {
            if (Firewall.blocked(activity).isEmpty()) FirewallService.stop(activity);
            else if (was) FirewallService.apply(activity); // back to blocking only the chosen apps
            worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
            return;
        }
        Intent consent = VpnService.prepare(activity);
        if (consent != null) {
            if (!ask) {
                worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
                return;
            }
            if (vpnPendingId != null) reject(vpnPendingId, "cancelled");
            vpnPendingId = id;
            vpnPendingIsBlock = false;
            try {
                activity.startActivityForResult(consent, MainActivity.REQ_VPN);
            } catch (ActivityNotFoundException e) {
                onVpnConsent(false);
            }
            return;
        }
        if (!was || !FirewallService.isShieldRunning()) FirewallService.apply(activity);
        worker.execute(() -> resolveSafe(id, () -> Firewall.state(activity)));
    }

    // ---------- misc ----------

    private void openAppSettings(String id, String pkg) {
        if (pkg == null || !pkg.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+")) {
            reject(id, "bad_args");
            return;
        }
        try {
            activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
            resolveOk(id);
        } catch (ActivityNotFoundException e) {
            reject(id, "not_found");
        }
    }

    private void resolveOk(String id) {
        try {
            resolve(id, new JSONObject().put("ok", true));
        } catch (JSONException ignored) {
        }
    }

    static final String CHANNEL_ALERTS = "alerts";

    private JSONObject notify(String title, String body) throws Exception {
        if (!notificationsOn()) throw new Exception("no_permission");
        NotificationManager nm = activity.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ALERTS, activity.getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(activity, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(activity, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        android.app.Notification n = new android.app.Notification.Builder(activity, CHANNEL_ALERTS)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(clip(title, 120))
                .setContentText(clip(body, 400))
                .setStyle(new android.app.Notification.BigTextStyle().bigText(clip(body, 400)))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), n);
        return new JSONObject().put("ok", true);
    }

    private static String clip(String s, int n) {
        if (s == null) return "";
        return s.length() > n ? s.substring(0, n) : s;
    }

    /** Saves a file to Downloads/DioTa (MediaStore, no storage permission needed on Android 10+). */
    private JSONObject saveFile(String name, String mime, String base64) throws Exception {
        if (name == null || name.isEmpty()) name = "dioTa-file";
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (name.length() > 120) name = name.substring(name.length() - 120);
        if (mime == null || !mime.matches("[a-z]+/[a-z0-9.+-]+")) mime = "application/octet-stream";
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
        if (bytes.length > 50 * 1024 * 1024) throw new Exception("too_big");

        ContentResolver cr = activity.getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/DioTa");
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new Exception("save_failed");
        try (OutputStream out = cr.openOutputStream(uri)) {
            if (out == null) throw new Exception("save_failed");
            out.write(bytes);
        } catch (Exception e) {
            cr.delete(uri, null, null);
            throw e;
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
        cr.update(uri, done, null, null);

        String finalName = name;
        try (Cursor c = cr.query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) finalName = c.getString(0);
        }
        return new JSONObject().put("name", finalName).put("location", "Download/DioTa/" + finalName);
    }

    static List<String> list(Set<String> s) {
        return new ArrayList<>(s);
    }
}
