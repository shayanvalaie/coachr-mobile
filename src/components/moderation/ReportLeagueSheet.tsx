import { useRef, useState } from "react";
import { Linking, ScrollView } from "react-native";
import { AppPressable, AppText, Button, Input, Sheet, useToast } from "../ui";
import { ModerationApi, ReportReason } from "../../lib/moderation/contracts";
import { usePrivacy } from "../privacy/PrivacyProvider";
import { space } from "../../theme/tokens";
import { toError } from "../../lib/backend/utils";
const reasons: Array<{ value: ReportReason; label: string }> = [
  { value: "abusive", label: "Abusive or harassing" }, { value: "identifying", label: "Personal or identifying information" },
  { value: "unlawful", label: "Unlawful content" }, { value: "inappropriate", label: "Inappropriate content" }, { value: "other", label: "Other concern" },
];
export function ReportLeagueSheet({ visible, onClose, leagueId, revisionId, api }: {
  visible: boolean; onClose: () => void; leagueId: string; revisionId: string; api: ModerationApi;
}) {
  const privacy = usePrivacy();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const submit = async () => {
    const account = privacy.account;
    if (!account || !reason || pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      await api.reportLeague(leagueId, { revisionId, reason, message: message.trim() });
      if (!privacy.controller.isCurrentAccount(account)) return;
      toast.show({ message: "Report received. Our review team will inspect it.", type: "success" });
      onClose(); setMessage(""); setReason(null);
    } catch (err) {
      if (privacy.controller.isCurrentAccount(account)) setError(toError(err).message);
    } finally { pending.current = false; setBusy(false); }
  };
  return <Sheet visible={visible} onClose={onClose} title="Report league" keyboard>
    <ScrollView contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
      <AppText color="secondary">Choose a reason. Reporting requests a review and does not guarantee removal. You can report before blocking the publisher.</AppText>
      {reasons.map(item => <AppPressable key={item.value} onPress={() => setReason(item.value)} disabled={busy}
        accessibilityRole="radio" accessibilityState={{ checked: reason === item.value, disabled: busy }}
        style={{ minHeight: 48, justifyContent: "center" }}><AppText>{reason === item.value ? "● " : "○ "}{item.label}</AppText></AppPressable>)}
      <Input label="Additional details (optional)" value={message} onChangeText={setMessage} maxLength={1000} multiline editable={!busy} accessibilityLabel="Report details, up to 1000 characters" />
      {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
      <Button label="Submit report" loading={busy} disabled={!reason || busy} onPress={() => { void submit(); }} />
      <Button label="Contact support" variant="ghost" onPress={() => { void Linking.openURL("mailto:support@coachrapp.io"); }} />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </ScrollView>
  </Sheet>;
}
