import { useState } from "react";
import { PrivacySettings } from "../components/privacy/PrivacySettings";
import DeleteAccountSheet from "../components/auth/DeleteAccountSheet";
import { AppText, Button, ScreenContainer } from "../components/ui";
import { backendClient } from "../lib/backend/client";
import { space } from "../theme/tokens";

export default function RestrictedAccount() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signOut = async () => {
    const result = await backendClient.auth.signOut();
    if (result.error) setError(result.error.message);
  };
  return <ScreenContainer scroll contentStyle={{ gap: space.md }}>
    <AppText family="heading">Your account</AppText>
    <AppText>Coachr accounts are available from age 13. Your account is restricted. Privacy choices, support and account deletion remain available.</AppText>
    <PrivacySettings />
    <Button label="Sign out" variant="secondary" onPress={() => { void signOut(); }} />
    <Button label="Delete account" variant="secondary" onPress={() => setDeleting(true)} />
    {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
    {deleting ? <DeleteAccountSheet onClose={() => setDeleting(false)} /> : null}
  </ScreenContainer>;
}
