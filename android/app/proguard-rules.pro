# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# WebView <-> JS bridge: methods called via reflection from JS must survive
# shrinking/renaming, or every native call the web app makes silently breaks.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor core + bridge + all plugins (including Cordova-compat ones) are
# invoked via reflection by plugin name/method -- keep them and their
# annotations intact.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers @com.getcapacitor.annotation.CapacitorPlugin class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    public <methods>;
}
-keep class org.apache.cordova.** { *; }

# ML Kit (digital ink recognition) and Play Services use reflection heavily.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.**

# Keep line numbers for readable crash stack traces; hide the source file name.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
