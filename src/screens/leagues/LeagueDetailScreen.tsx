import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import RulesSummary from "../../components/rules/RulesSummary";
import RulesetStatusBanner from "../../components/rules/RulesetStatusBanner";
import {
  AppText,
  Button,
  Card,
  LoadTransition,
  PageHeader,
  ScreenContainer,
  SectionLabel,
  Skeleton,
  SkeletonMetricRow,
  useToast,
} from "../../components/ui";
import { backendClient } from "../../lib/backend/client";
import { BackendSession } from "../../lib/backend/types";
import { toError } from "../../lib/backend/utils";
import { useRulesetStatus } from "../../lib/rulesetStatus/RulesetStatusProvider";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { LeagueDetail } from "../../types/rules";
import { describeLeague } from "./LeagueRow";

type Props = {
  session: BackendSession;
  leagueId: string;
  onBack: () => void;
  // Fired after the team joins so the caller can return to the rules screen.
  onJoined: () => void;
};

const LeagueDetailScreen = ({ session, leagueId, onBack, onJoined }: Props) => {
  const toast = useToast();
  const rulesetStatus = useRulesetStatus();
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
        void rulesetStatus.refresh();
        if (join) {
          toast.show({ message: `Joined ${league.name}.`, type: "success" });
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
    [league, load, onJoined, rulesetStatus, session.user.id, toast],
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
      <PageHeader
        back={{ label: "Leagues", onPress: onBack }}
        eyebrow="League"
        title={league?.name ?? " "}
        subtitle={league ? describeLeague(league) : undefined}
      />

      <LoadTransition
        loading={isLoading}
        style={styles.stack}
        skeleton={
          <>
            <Skeleton height={52} radius={radius.lg} />
            <SkeletonMetricRow count={2} />
            <SkeletonMetricRow count={2} />
            <Skeleton height={140} radius={radius.lg} delay={120} />
          </>
        }
      >
        {league ? (
          <>
            {league.description ? (
              <AppText variant="body" color="secondary">
                {league.description}
              </AppText>
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
                size="lg"
                loading={isUpdating}
                onPress={() => void setMembership(true)}
                fullWidth
                accessibilityLabel={`Join ${league.name}`}
              />
            )}

            {league.status !== "active" ? (
              <RulesetStatusBanner status={league.status} />
            ) : null}

            <RulesSummary ruleset={league.ruleset} />

            <Card>
              <View style={styles.cardInner}>
                <SectionLabel>As written by the league</SectionLabel>
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
    gap: space.md,
  },
  stack: {
    gap: space.md,
  },
  cardInner: {
    gap: space.xs,
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
