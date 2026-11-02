import { Linking, ScrollView } from "react-native";
import { AppText, Button, Sheet } from "../ui";
import { isEligible, PRIVACY_URL } from "../../lib/privacy/contracts";
import { usePrivacy } from "./PrivacyProvider";
import { PrivacyAgeChoice } from "./PrivacyAgeChoice";
import { space } from "../../theme/tokens";

export function AiDisclosure() {
  const { disclosure, state, busy, error, controller } = usePrivacy();
  return <Sheet visible={disclosure} onClose={controller.cancelPending} title="Allow rules processing?">
    <ScrollView contentContainerStyle={{ gap: space.md }}>
      <AppText>With your permission, Coachr sends your rules text, sport, field and period settings, and related rule-processing instructions to OpenAI to interpret rules, write summaries, and build or repair a lineup engine.</AppText>
      <AppText color="secondary">Processing can include generated code and sanitized test failures, using synthetic players. Ordinary lineup generation does not send your roster to OpenAI. Avoid putting player names or other personal details in your rules.</AppText>
      <AppText color="secondary">This choice applies to rules processing for your account. You can revoke it in Profile. Revocation stops future requests, but cannot recall a request already sent. You can cancel and keep your draft, or use existing approved rules without this permission.</AppText>
      <Button label="Read Privacy Policy" variant="ghost" onPress={() => { void Linking.openURL(PRIVACY_URL); }} />
      {!busy && !isEligible(state) ? <PrivacyAgeChoice /> : null}
      {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
      <Button label="Allow rules processing" loading={busy} disabled={busy || !isEligible(state)} onPress={() => { void controller.grantPending(); }} />
      {error ? <Button label="Retry privacy check" variant="secondary" onPress={() => { void controller.refresh(); }} /> : null}
      <Button label="Cancel and keep draft" variant="secondary" onPress={controller.cancelPending} />
    </ScrollView>
  </Sheet>;
}
