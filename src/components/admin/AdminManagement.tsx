import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { backendClient } from "../../lib/backend/client";
import { BackendAdminAccount } from "../../lib/backend/types";
import { space } from "../../theme/tokens";
import { AppText, Button, Card, Input, ListGroup, ListRow, SectionLabel } from "../ui";

const SEARCH_DELAY_MS = 250;

export default function AdminManagement() {
  const [admins, setAdmins] = useState<BackendAdminAccount[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BackendAdminAccount[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    try {
      setAdmins(await backendClient.listAdminAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admins.");
    }
  }, []);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  useEffect(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        setResults(await backendClient.searchAdminAccounts(term, { signal: controller.signal }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unable to search accounts.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const applyChange = async (email: string, change: (email: string) => Promise<BackendAdminAccount>, message: string) => {
    setBusyEmail(email);
    setError(null);
    setStatus(null);
    try {
      const updated = await change(email);
      setResults((current) => current.map((account) => (account.email === updated.email ? updated : account)));
      setStatus(message);
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update admin access.");
    } finally {
      setBusyEmail(null);
    }
  };

  const confirmGrant = (email: string) => Alert.alert(
    "Grant admin access?",
    `${email} will be able to manage league rules and toggle their own Pro access. They won't be able to create other admins.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Make admin",
        onPress: () => void applyChange(email, backendClient.grantAdminAccount,
          `${email} now has admin access. They can sign out and back in to see their admin tools.`),
      },
    ],
  );

  const confirmRevoke = (email: string) => Alert.alert(
    "Remove admin access?",
    `${email} will lose admin tools the next time their session refreshes.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void applyChange(email, backendClient.revokeAdminAccount, `${email} is no longer an admin.`),
      },
    ],
  );

  const resultAction = (account: BackendAdminAccount) => {
    if (account.isAdmin) return <AppText variant="caption" color="secondary">Admin</AppText>;
    if (!account.emailVerified) return <AppText variant="caption" color="secondary">Not verified</AppText>;
    return (
      <Button label="Make admin" size="sm" variant="secondary" loading={busyEmail === account.email}
        disabled={busyEmail !== null} onPress={() => confirmGrant(account.email)} />
    );
  };

  const adminAction = (account: BackendAdminAccount) => {
    if (!account.removable) return <AppText variant="caption" color="secondary">Built in</AppText>;
    return (
      <Button label="Remove" size="sm" variant="ghost" loading={busyEmail === account.email}
        disabled={busyEmail !== null} onPress={() => confirmRevoke(account.email)}
        accessibilityLabel={`Remove admin access for ${account.email}`} />
    );
  };

  const term = query.trim();

  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <AppText variant="bodyLg" family="heading">Manage admins</AppText>

        <SectionLabel>Current admins</SectionLabel>
        {admins === null ? (
          <AppText color="secondary">Loading admins…</AppText>
        ) : (
          <ListGroup>
            {admins.map((account) => (
              <ListRow key={account.email} title={account.email} right={adminAction(account)} />
            ))}
          </ListGroup>
        )}

        <SectionLabel>Add an admin</SectionLabel>
        <Input
          label="Search by email"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setError(null);
            setStatus(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Start typing an email"
          returnKeyType="search"
          accessibilityLabel="Search accounts by email"
        />
        {term.length >= 2 && !searching && results.length === 0 ? (
          <AppText color="secondary">No accounts match. They need to sign up first.</AppText>
        ) : null}
        {results.length > 0 ? (
          <ListGroup>
            {results.map((account) => (
              <ListRow key={account.email} title={account.email} right={resultAction(account)} />
            ))}
          </ListGroup>
        ) : null}

        {error ? <AppText color="danger" accessibilityRole="alert">{error}</AppText> : null}
        {status ? <AppText color="secondary" accessibilityLiveRegion="polite">{status}</AppText> : null}
      </View>
    </Card>
  );
}
