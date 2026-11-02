import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import FirstTimeTour, {
  FirstTimeTourHandle,
  TourStep,
} from "../components/FirstTimeTour";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  LoadTransition,
  MetricTile,
  PageHeader,
  ScreenContainer,
  Skeleton,
  SkeletonMetricRow,
} from "../components/ui";
import { clearReads } from "../lib/backend/cache";
import { backendClient } from "../lib/backend/client";
import {
  BackendGame,
  BackendLineupVersionSummary,
  BackendSession,
} from "../lib/backend/types";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import {
  defaultTeamRulesConfig,
  rulesConfigFromTeamRules,
  TeamRulesConfig,
} from "../types/rules";
import { formatDateTime } from "../utils/lineupTransforms";

type Props = {
  session: BackendSession;
  onOpenRulesPage: () => void;
  onOpenRosterPage: () => void;
  onOpenLineupPage: () => void;
  onOpenCalendarPage: () => void;
  onOpenSavedLineups: () => void;
  onOpenLineup: (version: BackendLineupVersionSummary) => void;
  // Profile's "Replay app tour" lands here with this flag set.
  replayTourRequested: boolean;
  onTourHandled: () => void;
};

type DashboardSummary = {
  teamName: string;
  activeCount: number;
  nextGame: BackendGame | null;
  recentLineups: BackendLineupVersionSummary[];
  lineupsCount: number;
  rules: TeamRulesConfig;
};

const RECENT_LINEUPS = 2;

const findNextGame = (games: BackendGame[]): BackendGame | null => {
  const now = Date.now();
  return (
    games
      .filter((game) => {
        const time = Date.parse(game.scheduledAt);
        return Number.isFinite(time) && game.status === "scheduled" && time >= now;
      })
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0] ??
    null
  );
};

const formatShortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const formatTime = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const gameTitle = (game: BackendGame) => {
  const opponent = game.opponentName.trim();
  if (opponent) return `vs ${opponent}`;
  return game.title.trim() || "Game";
};

const gameMeta = (game: BackendGame) => {
  const date = new Date(game.scheduledAt);
  return [
    Number.isNaN(date.getTime()) ? null : formatTime(date),
    game.homeAway === "home" ? "Home" : "Away",
    game.location.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const HomeScreen = ({
  session,
  onOpenRulesPage,
  onOpenRosterPage,
  onOpenLineupPage,
  onOpenCalendarPage,
  onOpenSavedLineups,
  onOpenLineup,
  replayTourRequested,
  onTourHandled,
}: Props) => {
  const rosterTileRef = useRef<View>(null);
  const rulesBtnRef = useRef<View>(null);
  const generateBtnRef = useRef<View>(null);
  const lineupsRef = useRef<View>(null);
  const tourRef = useRef<FirstTimeTourHandle>(null);

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        ref: rosterTileRef,
        title: "Build your Roster",
        description:
          "Tap the active players tile to add players, set their positions, and bench anyone sitting out.",
      },
      {
        ref: rulesBtnRef,
        title: "Set your Rules",
        description:
          "Join your league or write your own rules: innings, positions, and gender rules shape every lineup.",
      },
      {
        ref: generateBtnRef,
        title: "Generate a Lineup",
        description:
          "One tap builds a fair lineup for your next game from your roster and rules.",
      },
      {
        ref: lineupsRef,
        title: "Find Past Lineups",
        description:
          "Every saved lineup lives under the Lineup tab. Open one to edit, export, or reuse it.",
      },
    ],
    [],
  );

  const [teamId, setTeamId] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary>({
    teamName: "",
    activeCount: 0,
    nextGame: null,
    recentLineups: [],
    lineupsCount: 0,
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

      const [teamInfo, roster, teamRules, games, lineups] = await Promise.all([
        backendClient.getMyTeam(),
        backendClient.getTeamRoster(team),
        backendClient.getTeamRules(team),
        backendClient.getTeamGames(team),
        backendClient.getLineupVersions(team).catch(() => []),
      ]);

      const recent = [...lineups].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      setSummary({
        teamName: teamInfo.name,
        activeCount: roster.filter((player) => !player.benched).length,
        nextGame: findNextGame(games),
        recentLineups: recent.slice(0, RECENT_LINEUPS),
        lineupsCount: lineups.length,
        rules: rulesConfigFromTeamRules(teamRules),
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

  useEffect(() => {
    if (!replayTourRequested || loading) return;
    onTourHandled();
    // Let the screen settle after the tab switch before measuring targets.
    // No cleanup on purpose: clearing the flag re-renders with a fresh
    // onTourHandled, which would otherwise cancel this timer.
    setTimeout(() => tourRef.current?.start(), 250);
  }, [loading, onTourHandled, replayTourRequested]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Pull-to-refresh means "go to the server", not "reuse the last read".
    clearReads();
    loadDashboard()
      .catch(() => {
        setError("Unable to load home data.");
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [loadDashboard]);

  const isReady = summary.activeCount >= summary.rules.minimumPlayers;
  const readinessText = isReady
    ? `${summary.activeCount} active · ready to generate`
    : `${summary.activeCount} active · ${summary.rules.minimumPlayers - summary.activeCount} more needed`;

  const nextGame = summary.nextGame;
  const nextGameDate = nextGame ? new Date(nextGame.scheduledAt) : null;
  const nextGameEyebrow =
    nextGameDate && !Number.isNaN(nextGameDate.getTime())
      ? `Next game · ${formatShortDate(nextGameDate)}`
      : "Next game";

  return (
    <>
      <ScreenContainer
        scroll
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentStyle={styles.content}
      >
        <PageHeader
          eyebrow={new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
          title={summary.teamName || "Your team"}
          right={
            <View ref={rulesBtnRef} collapsable={false}>
              <IconButton
                icon="sliders"
                onPress={onOpenRulesPage}
                accessibilityLabel="Team rules"
              />
            </View>
          }
        />

        <LoadTransition
          loading={loading}
          style={styles.content}
          skeleton={
            <>
              <Skeleton height={208} radius={radius.xl} />
              <SkeletonMetricRow count={3} />
              <Skeleton height={140} radius={radius.lg} delay={120} />
            </>
          }
        >
          <View ref={generateBtnRef} collapsable={false}>
            <Card variant="glass" radius="xl" padding="none">
              <View style={styles.hero}>
                <AppText
                  variant="caption"
                  family="heading"
                  color="accent"
                  style={styles.eyebrow}
                >
                  {nextGame ? nextGameEyebrow : "Next game"}
                </AppText>
                <View style={styles.heroTitleBlock}>
                  <AppText variant="display" family="display" style={styles.heroTitle}>
                    {nextGame ? gameTitle(nextGame) : "No game scheduled"}
                  </AppText>
                  <AppText variant="body" color="secondary">
                    {nextGame ? gameMeta(nextGame) : "Add one to the calendar to plan ahead."}
                  </AppText>
                </View>
                <View style={styles.readinessRow}>
                  <View
                    style={[
                      styles.readinessDot,
                      { backgroundColor: isReady ? theme.success.base : theme.accent.base },
                    ]}
                  />
                  <AppText variant="body" color="secondary">
                    {readinessText}
                  </AppText>
                </View>
                {nextGame ? (
                  <Button
                    label="Generate lineup"
                    icon="zap"
                    size="lg"
                    fullWidth
                    onPress={onOpenLineupPage}
                    accessibilityLabel="Generate a lineup now"
                  />
                ) : (
                  <Button
                    label="Add a game"
                    icon="calendar"
                    size="lg"
                    fullWidth
                    onPress={onOpenCalendarPage}
                    accessibilityLabel="Add a game to the calendar"
                  />
                )}
              </View>
            </Card>
          </View>

          <View style={styles.metricsRow}>
            <View ref={rosterTileRef} collapsable={false} style={styles.metricSlot}>
              <MetricTile
                label="Active players"
                value={summary.activeCount}
                onPress={onOpenRosterPage}
                accessibilityHint="Opens the roster"
              />
            </View>
            <MetricTile
              label={summary.rules.segmentLabel === "inning" ? "Innings" : "Periods"}
              value={summary.rules.segmentCount}
              onPress={onOpenRulesPage}
              accessibilityHint="Opens team rules"
            />
            <MetricTile
              label="On field"
              value={summary.rules.playersOnField}
              onPress={onOpenRulesPage}
              accessibilityHint="Opens team rules"
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="bodyLg" family="heading">
                Recent lineups
              </AppText>
              <View ref={lineupsRef} collapsable={false}>
                <AppPressable
                  onPress={onOpenSavedLineups}
                  pressScale={1}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="See all saved lineups"
                >
                  <AppText variant="caption" family="heading" color="accent">
                    See all
                  </AppText>
                </AppPressable>
              </View>
            </View>
            {summary.recentLineups.length > 0 ? (
              <ListGroup>
                {summary.recentLineups.map((version) => (
                  <ListRow
                    key={version.id}
                    title={version.lineupName || `Lineup v${version.versionNumber}`}
                    subtitle={formatDateTime(version.createdAt)}
                    onPress={() => onOpenLineup(version)}
                  />
                ))}
              </ListGroup>
            ) : (
              <Card padding="xxs">
                <EmptyState
                  icon="layers"
                  title="No lineups yet"
                  body="Generate your first one and it will show up here."
                  action={{ label: "Generate a lineup", onPress: onOpenLineupPage }}
                />
              </Card>
            )}
          </View>
        </LoadTransition>

        {error ? (
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
      <FirstTimeTour ref={tourRef} steps={tourSteps} onDone={() => {}} />
    </>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.xl - space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  hero: {
    padding: space.xl - space.sm,
    gap: space.sm + 2,
  },
  heroTitleBlock: {
    gap: 2,
  },
  heroTitle: {
    letterSpacing: -0.2,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  readinessDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  metricsRow: {
    flexDirection: "row",
    gap: space.sm - 2,
  },
  metricSlot: {
    flex: 1,
    flexDirection: "row",
  },
  section: {
    gap: space.xs + 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerMessage: {
    minHeight: 24,
    justifyContent: "center",
  },
});

export default HomeScreen;
