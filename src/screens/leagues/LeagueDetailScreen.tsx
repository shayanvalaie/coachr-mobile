import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import RulesSummary from "../../components/rules/RulesSummary";
import RulesetStatusBanner from "../../components/rules/RulesetStatusBanner";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  LoadTransition,
  ScreenContainer,
  Skeleton,
  useToast,
} from "../../components/ui";
import { backendClient } from "../../lib/backend/client";
import { BackendSession } from "../../lib/backend/types";
import { toError } from "../../lib/backend/utils";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { LeagueDetail } from "../../types/rules";

type Props = {
  session: BackendSession;
  leagueId: string;
  onBack: () => void;
  // Fired after the team joins so the caller can return to the rules screen.
  onJoined: () => void;
};

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const LeagueDetailScreen = ({ session, leagueId, onBack, onJoined }: Props) => {
  const toast = useToast();
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLeague(await backendClient.getLeague(leagueId));
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMembership = useCallback(
    async (join: boolean) => {
      if (!league) return;
      setIsUpdating(true);
      try {
        const teamId = await backendClient.getOrCreateTeam(session.user.id);
        if (!teamId) throw new Error("Unable to load your team.");
        await backendClient.setTeamLeague(teamId, join ? league.id : null);
        if (join) {
          toast.show({ message: `Your team joined ${league.name}.`, type: "success" });
          onJoined();
          return;
        }
        toast.show({ message: `Left ${league.name}.`, type: "info" });
        await load();
      } catch (err) {
        toast.show({ message: toError(err).message, type: "error" });
      } finally {
        setIsUpdating(false);
      }
    },
    [league, load, onJoined, session.user.id, toast],
  );

  const confirmLeave = useCallback(() => {
    if (!league) return;
    Alert.alert(
      `Leave ${league.name}?`,
      "Your team will need its own rules before generating lineups again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave league", style: "destructive", onPress: () => void setMembership(false) },
      ],
    );
  }, [league, setMembership]);

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <AppPressable
        onPress={onBack}
        style={styles.backLink}
        accessibilityRole="button"
        accessibilityLabel="Back to leagues"
        pressScale={1}
      >
        <Feather name="chevron-left" size={18} color={theme.text.secondary} />
        <AppText variant="body" color="secondary">
          Leagues
        </AppText>
      </AppPressable>

      <LoadTransition
        loading={isLoading}
        style={styles.stack}
        skeleton={
          <>
            <Skeleton height={190} radius={radius.lg} />
            <Skeleton height={320} radius={radius.lg} />
          </>
        }
      >
        {league ? (
          <>
            <Card variant="elevated">
              <View style={styles.cardInner}>
                <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
                  League
                </AppText>
                <AppText variant="display" family="display">
                  {league.name}
                </AppText>
                <AppText variant="body" color="secondary">
                  {[
                    capitalize(league.sport),
                    league.region,
                    `${league.teamCount} ${league.teamCount === 1 ? "team" : "teams"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </AppText>
                {league.description ? (
                  <AppText variant="body">{league.description}</AppText>
                ) : null}
                {league.joined ? (
                  <View style={styles.memberRow}>
                    <View style={styles.memberBadge}>
                      <Feather name="check" size={13} color={theme.success.base} />
                      <AppText variant="caption" family="heading" color="success">
                        Your team plays here
                      </AppText>
                    </View>
                    <Button
                      label="Leave"
                      variant="danger"
                      size="sm"
                      loading={isUpdating}
                      onPress={confirmLeave}
                      accessibilityLabel="Leave this league"
                    />
                  </View>
                ) : (
                  <Button
                    label="Join this league"
                    icon="log-in"
                    loading={isUpdating}
                    onPress={() => void setMembership(true)}
                    fullWidth
                    accessibilityLabel={`Join ${league.name}`}
                  />
                )}
              </View>
            </Card>

            {league.status !== "active" ? (
              <RulesetStatusBanner status={league.status} />
            ) : null}

            <RulesSummary
              spec={league.ruleset.spec}
              unexpressedRules={league.ruleset.unexpressedRules}
              eyebrow="League rules"
            />

            <Card>
              <View style={styles.cardInner}>
                <AppText variant="caption" family="heading" color="secondary">
                  As written by the league
                </AppText>
                <AppText variant="body">{league.rulesText}</AppText>
              </View>
            </Card>
          </>
        ) : null}
      </LoadTransition>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.sm,
  },
  stack: {
    gap: space.sm,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xxs,
    minHeight: 32,
  },
  cardInner: {
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: theme.success.subtle,
    paddingHorizontal: space.sm,
    minHeight: 30,
  },
});

export default LeagueDetailScreen;
