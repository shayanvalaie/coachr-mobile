import { Platform } from "react-native";
import { devProOverride } from "../proAccess";

type AdEventTypeShape = {
  LOADED: string;
  CLOSED: string;
  ERROR: string;
};

type InterstitialInstance = {
  load: () => void;
  show: () => Promise<void>;
  addAdEventListener: (
    type: string,
    listener: (...args: unknown[]) => void,
  ) => () => void;
};

type MobileAdsModuleShape = {
  InterstitialAd?: {
    createForAdRequest: (
      adUnitId: string,
      options?: { requestNonPersonalizedAdsOnly?: boolean },
    ) => InterstitialInstance;
  };
  AdEventType?: AdEventTypeShape;
  TestIds?: {
    INTERSTITIAL?: string;
  };
};

let mobileAdsModule: MobileAdsModuleShape | null = null;
try {
  mobileAdsModule = require("react-native-google-mobile-ads") as MobileAdsModuleShape;
} catch (_err) {
  mobileAdsModule = null;
}

const ADS_MODULE_AVAILABLE =
  process.env.EXPO_PUBLIC_ENABLE_ADS === "true" && !!mobileAdsModule;

const getLineupInterstitialUnitId = (): string | null => {
  const testUnitId = mobileAdsModule?.TestIds?.INTERSTITIAL ?? null;
  const configuredUnitId =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_LINEUP_INTERSTITIAL_IOS
      : Platform.OS === "android"
        ? process.env.EXPO_PUBLIC_LINEUP_INTERSTITIAL_ANDROID
        : null;

  if (configuredUnitId && configuredUnitId.trim().length > 0) {
    return configuredUnitId.trim();
  }

  return __DEV__ ? testUnitId : null;
};

export const presentLineupInterstitial = async (
  isPro = devProOverride,
): Promise<void> => {
  if (!ADS_MODULE_AVAILABLE || isPro) return;

  const InterstitialAd = mobileAdsModule?.InterstitialAd;
  const AdEventType = mobileAdsModule?.AdEventType;
  const adUnitId = getLineupInterstitialUnitId();

  if (!InterstitialAd || !AdEventType || !adUnitId) return;

  const interstitial = InterstitialAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
  });

  await new Promise<void>((resolve) => {
    let settled = false;
    const unsubscribers: Array<() => void> = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      resolve();
    };

    unsubscribers.push(
      interstitial.addAdEventListener(AdEventType.LOADED, () => {
        interstitial.show().catch(() => {
          finish();
        });
      }),
    );
    unsubscribers.push(interstitial.addAdEventListener(AdEventType.CLOSED, finish));
    unsubscribers.push(interstitial.addAdEventListener(AdEventType.ERROR, finish));

    const timeoutId = setTimeout(finish, 6000);
    unsubscribers.push(() => clearTimeout(timeoutId));

    try {
      interstitial.load();
    } catch (_err) {
      finish();
    }
  });
};
