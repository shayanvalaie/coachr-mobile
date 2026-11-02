import { useRef, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet } from "react-native";
import { AppText, Button, Input, Sheet } from "../ui";
import { backendClient } from "../../lib/backend/client";
import { space } from "../../theme/tokens";

type Props = { onClose: () => void };

export default function DeleteAccountSheet({ onClose }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const remove = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await backendClient.auth.deleteAccount(password);
      if (result.error) throw result.error;
      setPassword("");
      onClose();
      Alert.alert(
        "Account deleted",
        result.cleanupError
          ? "Your account and its private data were deleted. Some data could not be cleared from this device, but saved credentials can no longer access the deleted account. Apple subscription billing is not canceled."
          : "Your account and its private data were deleted. Remember: any Apple subscription must be canceled separately in App Store settings.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete your account. Please try again.");
      setBusy(false);
      submitting.current = false;
    }
  };

  const confirm = () => {
    if (!password || submitting.current) return;
    Alert.alert("Permanently delete account?", "This cannot be undone. Your Apple subscription will not be canceled.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: () => { void remove(); } },
    ]);
  };

  return (
    <Sheet visible keyboard title="Delete account" onClose={() => { if (!submitting.current) onClose(); }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <AppText color="secondary">
          Permanently delete your account, teams, rosters, games, saved lineups, and personal requests. This cannot be undone. Shared leagues and rules remain without your personal data or creator attribution.
        </AppText>
        <AppText color="secondary">
          Deleting your account does not cancel your Apple subscription. Cancel it in your App Store subscription settings to stop future billing.
        </AppText>
        <Button label="Manage Apple subscription" variant="secondary" disabled={busy} onPress={() => {
          Linking.openURL("https://apps.apple.com/account/subscriptions").catch(() => {
            setError("Unable to open subscriptions. Open Settings > your name > Subscriptions to cancel your Apple plan.");
          });
        }} />
        <Input label="Current password" accessibilityLabel="Current password" value={password}
          onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="current-password"
          autoCapitalize="none" autoCorrect={false} editable={!busy} returnKeyType="done" onSubmitEditing={confirm} />
        {error ? <AppText color="danger" accessibilityLiveRegion="polite">{error}</AppText> : null}
        <Button label="Delete account" variant="danger" disabled={!password} loading={busy} onPress={confirm} />
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({ content: { gap: space.md, paddingBottom: space.sm } });
