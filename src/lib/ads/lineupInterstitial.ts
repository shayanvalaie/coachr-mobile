import { Platform } from "react-native";
import { getAdAuthorization, isAdAuthorizationCurrent, subscribeAdPolicy } from "./policy";

export async function presentLineupInterstitial(isPro = false): Promise<void> {
  if (isPro) return;
  const authorization = getAdAuthorization();
  if (!authorization) return;
  const { sdk } = authorization;
  const configured = Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID
    : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID;
  const unitId = configured || (__DEV__ ? sdk.TestIds.INTERSTITIAL : null);
  if (!unitId) return;
  await new Promise<void>(resolve => {
    const cleanup: Array<() => void> = [];
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timeout !== null) clearTimeout(timeout);
      cleanup.forEach(remove => remove());
      resolve();
    };
    try {
      const ad = sdk.InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
      cleanup.push(subscribeAdPolicy(() => { if (!isAdAuthorizationCurrent(authorization)) finish(); }));
      cleanup.push(ad.addAdEventListener(sdk.AdEventType.LOADED, () => {
        if (finished || !isAdAuthorizationCurrent(authorization)) { finish(); return; }
        void ad.show().catch(finish);
      }));
      cleanup.push(ad.addAdEventListener(sdk.AdEventType.CLOSED, finish));
      cleanup.push(ad.addAdEventListener(sdk.AdEventType.ERROR, finish));
      timeout = setTimeout(finish, 6000);
      if (!isAdAuthorizationCurrent(authorization)) { finish(); return; }
      ad.load();
    } catch { finish(); }
  });
}
