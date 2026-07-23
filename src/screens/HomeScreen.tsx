import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import FirstTimeTour, {
  FirstTimeTourHandle,
  TourStep,
} from "../components/FirstTimeTour";
import Header from "../components/Header";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  EmptyState,
  LoadTransition,
  MetricTile,
  Reveal,
  ScreenContainer,
  SkeletonMetricRow,
} from "../components/ui";
import { backendClient } from "../lib/backend/client";
import { BackendGame, BackendSession } from "../lib/backend/types";
import { theme } from "../theme/colors";
import { space } from "../theme/tokens";
import {
  defaultTeamRulesConfig,
  parseTeamRulesConfig,
  TeamRulesConfig,
} from "../types/rules";

type Props = {
  session: BackendSession;
  onOpenRulesPage: () => void;
  onOpenRosterPage: () => void;
  onOpenLineupPage: () => void;
  onOpenCalendarPage: () => void;
  onOpenLineupsPage: () => void;
};

type DashboardSummary = {
  rosterCount: number;
  gamesCount: number;
  lineupsCount: number;
  nextGameLabel: string;
  rules: TeamRulesConfig;
};

const formatNextGameLabel = (games: BackendGame[]): string => {
  const now = Date.now();
  const upcoming = games
    .map((game) => ({
      title: game.title || game.opponentName || "Game",
      time: Date.parse(game.scheduledAt),
      status: game.status,
    }))
    .filter(
      (game): game is { title: string; time: number; status: BackendGame["status"] } =>
        Number.isFinite(game.time) &&
        game.status === "scheduled" &&
        game.time >= now,
    )
    .sort((a, b) => a.time - b.time)[0];

  if (!upcoming) return "No upcoming game";
  return new Date(upcoming.time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const HomeScreen = ({
  session,
  onOpenRulesPage,
  onOpenRosterPage,
  onOpenLineupPage,
  onOpenCalendarPage,
  onOpenLineupsPage,
}: Props) => {
  const rosterBtnRef = useRef<View>(null);
  const rulesBtnRef = useRef<View>(null);
  const generateBtnRef = useRef<View>(null);
  const lineupsBtnRef = useRef<View>(null);
  const tourRef = useRef<FirstTimeTourHandle>(null);

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        ref: rosterBtnRef,
        title: "Build your Roster",
        description:
          "Add and manage your players here. Set their positions, gender, and active status before generating a lineup.",
      },
      {
        ref: rulesBtnRef,
        title: "Set your Rules",
        description:
          "Configure your sport, number of innings, field positions, and any custom instructions that shape how lineups are generated.",
      },
      {
        ref: generateBtnRef,
        title: "Generate a Lineup",
        description:
          "Tap here to generate a fair lineup for your next game based on your roster and team rules.",
      },
      {
        ref: lineupsBtnRef,
        title: "View Past Lineups",
        description:
          "Browse all previously generated lineups here. Share or review any game lineup at any time.",
      },
    ],
    [],
  );

  const [teamId, setTeamId] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary>({
    rosterCount: 0,
    gamesCount: 0,
    lineupsCount: 0,
    nextGameLabel: "No upcoming game",
    rules: defaultTeamRulesConfig,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;
    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;
    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const hasLoadedRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    // Skeletons are for the first paint only; refreshes keep the current
    // values on screen instead of flashing placeholders over real data.
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);

    try {
      const team = await ensureTeam();
      if (!team) {
        setError("Unable to load your team.");
        return;
      }

      const [roster, rawRules, games, lineups] = await Promise.all([
        backendClient.getTeamRoster(team),
        backendClient.getTeamRules(team),
        backendClient.getTeamGames(team),
        backendClient.getLineupVersions(team).catch(() => []),
      ]);

      const rules = parseTeamRulesConfig(rawRules);
      setSummary({
        rosterCount: roster.length,
        gamesCount: games.length,
        lineupsCount: lineups.length,
        nextGameLabel: formatNextGameLabel(games),
        rules,
      });
    } catch (_err) {
      setError("Unable to load home data.");
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadDashboard().catch(() => {
      setError("Unable to load home data.");
      setLoading(false);
    });
  }, [loadDashboard]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboard()
      .catch(() => {
        setError("Unable to load home data.");
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [loadDashboard]);

  const readinessText = useMemo(() => {
    const activeCount = summary.rosterCount;
    if (activeCount >= summary.rules.minimumPlayers) {
      return "Ready to generate";
    }
    return `${summary.rules.minimumPlayers - activeCount} more players needed`;
  }, [summary.rosterCount, summary.rules.minimumPlayers]);

  return (
    <>
      <View style={styles.screen}>
        <Header
          onInfoPress={() => tourRef.current?.start()}
          showMenu={false}
        />

        <ScreenContainer
          scroll
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentStyle={styles.content}
        >
          <Card variant="elevated" style={styles.heroCard}>
            <AppText
              variant="caption"
              family="heading"
              color="accent"
              style={styles.eyebrow}
            >
              Home
            </AppText>
            <AppText variant="display" family="display">
              Ready for game day?
            </AppText>
            <AppText variant="body" color="secondary">
              {readinessText}
            </AppText>
            <View
              ref={generateBtnRef}
              collapsable={false}
              style={styles.heroButtonWrap}
            >
              <Button
                label="Generate now"
                onPress={onOpenLineupPage}
                accessibilityLabel="Generate a lineup now"
              />
            </View>
          </Card>

          {!loading && !error && summary.lineupsCount === 0 ? (
            <Reveal>
              <Card variant="outline" padding="xxs">
                <EmptyState
                  icon="clipboard"
                  title="No lineups yet"
                  body="You haven't created a lineup yet. Generate your first one to get ready for game day."
                  action={{
                    label: "Create your first lineup",
                    onPress: onOpenLineupPage,
                  }}
                />
              </Card>
            </Reveal>
          ) : null}

          <LoadTransition
            loading={loading}
            style={styles.metricsGrid}
            skeleton={
              <>
                <SkeletonMetricRow count={2} />
                <SkeletonMetricRow count={2} />
              </>
            }
          >
            <View style={styles.metricsRow}>
              <MetricTile label="Roster" value={summary.rosterCount} />
              <MetricTile label="Innings" value={summary.rules.segmentCount} />
            </View>
            <View style={styles.metricsRow}>
              <MetricTile label="On Field" value={summary.rules.playersOnField} />
              <MetricTile label="Next Game" value={summary.nextGameLabel} small />
            </View>
          </LoadTransition>

          <Card style={styles.quickActionsCard}>
            <AppText variant="bodyLg" family="heading">
              Quick Actions
            </AppText>
            <View style={styles.quickActionsRow}>
              <View
                ref={rosterBtnRef}
                collapsable={false}
                style={styles.quickButtonWrap}
              >
                <Button
                  label="Roster"
                  onPress={onOpenRosterPage}
                  variant="secondary"
                  fullWidth
                  accessibilityLabel="Open roster"
                />
              </View>
              <View
                ref={rulesBtnRef}
                collapsable={false}
                style={styles.quickButtonWrap}
              >
                <Button
                  label="Rules"
                  onPress={onOpenRulesPage}
                  variant="secondary"
                  fullWidth
                  accessibilityLabel="Open team rules"
                />
              </View>
              <View collapsable={false} style={styles.quickButtonWrap}>
                <Button
                  label="Calendar"
                  onPress={onOpenCalendarPage}
                  variant="secondary"
                  fullWidth
                  accessibilityLabel="Open calendar"
                />
              </View>
              <View
                ref={lineupsBtnRef}
                collapsable={false}
                style={styles.quickButtonWrap}
              >
                <Button
                  label="All Lineups"
                  onPress={onOpenLineupsPage}
                  variant="secondary"
                  fullWidth
                  accessibilityLabel="View all lineups"
                />
              </View>
            </View>
          </Card>

          {loading ? (
            <View style={styles.footerMessage} />
          ) : error ? (
            <AppPressable
              style={styles.footerMessage}
              onPress={() => {
                loadDashboard().catch(() => {
                  setError("Unable to load home data.");
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`${error} Tap to retry`}
            >
              <AppText variant="caption" color="danger">
                {error} Tap to retry.
              </AppText>
            </AppPressable>
          ) : null}
        </ScreenContainer>
      </View>
      <FirstTimeTour ref={tourRef} steps={tourSteps} onDone={() => {}} />
    </>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg.base,
  },
  content: {
    flexGrow: 1,
    paddingTop: space.md,
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroCard: {
    gap: space.xs,
  },
  heroButtonWrap: {
    alignSelf: "flex-start",
    marginTop: space.xxs,
  },
  metricsGrid: {
    gap: space.sm,
  },
  metricsRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  quickActionsCard: {
    gap: space.sm,
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  quickButtonWrap: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  footerMessage: {
    marginTop: "auto",
    minHeight: 24,
    justifyContent: "center",
  },
});

export default HomeScreen;
