import React from "react";
import { Alert, SafeAreaView, StyleSheet } from "react-native";
import ProfileItem from "../components/ProfileItem";
import ProfileToggleItem from "../components/ProfileToggleItem";
import {
  AppText,
  Card,
  ScreenContainer,
  ScreenHeader,
} from "../components/ui";
import { safeSignOut } from "../lib/auth";
import { BackendSession } from "../lib/backend/types";
import { IAP_SKUS, useSubscription } from "../lib/iap";
import { ADMIN_EMAILS } from "../lib/proAccess";
import { theme } from "../theme/colors";
import { space } from "../theme/tokens";

type Props = {
  session: BackendSession;
  onOpenSubscribe: () => void;
};

const ProfileScreen = ({ session, onOpenSubscribe }: Props) => {
  const email = session.user.email;
  const {
    isPro,
    activeSku,
    products,
    restore,
    loading,
    clearSubscription,
    adminProEnabled,
    setAdminProEnabled,
  } = useSubscription();
  // Derived from the session prop, not the provider's async auth listener, so
  // the toggle renders deterministically. The server enforces admin on write.
  const isAdmin = !!email && ADMIN_EMAILS.has(email.toLowerCase());
  const isAdminUnlocked = isAdmin && adminProEnabled && isPro && !activeSku;
  const isDevUnlocked = __DEV__ && isPro && !activeSku;

  const planLabel = isPro
    ? isAdminUnlocked
      ? "Pro (Admin)"
      : isDevUnlocked
      ? "Pro (Dev unlock)"
      : activeSku === IAP_SKUS.ANNUAL
      ? "Pro Annual"
      : "Pro Monthly"
    : "Free";

  // Store-provided pricing; falls back to generic copy until products load.
  const monthly = products.find((p) => p.sku === IAP_SKUS.MONTHLY);
  const annual = products.find((p) => p.sku === IAP_SKUS.ANNUAL);
  const upgradeSubtitle =
    monthly && annual
      ? `${monthly.localizedPrice}/mo or ${annual.localizedPrice}/yr`
      : monthly
      ? `${monthly.localizedPrice}/mo`
      : annual
      ? `${annual.localizedPrice}/yr`
      : "Unlock all Pro features";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenContainer scroll contentStyle={styles.content}>
        <ScreenHeader title="Profile" />

        <Card variant="elevated">
          <AppText
            variant="caption"
            family="heading"
            color="accent"
            style={styles.eyebrow}
          >
            Account
          </AppText>
          <AppText variant="title" family="heading" style={styles.cardTitle}>
            Signed in as
          </AppText>
          <AppText variant="body" color="secondary">
            {email}
          </AppText>
        </Card>

        <ProfileItem
          title="Sign out"
          danger
          onPress={() => {
            safeSignOut().catch((err) => {
              if (__DEV__) console.log("[sign out error]", err);
            });
          }}
        />

        {isPro ? (
          <ProfileItem
            title="Subscription"
            subtitle={planLabel}
            onPress={onOpenSubscribe}
          />
        ) : (
          <ProfileItem
            title="Upgrade to Pro"
            subtitle={upgradeSubtitle}
            onPress={onOpenSubscribe}
          />
        )}

        <ProfileItem
          title="Restore purchases"
          subtitle="Recover a previous subscription"
          onPress={() => {
            if (!loading) restore();
          }}
        />

        {isAdmin && (
          <ProfileToggleItem
            title="Admin: Pro access"
            subtitle="Toggle all Pro features on/off"
            value={isPro}
            onValueChange={(enabled) => {
              setAdminProEnabled(enabled).catch((err) => {
                Alert.alert(
                  "Couldn't update Pro access",
                  err instanceof Error ? err.message : "Something went wrong.",
                );
              });
            }}
          />
        )}

        {__DEV__ && isPro && (
          <ProfileItem
            title="[DEV] Clear subscription"
            subtitle="Reset IAP state"
            danger
            onPress={() => clearSubscription()}
          />
        )}
      </ScreenContainer>
    </SafeAreaView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.bg.base,
  },
  content: {
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardTitle: {
    marginTop: space.xxs,
  },
});
