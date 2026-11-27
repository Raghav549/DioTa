# Methods called from JavaScript must keep their names.
-keepclassmembers class app.diota.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
