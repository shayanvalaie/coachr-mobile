import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

export const ORIENTATION_LOCK_PORTRAIT_UP = 3;
export const ORIENTATION_LOCK_LANDSCAPE = 5;

type ScreenOrientationNativeModule = {
  lockAsync?: (orientationLock: number) => Promise<void>;
};

const ScreenOrientationModule =
  requireOptionalNativeModule<ScreenOrientationNativeModule>(
    "ExpoScreenOrientation",
  );

// Best-effort orientation lock: the wider lineup editor runs in landscape,
// everything else in portrait. No-op on web or when the module is missing.
export const lockOrientation = async (lock: number) => {
  if (Platform.OS === "web") return;
  if (!ScreenOrientationModule?.lockAsync) return;
  try {
    await ScreenOrientationModule.lockAsync(lock);
  } catch (err) {
    if (__DEV__) console.log("[screen orientation]", err);
  }
};
