package com.google.android.wearable.compat;

import android.app.Activity;
import android.os.Bundle;

/**
 * A stand-in for the Wear OS system shared library ("com.google.android.wearable"),
 * which a real watch provides at runtime and Robolectric's phone framework doesn't.
 * androidx.wear's AmbientLifecycleObserver calls into it from onCreate. Screenshot
 * use only: it never enters ambient on its own; the test calls the activity's
 * ambient callback directly for the ambient screen.
 */
public class WearableActivityController {
  public static final String EXTRA_BURN_IN_PROTECTION = "com.google.android.wearable.compat.extra.BURN_IN_PROTECTION";
  public static final String EXTRA_LOWBIT_AMBIENT = "com.google.android.wearable.compat.extra.LOWBIT_AMBIENT";

  public abstract static class AmbientCallback {
    public void onEnterAmbient(Bundle ambientDetails) {}
    public void onUpdateAmbient() {}
    public void onExitAmbient() {}
    public void onInvalidateAmbientOffload() {}
  }

  public WearableActivityController(String tag, Activity activity, AmbientCallback callback) {}

  public void onCreate() {}
  public void onResume() {}
  public void onPause() {}
  public void onStop() {}
  public void onDestroy() {}
  public void setAmbientEnabled() {}
  public void setAutoResumeEnabled(boolean enabled) {}
  public void setAmbientOffloadEnabled(boolean enabled) {}
  public boolean isAmbient() { return false; }
  public boolean isAmbientEnabled() { return true; }
}
