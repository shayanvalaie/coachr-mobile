import React from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import ProfileItem from "../components/ProfileItem";
import {
  AppText,
  Card,
  ScreenContainer,
  ScreenHeader,
} from "../components/ui";
import { safeSignOut } from "../lib/auth";
import { BackendSession } from "../lib/backend/types";
import { IAP_SKUS, useSubscription } from "../lib/iap";
import { theme } from "../theme/colors";
import { space } from "../theme/tokens";

type Props = {
  session: BackendSession;
  onClose: () => void;
  onOpenSubscribe: () => void;
};

const ProfileScreen = ({ session, onClose, onOpenSubscribe }: Props) => {
  const email = session.user.email;
  const { isPro, activeSku, restore, loading, clearSubscription } =
    useSubscription();
  const isDevUnlocked = __DEV__ && isPro && !activeSku;

  const planLabel = isPro
    ? isDevUnlocked
      ? "Pro (Dev unlock)"
      : activeSku === IAP_SKUS.ANNUAL
      ? "Pro Annual"
      : "Pro Monthly"
    : "Free";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenContainer scroll contentStyle={styles.content}>
        <ScreenHeader title="Profile" onBack={onClose} />

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
            subtitle="$4.99/mo or $49.99/yr"
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
