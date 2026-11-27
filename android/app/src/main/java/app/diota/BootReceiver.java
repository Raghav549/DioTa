package app.diota;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;

/** Turns the tracker shield / firewall back on after a restart or an app update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        try {
            if (Firewall.wanted(context) && VpnService.prepare(context) == null) FirewallService.apply(context);
        } catch (Exception ignored) {
            // Starting may be refused in some background states; it starts again when DioTa is opened.
        }
    }
}
