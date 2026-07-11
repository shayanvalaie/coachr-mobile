import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import FirstTimeTour, {
  FirstTimeTourHandle,
  TourStep,
} from "../components/FirstTimeTour";
import Header from "../components/Header";
import { backendClient } from "../lib/backend/client";
import { BackendGame, BackendSession } from "../lib/backend/types";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import {
  defaultTeamRulesConfig,
  parseTeamRulesConfig,
  TeamRulesConfig,
} from "../types/rules";

type Props = {
  session: BackendSession;
  onOpenProfile: () => void;
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
  onOpenProfile,
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
  const [error, setError] = useState<string | null>(null);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;
    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;
    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadDashboard().catch(() => {
      setError("Unable to load home data.");
      setLoading(false);
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
      <View pointerEvents="none" style={styles.bgLayer}>
        <View style={[styles.bgOrb, styles.bgOrbOne]} />
        <View style={[styles.bgOrb, styles.bgOrbTwo]} />
      </View>

      <View style={styles.screen}>
        <Header
          onUserPress={onOpenProfile}
          onInfoPress={() => tourRef.current?.start()}
          showMenu={false}
        />

        <View style={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Home</Text>
            <Text style={styles.heroTitle}>Ready for game day?</Text>
            <Text style={styles.heroSubtitle}>{readinessText}</Text>
            <Pressable
              ref={generateBtnRef}
              style={({ pressed }) => [styles.heroPrimaryButton, pressed && { opacity: 0.9 }]}
              onPress={onOpenLineupPage}
            >
              <Text style={styles.heroPrimaryText}>Generate now</Text>
            </Pressable>
          </View>

          {!loading && !error && summary.lineupsCount === 0 ? (
            <View style={styles.emptyLineupCard}>
              <Text style={styles.emptyLineupTitle}>No lineups yet</Text>
              <Text style={styles.emptyLineupSubtitle}>
                You haven&apos;t created a lineup yet. Generate your first one to
                get ready for game day.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.emptyLineupButton,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={onOpenLineupPage}
              >
                <Text style={styles.emptyLineupButtonText}>
                  Create your first lineup
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Roster</Text>
              <Text style={styles.metricValue}>{summary.rosterCount}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Innings</Text>
              <Text style={styles.metricValue}>{summary.rules.segmentCount}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>On Field</Text>
              <Text style={styles.metricValue}>{summary.rules.playersOnField}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Next Game</Text>
              <Text style={styles.metricValueSmall}>{summary.nextGameLabel}</Text>
            </View>
          </View>

          <View style={styles.quickActionsCard}>
            <Text style={styles.quickActionsTitle}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              <Pressable
                ref={rosterBtnRef}
                style={({ pressed }) => [styles.quickButton, pressed && { opacity: 0.88 }]}
                onPress={onOpenRosterPage}
              >
                <Text style={styles.quickButtonText}>Roster</Text>
              </Pressable>
              <Pressable
                ref={rulesBtnRef}
                style={({ pressed }) => [styles.quickButton, pressed && { opacity: 0.88 }]}
                onPress={onOpenRulesPage}
              >
                <Text style={styles.quickButtonText}>Rules</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.quickButton, pressed && { opacity: 0.88 }]}
                onPress={onOpenCalendarPage}
              >
                <Text style={styles.quickButtonText}>Calendar</Text>
              </Pressable>
              <Pressable
                ref={lineupsBtnRef}
                style={({ pressed }) => [styles.quickButton, pressed && { opacity: 0.88 }]}
                onPress={onOpenLineupsPage}
              >
                <Text style={styles.quickButtonText}>All Lineups</Text>
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.footerMessage}>
              <ActivityIndicator color={palette.accent} />
            </View>
          ) : error ? (
            <Pressable
              style={styles.footerMessage}
              onPress={() => {
                loadDashboard().catch(() => {
                  setError("Unable to load home data.");
                });
              }}
            >
              <Text style={styles.errorText}>{error} Tap to retry.</Text>
            </Pressable>
          ) : (
            <View style={styles.footerMessage}>
              <Text style={styles.subtleText}>
                Signed in as {session.user.email ?? "your account"}
              </Text>
            </View>
          )}
        </View>
      </View>
      <FirstTimeTour ref={tourRef} steps={tourSteps} onDone={() => {}} />
    </>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  bgLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  bgOrb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.2,
  },
  bgOrbOne: {
    width: 220,
    height: 220,
    backgroundColor: palette.accent,
    top: -80,
    right: -60,
  },
  bgOrbTwo: {
    width: 200,
    height: 200,
    backgroundColor: palette.success,
    bottom: 80,
    left: -120,
  },
  heroCard: {
    backgroundColor: palette.cardAlt,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
  },
  heroEyebrow: {
    color: palette.accent,
    fontSize: 11,
    fontFamily: typeface.heading,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: palette.text,
    fontSize: 24,
    fontFamily: typeface.display,
  },
  heroSubtitle: {
    color: palette.subtext,
    fontSize: 13,
    fontFamily: typeface.body,
  },
  heroPrimaryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.8)",
    marginTop: 4,
  },
  heroPrimaryText: {
    color: palette.accentText,
    fontSize: 14,
    fontFamily: typeface.heading,
  },
  emptyLineupCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.35)",
    backgroundColor: palette.cardAlt,
    padding: 14,
    gap: 8,
  },
  emptyLineupTitle: {
    color: palette.text,
    fontSize: 16,
    fontFamily: typeface.heading,
  },
  emptyLineupSubtitle: {
    color: palette.subtext,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typeface.body,
  },
  emptyLineupButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.8)",
    marginTop: 4,
  },
  emptyLineupButtonText: {
    color: palette.accentText,
    fontSize: 13,
    fontFamily: typeface.heading,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 78,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  metricLabel: {
    color: palette.subtext,
    fontSize: 11,
    fontFamily: typeface.body,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    color: palette.text,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: typeface.display,
  },
  metricValueSmall: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typeface.heading,
  },
  quickActionsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    padding: 12,
    gap: 10,
  },
  quickActionsTitle: {
    color: palette.text,
    fontSize: 14,
    fontFamily: typeface.heading,
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickButton: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingVertical: 11,
    alignItems: "center",
  },
  quickButtonText: {
    color: palette.text,
    fontSize: 13,
    fontFamily: typeface.heading,
  },
  footerMessage: {
    marginTop: "auto",
    minHeight: 24,
    justifyContent: "center",
  },
  subtleText: {
    color: palette.subtext,
    fontSize: 12,
    fontFamily: typeface.body,
  },
  errorText: {
    color: palette.danger,
    fontSize: 12,
    fontFamily: typeface.body,
  },
});

export default HomeScreen;
