import { useSyncExternalStore } from "react";
import { Linking, View } from "react-native";
import { AppText, Button, Card } from "../ui";
import { hasAiConsent, PRIVACY_URL, TERMS_URL } from "../../lib/privacy/contracts";
import { getAdPrivacyStatus, showAdPrivacyOptions, subscribeAdPolicy } from "../../lib/ads/policy";
import { usePrivacy } from "./PrivacyProvider";
import { space } from "../../theme/tokens";

export function PrivacySettings() {
  const { account, state, busy, error, controller, requireAiConsent } = usePrivacy();
  const ads = useSyncExternalStore(subscribeAdPolicy, getAdPrivacyStatus, getAdPrivacyStatus);
  return <Card><View style={{ gap: space.md }}>
    <AppText family="heading">Privacy and permissions</AppText>
    {state && state.aiConsent.required !== false ? <>
    <AppText family="heading">AI rules processing</AppText>
    <AppText color="secondary">{hasAiConsent(state) ? "Allowed for this account. You can stop future rules-processing requests at any time." : "OpenAI rules processing needs your permission. Existing approved rule selection remains available."}</AppText>
    <Button label={hasAiConsent(state) ? "Revoke rules-processing permission" : "Review rules-processing permission"} variant="secondary" disabled={busy || !account}
      onPress={() => { if (hasAiConsent(state)) void controller.revokeAiConsent(); else if (account) void requireAiConsent(account); }} />
    </> : null}
    {error ? <><AppText color="danger" accessibilityRole="alert">{error}</AppText><Button label="Reload privacy choices" variant="secondary" onPress={() => { void controller.refresh(); }} /></> : null}
    {ads.privacyOptionsRequired ? <Button label="Ad privacy options" variant="secondary" onPress={() => { void showAdPrivacyOptions(); }} /> : null}
    {ads.error ? <AppText color="secondary">{ads.error}</AppText> : null}
    <Button label="Privacy Policy" variant="ghost" onPress={() => { void Linking.openURL(PRIVACY_URL); }} />
    <Button label="Terms of Use" variant="ghost" onPress={() => { void Linking.openURL(TERMS_URL); }} />
    <Button label="Contact support" variant="ghost" onPress={() => { void Linking.openURL("mailto:support@coachrapp.io"); }} />
  </View></Card>;
}
