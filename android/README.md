# DioTa Android app

A small Android app that opens the DioTa website (`https://dio-ta.vercel.app`) and adds the phone features
a website can't have. GitHub Actions builds it. You don't need to build anything yourself.

## Download

- **Latest build:** the `android-latest` release, file `DioTa.apk`
  (`https://github.com/Raghav549/DioTa/releases/download/android-latest/DioTa.apk`). This is updated on every push to `main` that changes `android/`.
- **Any build:** GitHub → **Actions** → **Android app** → open a run → **Artifacts** → `DioTa-android-apk` (a zip file with `DioTa.apk` inside).
- **Build now:** Actions → Android app → **Run workflow**. You can enter a different website URL here.

To install, open `DioTa.apk` on the phone. If Android asks, allow "Install unknown apps" for your browser or file manager. Needs Android 10 or newer.

## What the app does (all real, on the phone)

| Feature | Android API | Permission |
| --- | --- | --- |
| List installed apps and the permissions each one has **actually been granted** | `PackageManager` | `QUERY_ALL_PACKAGES` (given at install) |
| Mobile + Wi-Fi data used per app (last 30 days), last time used | `NetworkStatsManager`, `UsageStatsManager` | Usage access (Settings) |
| **Block an app's internet** and count its blocked connection attempts | `VpnService` (local only: the blocked apps' packets are dropped, nothing is forwarded) | VPN consent dialog |
| Permission alerts | Notifications | `POST_NOTIFICATIONS` |
| Keep the firewall running | Battery optimisation exemption, restart after boot | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| Profile photo from camera or gallery | `ACTION_IMAGE_CAPTURE`, `ACTION_GET_CONTENT` | `CAMERA`, photos |
| Data export saved to `Download/DioTa` | `MediaStore.Downloads` | none |

After you sign in for the first time, the app shows a **Phone access** screen that asks for each permission and explains why.
You can open it again any time from Profile → Phone access.

The website talks to the app through `window.DioTaNative` (see `src/lib/native.ts`). It only works for pages from the
DioTa website. Links to other sites open in the browser.

Only one VPN can be active on Android at a time. If you turn on another VPN, DioTa's firewall stops. Open DioTa again to turn it back on.

## Signing (optional, recommended)

If you don't add a key, builds are signed with a debug key that is saved in the Actions cache, so new builds install over old ones.
For a permanent key, add these repository secrets (Settings → Secrets and variables → Actions):

- `ANDROID_KEYSTORE_BASE64`: a PKCS12 keystore, base64-encoded
- `ANDROID_KEYSTORE_PASSWORD`: its password
- `ANDROID_KEY_ALIAS`: the key alias

One way to create the keystore (any computer with OpenSSL):

```sh
openssl req -x509 -newkey rsa:3072 -keyout key.pem -out cert.pem -days 10950 -nodes -subj "/CN=DioTa"
openssl pkcs12 -export -inkey key.pem -in cert.pem -name dioTa -out release.p12   # choose a password
base64 -w0 release.p12   # paste this into ANDROID_KEYSTORE_BASE64; alias = dioTa
```

If you switch from the debug key to your own key, uninstall the old app once before you install the new one.

To make the app open a different website, set the repository variable `DIOTA_URL`, or enter it when you run the workflow by hand.
