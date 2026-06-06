import React from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ProfileItem from "../components/ProfileItem";
import { useSubscription, IAP_SKUS } from "../lib/iap";
import { safeSignOut } from "../lib/auth";
import { BackendSession } from "../lib/backend/types";
import { palette } from "../theme/colors";

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
      ? "Pro — Dev unlock"
      : activeSku === IAP_SKUS.ANNUAL
      ? "Pro — Annual"
      : "Pro — Monthly"
    : "Free";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Back"
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>Profile</Text>
          <Text style={styles.title}>Signed in as</Text>
          <Text style={styles.subtitle}>{email}</Text>
        </View>

        <ProfileItem
          title="Sign out"
          danger
          onPress={() => {
            safeSignOut().catch((err) => {
              console.log("[sign out error]", err);
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
      </ScrollView>
    </SafeAreaView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  headerRow: {
    marginBottom: 4,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  backText: {
    color: palette.text,
    fontWeight: "700",
  },
  container: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: palette.subtext,
    fontSize: 14,
  },
});
