package app.diota;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.PowerManager;
import android.os.Process;

/**
 * Tells in which situation an app made a blocked attempt: right after you opened it ("launch"),
 * while you were using it ("foreground"), while it was in the background, or with the screen off.
 * Uses the screen state and Android's usage events (needs Usage access, which DioTa asks for on the
 * phone access screen). Without usage access it can still tell screen-off; otherwise "unknown".
 */
final class ForegroundTracker {
    private static final long LAUNCH_WINDOW_MS = 15_000;

    private final Context context;
    private final UsageStatsManager usm;
    private final PowerManager pm;
    private String fg;
    private long fgSince;
    private String pausedPkg;
    private long pausedAt;
    private long pausedSince;
    private long lastQuery;
    private long lastEvent;
    private boolean usage;
    private long usageCheckedAt;

    ForegroundTracker(Context c) {
        context = c.getApplicationContext();
        usm = context.getSystemService(UsageStatsManager.class);
        pm = context.getSystemService(PowerManager.class);
    }

    synchronized String trigger(String pkg, long now) {
        if (pm != null && !pm.isInteractive()) return "screen_off";
        if (!hasUsage(now)) return "unknown";
        refresh(now);
        if (fg == null) return "background";
        if (fg.equals(pkg)) return now - fgSince < LAUNCH_WINDOW_MS ? "launch" : "foreground";
        return "background";
    }

    private boolean hasUsage(long now) {
        if (now - usageCheckedAt < 10_000) return usage;
        usageCheckedAt = now;
        try {
            AppOpsManager ops = context.getSystemService(AppOpsManager.class);
            usage = ops != null && ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName()) == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            usage = false;
        }
        return usage;
    }

    private void refresh(long now) {
        if (usm == null || now - lastQuery < 1500) return;
        long from = lastQuery == 0 ? now - 30 * 60_000 : lastQuery - 3_000;
        lastQuery = now;
        UsageEvents events;
        try {
            events = usm.queryEvents(from, now);
        } catch (Exception e) {
            return;
        }
        if (events == null) return;
        UsageEvents.Event e = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            long ts = e.getTimeStamp();
            if (ts < lastEvent) continue; // already seen (windows overlap a little)
            lastEvent = ts;
            String p = e.getPackageName();
            if (p == null) continue;
            int type = e.getEventType();
            if (type == UsageEvents.Event.ACTIVITY_RESUMED) {
                if (p.equals(fg)) continue;
                if (p.equals(pausedPkg) && ts - pausedAt < 2_000) {
                    // Switching screens inside the same app is not a new launch.
                    fg = p;
                    fgSince = pausedSince;
                } else {
                    fg = p;
                    fgSince = ts;
                }
            } else if (type == UsageEvents.Event.ACTIVITY_PAUSED && p.equals(fg)) {
                pausedPkg = p;
                pausedAt = ts;
                pausedSince = fgSince;
                fg = null;
            }
        }
    }
}
