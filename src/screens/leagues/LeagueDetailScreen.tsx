import { useFocusEffect } from "@react-navigation/native";
import { PublicationStatusBanner } from "../../components/moderation/PublicationStatusBanner";
import { ReportLeagueSheet } from "../../components/moderation/ReportLeagueSheet";
import { invalidatePublicContent, subscribePublicContent } from "../../lib/moderation/events";
import { usePrivacy } from "../../components/privacy/PrivacyProvider";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const privacy = usePrivacy();
  const generation = useRef(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const account = privacy.account;
    setLeague(null); setIsLoading(true); setReportOpen(false);
    try {
      const next = await backendClient.getLeague(leagueId);
      if (ticket === generation.current && account && privacy.controller.isCurrentAccount(account)) setLeague(next);
    } catch (err) {
      if (ticket === generation.current) { setLeague(null); toast.show({ message: toError(err).message, type: "error" }); }
    } finally { if (ticket === generation.current) setIsLoading(false); }
  }, [leagueId, privacy.account?.accountId, privacy.account?.sessionEpoch, privacy.controller, toast]);

  useLayoutEffect(() => { setLeague(null); setReportOpen(false); return () => { generation.current += 1; }; }, [session.user.id, privacy.account?.sessionEpoch, leagueId]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current += 1; }; }, [load]));
  useEffect(() => subscribePublicContent(() => { void load(); }), [load]);
  const block = () => {
    if (!league?.publicationRevisionId || !league.canBlockPublisher) return;
    const current = league;
    const account = privacy.account;
    Alert.alert("Block publisher?", "This hides this publisher's public leagues. It does not delete your saved team. You can report the league before blocking.", [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: () => { void (async () => {
        if (!account || !current.publicationRevisionId) return;
        setIsUpdating(true);
        try {
          await backendClient.blockLeaguePublisher(current.id, current.publicationRevisionId);
          if (!privacy.controller.isCurrentAccount(account)) return;
          setLeague(null); invalidatePublicContent(); toast.show({ message: "Publisher blocked. Your saved team is retained.", type: "success" }); onBack();
        } catch (err) { if (privacy.controller.isCurrentAccount(account)) toast.show({ message: toError(err).message, type: "error" }); }
        finally { setIsUpdating(false); }
      })(); } },
    ]);
  };

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
            <PublicationStatusBanner status={league.publicationStatus} rationale={league.publicationRationale} />
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
            {!league.isPublisher && league.publicationRevisionId ? <>
              <Button label="Report league" variant="secondary" onPress={() => setReportOpen(true)} />
              {league.canBlockPublisher ? <Button label="Block publisher" variant="danger" disabled={isUpdating} onPress={block} /> : <AppText color="secondary">Publisher account unavailable. You can still report the content.</AppText>}
              <ReportLeagueSheet visible={reportOpen} onClose={() => setReportOpen(false)} leagueId={league.id} revisionId={league.publicationRevisionId} api={backendClient} />
            </> : null}

            <Card>
              <View style={styles.cardInner}>
                <SectionLabel>As written by the league</SectionLabel>
                <AppText variant="body">{league.rulesText}</AppText>
              </View>
            </Card>
          </>
        ) : <AppText color="secondary">This league is unavailable. Your saved team data is retained.</AppText>}
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
