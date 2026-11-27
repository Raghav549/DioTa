package app.diota;

import android.app.AppOpsManager;
import android.app.usage.NetworkStats;
import android.app.usage.NetworkStatsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.ConnectivityManager;
import android.os.Build;
import android.os.Process;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Reads real information about the apps installed on this phone. */
final class PhoneData {
    private static final long DAY = 24L * 60 * 60 * 1000;
    private static final int ICON_PX = 64;

    private PhoneData() {
    }

    static boolean hasUsageAccess(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        int mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        if (mode == AppOpsManager.MODE_DEFAULT) return c.checkSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED;
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @SuppressWarnings("deprecation")
    private static List<PackageInfo> installed(PackageManager pm) {
        if (Build.VERSION.SDK_INT >= 33) return pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS));
        return pm.getInstalledPackages(PackageManager.GET_PERMISSIONS);
    }

    /**
     * @param includeSystem also list pre-installed system apps
     * @param icons         include each app's icon as a small PNG data URL
     * @param only          if not null, only these packages (system or not)
     */
    static JSONObject listApps(Context c, boolean includeSystem, boolean icons, Set<String> only) throws JSONException {
        PackageManager pm = c.getPackageManager();
        boolean usage = hasUsageAccess(c);
        long now = System.currentTimeMillis();
        long from = now - 30 * DAY;
        Map<Integer, Long> bytesByUid = usage ? trafficByUid(c, from, now) : null;
        Map<String, Long> lastUsed = usage ? lastUsed(c, from, now) : null;

        JSONArray out = new JSONArray();
        for (PackageInfo p : installed(pm)) {
            ApplicationInfo ai = p.applicationInfo;
            if (ai == null || p.packageName.equals(c.getPackageName())) continue;
            boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
            if (only != null) {
                if (!only.contains(p.packageName)) continue;
            } else {
                if (system && !includeSystem) continue;
                // Skip background-only components with no launcher icon unless the user asked for system apps.
                if (!includeSystem && pm.getLaunchIntentForPackage(p.packageName) == null) continue;
            }

            JSONObject o = new JSONObject();
            o.put("pkg", p.packageName);
            o.put("label", String.valueOf(ai.loadLabel(pm)));
            o.put("system", system);
            JSONArray granted = new JSONArray();
            if (p.requestedPermissions != null && p.requestedPermissionsFlags != null) {
                for (int i = 0; i < p.requestedPermissions.length && i < p.requestedPermissionsFlags.length; i++) {
                    if ((p.requestedPermissionsFlags[i] & PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0) granted.put(p.requestedPermissions[i]);
                }
            }
            o.put("granted", granted);
            o.put("installedAt", p.firstInstallTime);
            o.put("updatedAt", p.lastUpdateTime);
            if (bytesByUid != null) {
                Long b = bytesByUid.get(ai.uid);
                o.put("dataBytes", b == null ? 0 : b);
            } else {
                o.put("dataBytes", JSONObject.NULL);
            }
            Long lu = lastUsed == null ? null : lastUsed.get(p.packageName);
            o.put("lastUsed", lu == null || lu <= 0 ? JSONObject.NULL : lu);
            if (icons) {
                String icon = iconDataUrl(pm, ai);
                if (icon != null) o.put("icon", icon);
            }
            out.put(o);
        }
        return new JSONObject().put("apps", out);
    }

    /** Mobile + Wi-Fi bytes (sent + received) per app uid over the period. Needs usage access. */
    private static Map<Integer, Long> trafficByUid(Context c, long from, long to) {
        Map<Integer, Long> m = new HashMap<>();
        NetworkStatsManager nsm = c.getSystemService(NetworkStatsManager.class);
        if (nsm == null) return m;
        int[] types = {ConnectivityManager.TYPE_WIFI, ConnectivityManager.TYPE_MOBILE};
        for (int type : types) {
            try (NetworkStats stats = nsm.querySummary(type, null, from, to)) {
                NetworkStats.Bucket b = new NetworkStats.Bucket();
                while (stats.hasNextBucket()) {
                    stats.getNextBucket(b);
                    long total = b.getRxBytes() + b.getTxBytes();
                    Long prev = m.get(b.getUid());
                    m.put(b.getUid(), (prev == null ? 0 : prev) + total);
                }
            } catch (Exception ignored) {
                // e.g. no SIM, or this network type is not available on the device
            }
        }
        return m;
    }

    private static Map<String, Long> lastUsed(Context c, long from, long to) {
        Map<String, Long> m = new HashMap<>();
        UsageStatsManager usm = c.getSystemService(UsageStatsManager.class);
        if (usm == null) return m;
        try {
            Map<String, UsageStats> all = usm.queryAndAggregateUsageStats(from, to);
            for (Map.Entry<String, UsageStats> e : all.entrySet()) {
                UsageStats s = e.getValue();
                long t = s.getLastTimeUsed();
                if (Build.VERSION.SDK_INT >= 29) t = Math.max(t, s.getLastTimeVisible());
                // Ignore times before the window (some devices report 0 or boot time).
                if (t >= from && t <= to + DAY) m.put(e.getKey(), t);
            }
        } catch (Exception ignored) {
        }
        return m;
    }

    private static String iconDataUrl(PackageManager pm, ApplicationInfo ai) {
        try {
            Drawable d = ai.loadIcon(pm);
            Bitmap bmp = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bmp);
            d.setBounds(0, 0, ICON_PX, ICON_PX);
            d.draw(canvas);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, bos);
            bmp.recycle();
            return "data:image/png;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }
}
