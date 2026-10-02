import { useState } from "react";
import { Alert, View } from "react-native";
import { backendClient } from "../../lib/backend/client";
import { BackendAdminAccount } from "../../lib/backend/types";
import { space } from "../../theme/tokens";
import { AppText, Button, Card, Input } from "../ui";

export default function AdminManagement() {
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState<BackendAdminAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const lookup = async () => {
    if (loading) return;
    setError(null);
    setStatus(null);
    setAccount(null);
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter the email they used to create their account.");
      return;
    }
    setLoading(true);
    try {
      setAccount(await backendClient.lookupAdminAccount(normalized));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to find account.");
    } finally {
      setLoading(false);
    }
  };

  const grant = async (targetEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      setAccount(await backendClient.grantAdminAccount(targetEmail));
      setStatus(`${targetEmail} now has admin access. They can sign out and back in to see their admin tools.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to grant admin access.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <AppText variant="bodyLg" family="heading">Manage admins</AppText>
        <AppText color="secondary">
          Find a tester by the email they signed up with, then grant admin access.
        </AppText>
        <Input
          label="Account email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setAccount(null);
            setError(null);
            setStatus(null);
          }}
          editable={!loading}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="tester@example.com"
          returnKeyType="search"
          onSubmitEditing={() => void lookup()}
          accessibilityLabel="Find an account by email"
        />
        <Button label="Find account" variant="secondary" onPress={() => void lookup()} loading={loading} />
        {account ? (
          <View style={{ gap: space.xs }}>
            <AppText family="heading">{account.email}</AppText>
            {account.isAdmin ? (
              <AppText color="secondary">Already an admin.</AppText>
            ) : !account.emailVerified ? (
              <AppText color="secondary">Ask this user to verify their email first, then find their account again.</AppText>
            ) : (
              <Button
                label="Make admin"
                disabled={loading}
                onPress={() => Alert.alert(
                  "Grant admin access?",
                  `${account.email} will be able to manage league rules and toggle their own Pro access. They won't be able to create other admins.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Make admin", onPress: () => void grant(account.email) },
                  ],
                )}
              />
            )}
          </View>
        ) : null}
        {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
        {status ? <AppText color="secondary" accessibilityLiveRegion="polite">{status}</AppText> : null}
      </View>
    </Card>
  );
}
