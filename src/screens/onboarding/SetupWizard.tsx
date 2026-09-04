import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "../../icons";
import RulesetStatusBanner from "../../components/rules/RulesetStatusBanner";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  Input,
  Reveal,
  useToast,
} from "../../components/ui";
import { backendClient } from "../../lib/backend/client";
import { BackendSession } from "../../lib/backend/types";
import { getSimilarLeaguesError, toError } from "../../lib/backend/utils";
import { navigateFromRef } from "../../navigation/navigationRef";
import { theme, withAlpha } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { Gender, Player } from "../../types/lineup";
import {
  describeGender,
  LeagueSummary,
  rulesConfigFromTeamRules,
  TeamRulesState,
} from "../../types/rules";
import { createPlayer } from "../../utils/lineupGenerator";
import { LeagueRow } from "../leagues/LeaguesScreen";

const WIZARD_KEY_PREFIX = "coachr_setup_wizard_v2.";

type Step = "welcome" | "rules" | "roster" | "ready";
const STEPS: Step[] = ["welcome", "rules", "roster", "ready"];

type RulesMode = "options" | "league" | "create" | "own";

type Props = {
  session: BackendSession;
};

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

// First-run setup: shown once per account, straight after the first sign-in.
// Walks the coach from zero to a generated lineup (rules -> roster -> generate).
// Accounts that already have players skip it silently, so existing users never
// see it. Rendered as a full-screen overlay above the tabs (not a Modal, so
// toasts stay visible).
const SetupWizard = ({ session }: Props) => {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const wizardKey = WIZARD_KEY_PREFIX + session.user.id;

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rules, setRules] = useState<TeamRulesState | null>(null);

  const [rulesMode, setRulesMode] = useState<RulesMode>("options");
  const [leagueQuery, setLeagueQuery] = useState("");
  const [leagueResults, setLeagueResults] = useState<LeagueSummary[] | null>(null);
  const [joiningLeagueId, setJoiningLeagueId] = useState<string | null>(null);
  const [sportDraft, setSportDraft] = useState("");
  const [rulesDraft, setRulesDraft] = useState("");
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [leagueNameDraft, setLeagueNameDraft] = useState("");
  const [leagueRegionDraft, setLeagueRegionDraft] = useState("");
  const [similarLeagues, setSimilarLeagues] = useState<LeagueSummary[] | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [genderDraft, setGenderDraft] = useState<Gender>("male");
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  // Decide once whether this account needs the wizard. A roster with players
  // means the account is already set up (or migrated) - mark done and stay out
  // of the way.
  useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      const done = await AsyncStorage.getItem(wizardKey);
      if (done || cancelled) return;
      try {
        const team = await backendClient.getOrCreateTeam(session.user.id);
        if (!team || cancelled) return;
        setTeamId(team);
        const roster = await backendClient.getTeamRoster(team);
        if (cancelled) return;
        if (roster.length > 0) {
          await AsyncStorage.setItem(wizardKey, "done");
          return;
        }
        setVisible(true);
      } catch (_err) {
        // Can't reach the server: don't trap the user in a broken wizard.
      }
    };
    void decide();
    return () => {
      cancelled = true;
    };
  }, [session.user.id, wizardKey]);

  const loadRules = useCallback(async () => {
    if (!teamId) return;
    try {
      setRules(await backendClient.getTeamRules(teamId));
    } catch (_err) {
      // Non-fatal: joining a league or saving rules refreshes this anyway.
    }
  }, [teamId]);

  useEffect(() => {
    if (visible) void loadRules();
  }, [visible, loadRules]);

  const finish = useCallback(
    (generate: boolean) => {
      void AsyncStorage.setItem(wizardKey, "done");
      setVisible(false);
      if (generate) {
        navigateFromRef("Main", {
          screen: "LineupTab",
          params: {
            launch: { id: Date.now(), gameId: null, autoGenerate: true },
          },
        });
      }
    },
    [wizardKey],
  );

  const confirmSkip = useCallback(() => {
    Alert.alert(
      "Finish setup later?",
      "You can set rules from the Rules page and add players from the Roster tab anytime.",
      [
        { text: "Keep going", style: "cancel" },
        { text: "Set up later", style: "destructive", onPress: () => finish(false) },
      ],
    );
  }, [finish]);

  // ── Rules step ────────────────────────────────────────────────────────────

  const searchLeagues = useCallback(async () => {
    try {
      setLeagueResults(await backendClient.searchLeagues(leagueQuery.trim()));
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    }
  }, [leagueQuery, toast]);

  useEffect(() => {
    if (rulesMode !== "league") return;
    const timer = setTimeout(() => void searchLeagues(), 250);
    return () => clearTimeout(timer);
  }, [rulesMode, searchLeagues]);

  const joinLeague = useCallback(
    async (league: LeagueSummary) => {
      if (!teamId) return;
      setJoiningLeagueId(league.id);
      try {
        const next = await backendClient.setTeamLeague(teamId, league.id);
        setRules(next);
        toast.show({ message: `Joined ${league.name}.`, type: "success" });
        setStep("roster");
      } catch (err) {
        toast.show({ message: toError(err).message, type: "error" });
      } finally {
        setJoiningLeagueId(null);
      }
    },
    [teamId, toast],
  );

  const createLeague = useCallback(
    async (confirmDistinct: boolean) => {
      const name = leagueNameDraft.trim();
      const sport = sportDraft.trim();
      const text = rulesDraft.trim();
      if (name.length < 2) {
        setRulesError("Give the league a name.");
        return;
      }
      if (sport.length < 2) {
        setRulesError("Which sport is this league for?");
        return;
      }
      if (text.length < 10) {
        setRulesError("Describe the league rules in a few sentences.");
        return;
      }
      if (!teamId) return;
      setRulesError(null);
      setIsSavingRules(true);
      try {
        const league = await backendClient.createLeague({
          name,
          sport,
          region: leagueRegionDraft.trim() || undefined,
          rulesText: text,
          confirmDistinct,
        });
        setSimilarLeagues(null);
        const next = await backendClient.setTeamLeague(teamId, league.id);
        setRules(next);
        toast.show({
          message:
            league.status === "active"
              ? `${league.name} is live. Your team joined.`
              : `${league.name} created — we'll email you when its rules are ready.`,
          type: "success",
        });
        setStep("roster");
      } catch (err) {
        const similar = getSimilarLeaguesError(err);
        if (similar) {
          setSimilarLeagues(similar);
          return;
        }
        setRulesError(toError(err).message);
      } finally {
        setIsSavingRules(false);
      }
    },
    [leagueNameDraft, leagueRegionDraft, rulesDraft, sportDraft, teamId, toast],
  );

  const saveOwnRules = useCallback(async () => {
    const text = rulesDraft.trim();
    if (!text) {
      setRulesError("Describe your rules before saving.");
      return;
    }
    if (!teamId) return;
    setRulesError(null);
    setIsSavingRules(true);
    try {
      const next = await backendClient.upsertTeamRules(teamId, {
        rulesText: text,
        sport: sportDraft.trim() || undefined,
      });
      setRules(next);
      toast.show({
        message:
          next.ruleset?.status === "active"
            ? "Rules are live."
            : "Rules saved — we're building your lineup engine.",
        type: next.ruleset?.status === "active" ? "success" : "info",
      });
      setStep("roster");
    } catch (err) {
      setRulesError(toError(err).message);
    } finally {
      setIsSavingRules(false);
    }
  }, [rulesDraft, sportDraft, teamId, toast]);

  // ── Roster step ───────────────────────────────────────────────────────────

  const rulesConfig = useMemo(() => rulesConfigFromTeamRules(rules), [rules]);
  const requirements = rules?.ruleset?.spec.roster.requirements ?? [];

  const genderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    players.forEach((player) => {
      counts.set(player.gender, (counts.get(player.gender) ?? 0) + 1);
    });
    return counts;
  }, [players]);

  const missing = useMemo(() => {
    const items: string[] = [];
    if (players.length < rulesConfig.minimumPlayers) {
      items.push(`${rulesConfig.minimumPlayers - players.length} more players`);
    }
    requirements.forEach((entry) => {
      const have = genderCounts.get(entry.gender) ?? 0;
      if (have < entry.min) {
        items.push(`${entry.min - have} more ${describeGender(entry.gender, entry.min - have)}`);
      }
    });
    return items;
  }, [genderCounts, players.length, requirements, rulesConfig.minimumPlayers]);

  const addPlayer = useCallback(async () => {
    const name = nameDraft.trim();
    if (!name || !teamId) return;
    if (players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      toast.show({ message: `${name} is already on the roster.`, type: "error" });
      return;
    }
    setIsAddingPlayer(true);
    try {
      const player = createPlayer({ name, gender: genderDraft });
      const { id } = await backendClient.saveTeamPlayer(teamId, player);
      setPlayers((prev) => [...prev, { ...player, id }]);
      setNameDraft("");
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    } finally {
      setIsAddingPlayer(false);
    }
  }, [genderDraft, nameDraft, players, teamId, toast]);

  const removePlayer = useCallback(
    async (player: Player) => {
      if (!teamId) return;
      setPlayers((prev) => prev.filter((entry) => entry.id !== player.id));
      try {
        await backendClient.deleteTeamPlayer(teamId, player.id);
      } catch (err) {
        setPlayers((prev) => [...prev, player]);
        toast.show({ message: toError(err).message, type: "error" });
      }
    },
    [teamId, toast],
  );

  if (!visible) return null;

  const stepIndex = STEPS.indexOf(step);
  const ruleset = rules?.ruleset ?? null;
  const rulesReady = ruleset?.status === "active";
  const canGoBack = step === "rules" && rulesMode !== "options";

  // The overlay is absolutely positioned, so the parent SafeAreaView's padding
  // doesn't reach it - it needs the top inset itself.
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {canGoBack ? (
            <AppPressable
              onPress={() => {
                setSimilarLeagues(null);
                setRulesMode("options");
              }}
              style={styles.backChevron}
              accessibilityRole="button"
              accessibilityLabel="Back to rules options"
            >
              <Feather name="chevron-left" size={22} color={theme.text.primary} />
            </AppPressable>
          ) : null}
          <View style={styles.dots} accessibilityLabel={`Step ${stepIndex + 1} of ${STEPS.length}`}>
            {STEPS.map((name, index) => (
              <View
                key={name}
                style={[styles.dot, index <= stepIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>
        {step !== "ready" ? (
          <Button
            label="Set up later"
            variant="ghost"
            size="sm"
            onPress={confirmSkip}
            accessibilityLabel="Finish setup later"
          />
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === "welcome" ? (
          <Reveal style={styles.stack}>
            <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
              Welcome to Coachr
            </AppText>
            <AppText variant="display" family="display">
              Let's get your first lineup ready
            </AppText>
            <AppText variant="bodyLg" color="secondary">
              Two quick things and you're generating: your rules, then your players.
            </AppText>
            <View style={styles.checklist}>
              {[
                { icon: "sliders" as const, label: "Rules", detail: "Join or create your league, or write your own" },
                { icon: "users" as const, label: "Roster", detail: "Add your players" },
                { icon: "zap" as const, label: "Lineup", detail: "Generate a fair lineup instantly" },
              ].map((item) => (
                <View key={item.label} style={styles.checkRow}>
                  <View style={styles.checkIcon}>
                    <Feather name={item.icon} size={15} color={theme.accent.base} />
                  </View>
                  <View style={styles.checkText}>
                    <AppText variant="bodyLg" family="heading">
                      {item.label}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {item.detail}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
            <Button
              label="Set up my team"
              icon="arrow-right"
              size="lg"
              fullWidth
              onPress={() => setStep("rules")}
              accessibilityLabel="Start setup"
            />
          </Reveal>
        ) : null}

        {step === "rules" ? (
          <Reveal style={styles.stack}>
            <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
              Step 1 · Rules
            </AppText>
            <AppText variant="title" family="display">
              How does your team play?
            </AppText>

            {rulesMode === "options" ? (
              <View style={styles.stack}>
                <Card onPress={() => setRulesMode("league")} accessibilityLabel="Join my league">
                  <View style={styles.optionRow}>
                    <View style={styles.optionIcon}>
                      <Feather name="search" size={17} color={theme.accent.base} />
                    </View>
                    <View style={styles.optionText}>
                      <AppText variant="bodyLg" family="heading">
                        Join my league
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        If it's on Coachr, you get its rules instantly.
                      </AppText>
                    </View>
                    <Feather name="chevron-right" size={18} color={theme.text.secondary} />
                  </View>
                </Card>
                <Card onPress={() => setRulesMode("create")} accessibilityLabel="Create my league">
                  <View style={styles.optionRow}>
                    <View style={styles.optionIcon}>
                      <Feather name="plus-circle" size={17} color={theme.accent.base} />
                    </View>
                    <View style={styles.optionText}>
                      <AppText variant="bodyLg" family="heading">
                        Create my league
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        Set it up once — every team in your league can use it.
                      </AppText>
                    </View>
                    <Feather name="chevron-right" size={18} color={theme.text.secondary} />
                  </View>
                </Card>
                <Card onPress={() => setRulesMode("own")} accessibilityLabel="Write my own rules">
                  <View style={styles.optionRow}>
                    <View style={styles.optionIcon}>
                      <Feather name="edit-3" size={17} color={theme.accent.base} />
                    </View>
                    <View style={styles.optionText}>
                      <AppText variant="bodyLg" family="heading">
                        Write my own rules
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        No league — just your team. Plain English rules.
                      </AppText>
                    </View>
                    <Feather name="chevron-right" size={18} color={theme.text.secondary} />
                  </View>
                </Card>
              </View>
            ) : null}

            {rulesMode === "league" ? (
              <View style={styles.stack}>
                <Input
                  value={leagueQuery}
                  onChangeText={setLeagueQuery}
                  placeholder="Search by league name or region"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  left={<Feather name="search" size={16} color={theme.text.secondary} />}
                  accessibilityLabel="Search leagues"
                />
                {leagueResults && leagueResults.length > 0
                  ? leagueResults.slice(0, 6).map((league) => (
                      <LeagueRow
                        key={league.id}
                        league={league}
                        onPress={() => {
                          if (!joiningLeagueId) void joinLeague(league);
                        }}
                      />
                    ))
                  : null}
                {leagueResults && leagueResults.length === 0 ? (
                  <AppText variant="body" color="secondary">
                    No leagues match{leagueQuery.trim() ? ` "${leagueQuery.trim()}"` : ""} yet.
                    Be the first — create it and every team in your league can join.
                  </AppText>
                ) : null}
                <Button
                  label="Create it instead"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    if (leagueQuery.trim()) setLeagueNameDraft(leagueQuery.trim());
                    setRulesMode("create");
                  }}
                  accessibilityLabel="Create this league instead"
                />
              </View>
            ) : null}

            {rulesMode === "create" ? (
              <View style={styles.stack}>
                <Input
                  label="League name"
                  value={leagueNameDraft}
                  onChangeText={setLeagueNameDraft}
                  placeholder="Austin Coed Kickball"
                  accessibilityLabel="League name"
                />
                <Input
                  label="Sport"
                  value={sportDraft}
                  onChangeText={setSportDraft}
                  placeholder="softball, kickball, soccer…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="League sport"
                />
                <Input
                  label="Region (optional)"
                  value={leagueRegionDraft}
                  onChangeText={setLeagueRegionDraft}
                  placeholder="Austin, TX"
                  accessibilityLabel="League region"
                />
                <Input
                  label="League rules"
                  value={rulesDraft}
                  onChangeText={(value) => {
                    setRulesDraft(value);
                    if (rulesError) setRulesError(null);
                  }}
                  placeholder="e.g. 6 innings, 9 on the field (P, C, 1B, 2B, 3B, SS, LF, CF, RF), nobody sits twice in a row."
                  multiline
                  textAlignVertical="top"
                  style={styles.textarea}
                  error={rulesError}
                  hint="Simple rules go live instantly. Unusual ones get a custom engine built in a few minutes."
                  accessibilityLabel="League rules"
                />
                {similarLeagues ? (
                  <View style={styles.stack}>
                    <AppText variant="body" color="secondary">
                      A league with a similar name already exists. Yours, or a
                      different one?
                    </AppText>
                    {similarLeagues.slice(0, 3).map((league) => (
                      <LeagueRow
                        key={league.id}
                        league={league}
                        onPress={() => {
                          if (!joiningLeagueId) void joinLeague(league);
                        }}
                      />
                    ))}
                    <Button
                      label="Mine is different — create it"
                      variant="secondary"
                      loading={isSavingRules}
                      onPress={() => void createLeague(true)}
                      accessibilityLabel="Create the league anyway"
                    />
                  </View>
                ) : (
                  <Button
                    label="Create league"
                    icon="check"
                    fullWidth
                    loading={isSavingRules}
                    onPress={() => void createLeague(false)}
                    accessibilityLabel="Create league"
                  />
                )}
              </View>
            ) : null}

            {rulesMode === "own" ? (
              <View style={styles.stack}>
                <Input
                  label="Sport"
                  value={sportDraft}
                  onChangeText={setSportDraft}
                  placeholder="softball, kickball, soccer…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Sport"
                />
                <Input
                  label="Rules"
                  value={rulesDraft}
                  onChangeText={(value) => {
                    setRulesDraft(value);
                    if (rulesError) setRulesError(null);
                  }}
                  placeholder="e.g. 6 innings, 9 on the field (P, C, 1B, 2B, 3B, SS, LF, CF, RF), nobody sits twice in a row."
                  multiline
                  textAlignVertical="top"
                  style={styles.textarea}
                  error={rulesError}
                  hint="Simple rules go live instantly. Unusual ones get a custom engine built in a few minutes."
                  accessibilityLabel="Team rules"
                />
                <Button
                  label="Save rules"
                  icon="check"
                  fullWidth
                  loading={isSavingRules}
                  onPress={() => void saveOwnRules()}
                  accessibilityLabel="Save rules"
                />
              </View>
            ) : null}
          </Reveal>
        ) : null}

        {step === "roster" ? (
          <Reveal style={styles.stack}>
            <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
              Step 2 · Roster
            </AppText>
            <AppText variant="title" family="display">
              Add your players
            </AppText>
            <AppText variant="body" color="secondary">
              {missing.length > 0
                ? `Your rules need ${missing.join(" and ")}.`
                : "That's enough to generate. Add the rest whenever."}
            </AppText>

            <View style={styles.addRow}>
              <Input
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Player name"
                containerStyle={styles.flex}
                returnKeyType="done"
                onSubmitEditing={() => void addPlayer()}
                accessibilityLabel="Player name"
              />
              <View style={styles.genderToggle}>
                {(["male", "female"] as const).map((gender) => (
                  <AppPressable
                    key={gender}
                    onPress={() => setGenderDraft(gender)}
                    style={[
                      styles.genderOption,
                      genderDraft === gender && styles.genderOptionActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: genderDraft === gender }}
                    accessibilityLabel={gender === "male" ? "Man" : "Woman"}
                  >
                    <AppText
                      variant="caption"
                      family="heading"
                      color={genderDraft === gender ? "accent" : "secondary"}
                    >
                      {gender === "male" ? "M" : "W"}
                    </AppText>
                  </AppPressable>
                ))}
              </View>
              <Button
                label="Add"
                onPress={() => void addPlayer()}
                loading={isAddingPlayer}
                disabled={!nameDraft.trim()}
                accessibilityLabel="Add player"
              />
            </View>

            <View style={styles.playerWrap}>
              {players.map((player) => (
                <AppPressable
                  key={player.id}
                  onPress={() => void removePlayer(player)}
                  style={styles.playerChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${player.name}`}
                >
                  <View
                    style={[
                      styles.genderDot,
                      { backgroundColor: player.gender === "female" ? "#c96f95" : theme.accent.base },
                    ]}
                  />
                  <AppText variant="caption" family="heading">
                    {player.name}
                  </AppText>
                  <Feather name="x" size={13} color={theme.text.secondary} />
                </AppPressable>
              ))}
              {players.length === 0 ? (
                <AppText variant="caption" color="muted">
                  Nobody yet. You can also import a spreadsheet later from the Roster tab.
                </AppText>
              ) : null}
            </View>

            <Button
              label={
                missing.length > 0
                  ? `${players.length} of ${rulesConfig.minimumPlayers} players`
                  : "Continue"
              }
              icon={missing.length > 0 ? undefined : "arrow-right"}
              size="lg"
              fullWidth
              disabled={missing.length > 0}
              onPress={() => setStep("ready")}
              accessibilityLabel="Continue to the last step"
            />
          </Reveal>
        ) : null}

        {step === "ready" ? (
          <Reveal style={styles.stack}>
            <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
              Step 3 · Lineup
            </AppText>
            <AppText variant="display" family="display">
              {rulesReady ? "You're ready" : "Almost there"}
            </AppText>
            <Card>
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Feather name="sliders" size={15} color={theme.text.secondary} />
                  <AppText variant="body" style={styles.flex}>
                    {rules?.league
                      ? `${rules.league.name} rules`
                      : ruleset
                        ? `Your ${capitalize(ruleset.sport)} rules`
                        : "Your rules"}
                  </AppText>
                  <AppText
                    variant="caption"
                    family="heading"
                    color={rulesReady ? "success" : "accent"}
                  >
                    {rulesReady ? "Ready" : capitalize(ruleset?.status ?? "active")}
                  </AppText>
                </View>
                <View style={styles.summaryRow}>
                  <Feather name="users" size={15} color={theme.text.secondary} />
                  <AppText variant="body" style={styles.flex}>
                    {players.length} players on the roster
                  </AppText>
                  <AppText variant="caption" family="heading" color="success">
                    Ready
                  </AppText>
                </View>
              </View>
            </Card>
            {ruleset && ruleset.status !== "active" ? (
              <RulesetStatusBanner status={ruleset.status} />
            ) : null}
            {rulesReady ? (
              <Button
                label="Generate my first lineup"
                icon="zap"
                size="lg"
                fullWidth
                onPress={() => finish(true)}
                accessibilityLabel="Generate my first lineup"
              />
            ) : (
              <Button
                label="Finish setup"
                icon="check"
                size="lg"
                fullWidth
                onPress={() => finish(false)}
                accessibilityLabel="Finish setup"
              />
            )}
            <Button
              label="I'll explore on my own"
              variant="ghost"
              size="sm"
              onPress={() => finish(false)}
              accessibilityLabel="Close setup"
            />
          </Reveal>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.bg.base,
    zIndex: 10,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    minHeight: 40,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  backChevron: {
    width: 32,
    height: 32,
    marginLeft: -space.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    gap: space.xs,
  },
  dot: {
    width: 22,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.border.base,
  },
  dotActive: {
    backgroundColor: theme.accent.base,
  },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  stack: {
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  checklist: {
    gap: space.sm,
    paddingVertical: space.sm,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  checkIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    gap: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: theme.accent.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  textarea: {
    minHeight: 110,
  },
  addRow: {
    flexDirection: "row",
    gap: space.xs,
    alignItems: "flex-start",
  },
  genderToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.md,
    overflow: "hidden",
    minHeight: 44,
  },
  genderOption: {
    paddingHorizontal: space.sm,
    justifyContent: "center",
  },
  genderOptionActive: {
    backgroundColor: theme.accent.subtle,
  },
  playerWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    minHeight: 34,
  },
  playerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    paddingHorizontal: space.sm,
    minHeight: 34,
  },
  genderDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  summary: {
    gap: space.sm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
});

export default SetupWizard;
