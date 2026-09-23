import { useCallback, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  AppText,
  Card,
  ListGroup,
  ListRow,
  PageHeader,
  ScreenContainer,
} from "../components/ui";
import { Feather } from "../icons";
import { backendClient } from "../lib/backend/client";
import { BackendSession } from "../lib/backend/types";
import { IAP_SKUS, useSubscription } from "../lib/iap";
import { theme, withAlpha } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { typeface } from "../theme/typography";
import { TeamRulesState } from "../types/rules";

type Props = {
  session: BackendSession;
  onOpenSubscribe: () => void;
  onOpenRules: () => void;
  onReplayTour: () => void;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "C";

const ProfileScreen = ({ session, onOpenSubscribe, onOpenRules, onReplayTour }: Props) => {
  const email = session.user.email ?? "";
  const {
    isPro,
    activeSku,
    products,
    restore,
    loading,
    clearSubscription,
    isAdmin,
    adminProEnabled,
    setAdminProEnabled,
  } = useSubscription();
  const [teamName, setTeamName] = useState("");
  const [rules, setRules] = useState<TeamRulesState | null>(null);

  // Refresh on focus so a league joined elsewhere shows up on "Team rules".
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const team = await backendClient.getMyTeam();
          if (cancelled) return;
          setTeamName(team.name);
          const teamRules = await backendClient.getTeamRules(team.id);
          if (!cancelled) setRules(teamRules);
        } catch (_err) {
          // Non-fatal: the rows fall back to neutral copy.
        }
      };
      void load();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Admin status comes from the server (allowlist + DB flag), surfaced on the
  // subscription status. The server also enforces admin on write.
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
    : "Free plan";

  // Store-provided pricing; falls back to generic copy until products load.
  const monthly = products.find((p) => p.sku === IAP_SKUS.MONTHLY);
  const annual = products.find((p) => p.sku === IAP_SKUS.ANNUAL);
  const priceLine =
    monthly && annual
      ? `${monthly.localizedPrice}/mo or ${annual.localizedPrice}/yr.`
      : monthly
        ? `${monthly.localizedPrice}/mo.`
        : annual
          ? `${annual.localizedPrice}/yr.`
          : "";

  const rulesValue = rules?.league
    ? rules.league.name
    : rules?.ruleset
      ? "Your rules"
      : "Not set";

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <PageHeader eyebrow="Profile" title="Coach" />

      <Card padding="none">
        <View style={styles.accountRow}>
          <View style={styles.avatar}>
            <AppText variant="bodyLg" family="display" color="accent">
              {initialsOf(teamName)}
            </AppText>
          </View>
          <View style={styles.accountText}>
            <AppText variant="bodyLg" family="heading" numberOfLines={1}>
              {teamName || "Your team"}
            </AppText>
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {email}
            </AppText>
          </View>
        </View>
      </Card>

      <Card
        variant="glass"
        radius="xl"
        padding="none"
        borderColor={theme.accent.subtleBorder}
        onPress={onOpenSubscribe}
        accessibilityLabel={isPro ? `${planLabel}. Manage subscription` : "Upgrade to Pro"}
      >
        <View style={styles.upgradeInner}>
          <View style={styles.planRow}>
            <Feather name="star" size={12} color={theme.accent.base} />
            <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
              {isPro ? "Coachr Pro" : planLabel}
            </AppText>
          </View>
          <AppText style={styles.upgradeTitle}>
            {isPro ? planLabel : "Upgrade to Pro"}
          </AppText>
          <AppText variant="body" color="secondary">
            {isPro
              ? "No ads, roster import, exports, and the full calendar. Manage or cancel in your App Store settings."
              : `No ads, roster import, exports, and the full calendar. ${priceLine}`.trim()}
          </AppText>
        </View>
      </Card>

      <ListGroup>
        <ListRow title="Team rules" value={rulesValue} onPress={onOpenRules} />
        <ListRow
          title="Restore purchases"
          onPress={() => {
            if (!loading) restore();
          }}
          busy={loading}
        />
        <ListRow title="Replay app tour" onPress={onReplayTour} />
        <ListRow
          title="Sign out"
          danger
          chevron={false}
          onPress={() => {
            backendClient.auth.signOut().then(({ error }) => {
              if (error && __DEV__) {
                console.log("[sign out] token revocation failed", error);
              }
            });
          }}
        />
      </ListGroup>

      {isAdmin || (__DEV__ && isPro) ? (
        <ListGroup>
          {isAdmin ? (
            <ListRow
              title="Admin: Pro access"
              subtitle="Toggle all Pro features on/off"
              chevron={false}
              right={
                <Switch
                  value={isPro}
                  onValueChange={(enabled) => {
                    setAdminProEnabled(enabled).catch((err) => {
                      Alert.alert(
                        "Couldn't update Pro access",
                        err instanceof Error ? err.message : "Something went wrong.",
                      );
                    });
                  }}
                  trackColor={{
                    false: theme.border.base,
                    true: withAlpha(theme.accent.base, 0.6),
                  }}
                  thumbColor={isPro ? theme.accent.base : theme.text.secondary}
                  ios_backgroundColor={theme.border.base}
                  accessibilityLabel="Admin: Pro access"
                />
              }
            />
          ) : null}
          {__DEV__ && isPro ? (
            <ListRow
              title="[DEV] Clear subscription"
              subtitle="Reset IAP state"
              danger
              onPress={() => clearSubscription()}
            />
          ) : null}
        </ListGroup>
      ) : null}
    </ScreenContainer>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  content: {
    gap: space.md,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm + 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  accountText: {
    flex: 1,
    gap: 2,
  },
  upgradeInner: {
    padding: space.md + 2,
    gap: space.xs,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs + 2,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  upgradeTitle: {
    fontFamily: typeface.display,
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
});
