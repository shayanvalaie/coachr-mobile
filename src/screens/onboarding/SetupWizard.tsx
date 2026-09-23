import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, IconName } from "../../icons";
import {
  AmbientBackground,
  AppPressable,
  AppText,
  Button,
  Card,
  Input,
  ListGroup,
  Reveal,
  Sheet,
  SportPicker,
  useToast,
} from "../../components/ui";
import { backendClient } from "../../lib/backend/client";
import { trace } from "../../lib/backend/trace";
import { BackendSession } from "../../lib/backend/types";
import { getSimilarLeaguesError, toError } from "../../lib/backend/utils";
import PlaceSearch from "../../components/PlaceSearch";
import { PlaceValue } from "../../lib/placeSearch";
import { useRulesetStatus } from "../../lib/rulesetStatus/RulesetStatusProvider";
import { navigateFromRef } from "../../navigation/navigationRef";
import { theme } from "../../theme/colors";
import { motion, radius, space } from "../../theme/tokens";
import { typeface } from "../../theme/typography";
import { LeagueSuggestion, LeagueSummary, RulesetStatus } from "../../types/rules";
import { digitsOnly, parseCount } from "../../utils/formNumbers";
import LeagueRow, { describeMatchReasons } from "../leagues/LeagueRow";

const WIZARD_KEY_PREFIX = "coachr_setup_wizard_v2.";

// Rules is the only real step: players are added on the Roster tab afterwards,
// while the lineup engine is being built.
type Step = "welcome" | "rules";
const STEPS: Step[] = ["welcome", "rules"];

// Two-stage rules step: "search" only searches; "options" offers Create /
// Own. Create is never shown alongside search results.
type RulesMode = "search" | "options" | "create" | "own";

type OwnRulesDraft = {
  sport: string;
  rulesText: string;
  segmentCount: number;
  playersOnField: number;
};

type CreateLeagueDraft = OwnRulesDraft & {
  name: string;
  city: string;
  state: string;
  zip: string;
  confirmDistinct: boolean;
};

// What the sheet on the Roster tab tells the coach once the wizard hands off.
type SetupNotice =
  | { kind: "saving" }
  | { kind: "rules"; status: RulesetStatus }
  | { kind: "joined"; leagueName: string; status: RulesetStatus };

const ADD_PLAYERS_THEN_GENERATE =
  "Add your players, then generate your first lineup from the Lineup tab.";

const noticeCopy = (notice: SetupNotice): { title: string; body: string } => {
  if (notice.kind === "saving") {
    return {
      title: "Saving your rules",
      body: "Add your players in the meantime. This updates the moment your rules are in.",
    };
  }
  if (notice.kind === "joined") {
    return {
      title: `You joined ${notice.leagueName}`,
      body:
        notice.status === "active"
          ? ADD_PLAYERS_THEN_GENERATE
          : "Its lineup engine is still being set up. Add your players in the meantime.",
    };
  }
  switch (notice.status) {
    case "active":
      return { title: "Your rules are live", body: ADD_PLAYERS_THEN_GENERATE };
    case "baking":
      return {
        title: "Your lineup engine is being generated",
        body: "This takes a few minutes. Add your players in the meantime and we'll let you know when it's ready.",
      };
    case "review":
      return {
        title: "Your rules need a quick review",
        body: "We'll email you when they're ready. Add your players in the meantime.",
      };
    case "rejected":
      return {
        title: "These rules couldn't be supported",
        body: "Adjust them from the Rules page. You can still add your players now.",
      };
  }
};

type Props = {
  session: BackendSession;
};

const SEARCH_DEBOUNCE_MS = 250;
const RULES_HINT =
  "Simple rules go live instantly. Unusual ones get a custom engine built in a few minutes.";

const WELCOME_ITEMS: Array<{ label: string; detail: string }> = [
  { label: "Rules", detail: "Join or create your league, or write your own" },
  { label: "Roster", detail: "Add your players on the Roster tab" },
  { label: "Lineup", detail: "Generate a fair lineup instantly" },
];

// Glass row offering a way to get rules without joining a league.
const OptionRow = ({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
}) => (
  <Card variant="glass" radius="lg" padding="sm" onPress={onPress} accessibilityLabel={title}>
    <View style={styles.optionRow}>
      <View style={styles.optionIcon}>
        <Feather name={icon} size={16} color={theme.accent.base} />
      </View>
      <View style={styles.optionText}>
        <AppText variant="bodyLg" family="heading">
          {title}
        </AppText>
        <AppText variant="caption" color="secondary">
          {detail}
        </AppText>
      </View>
      <Feather name="chevron-right" size={18} color={theme.text.muted} />
    </View>
  </Card>
);

// First-run setup: shown once per account, straight after the first sign-in.
// Walks the coach from zero to a generated lineup (rules -> roster -> generate).
// Accounts that already have players skip it silently, so existing users never
// see it. Rendered as a full-screen overlay above the tabs (not a Modal, so
// toasts stay visible).
const SetupWizard = ({ session }: Props) => {
  const toast = useToast();
  const rulesetStatus = useRulesetStatus();
  const insets = useSafeAreaInsets();
  const wizardKey = WIZARD_KEY_PREFIX + session.user.id;

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const [teamId, setTeamId] = useState<string | null>(null);

  const [rulesMode, setRulesMode] = useState<RulesMode>("search");
  const [leagueQuery, setLeagueQuery] = useState("");
  const [leagueResults, setLeagueResults] = useState<LeagueSummary[] | null>(null);
  // null until the first check completes; false disables search entirely.
  const [anyLeaguesExist, setAnyLeaguesExist] = useState<boolean | null>(null);
  const [joiningLeagueId, setJoiningLeagueId] = useState<string | null>(null);
  const [sportDraft, setSportDraft] = useState<string | null>(null);
  const [rulesDraft, setRulesDraft] = useState("");
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [isSavingRules, setIsSavingRules] = useState(false);
  // Sheet shown over the Roster tab after the wizard hands off. `noticeOpen`
  // drives the sheet's exit animation; `notice` keeps the last copy.
  const [notice, setNotice] = useState<SetupNotice | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const noticeOpenRef = useRef(false);
  noticeOpenRef.current = noticeOpen;
  const [leagueNameDraft, setLeagueNameDraft] = useState("");
  const [leaguePlace, setLeaguePlace] = useState<PlaceValue | null>(null);
  const [segmentCountDraft, setSegmentCountDraft] = useState("");
  const [playersOnFieldDraft, setPlayersOnFieldDraft] = useState("");
  const [similarLeagues, setSimilarLeagues] = useState<LeagueSuggestion[] | null>(null);


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

  const finish = useCallback(() => {
    void AsyncStorage.setItem(wizardKey, "done");
    setVisible(false);
  }, [wizardKey]);

  // Rules submitted (or saving): the wizard is over. The coach lands on the
  // Roster tab to add players while the engine is built; the sheet says why.
  const handOffToRoster = useCallback((next: SetupNotice) => {
    setVisible(false);
    setNotice(next);
    setNoticeOpen(true);
    navigateFromRef("Main", { screen: "RosterTab" });
  }, []);

  // The server answered after the hand-off. Update the sheet if it is still
  // up; otherwise a toast carries the same headline.
  const announceResult = useCallback(
    (next: SetupNotice) => {
      void AsyncStorage.setItem(wizardKey, "done");
      setNotice(next);
      if (!noticeOpenRef.current) {
        toast.show({ message: noticeCopy(next).title, type: "info" });
      }
    },
    [toast, wizardKey],
  );

  const confirmSkip = useCallback(() => {
    Alert.alert(
      "Finish setup later?",
      "You can set rules from the Rules page and add players from the Roster tab anytime.",
      [
        { text: "Keep going", style: "cancel" },
        { text: "Set up later", style: "destructive", onPress: finish },
      ],
    );
  }, [finish]);

  // ── Rules step ────────────────────────────────────────────────────────────

  // An empty query returns the newest leagues, so this doubles as "are there
  // any leagues at all?" without a dedicated endpoint.
  useEffect(() => {
    if (step !== "rules" || anyLeaguesExist !== null) return;
    let cancelled = false;
    backendClient
      .searchLeagues("")
      .then((leagues) => {
        if (!cancelled) setAnyLeaguesExist(leagues.length > 0);
      })
      .catch(() => {
        // Leave search enabled if the check fails; a real search surfaces the error.
        if (!cancelled) setAnyLeaguesExist(true);
      });
    return () => {
      cancelled = true;
    };
  }, [anyLeaguesExist, step]);

  // Nothing to search when Coachr has no leagues yet: skip straight to the
  // Create / Own options.
  useEffect(() => {
    if (anyLeaguesExist === false && rulesMode === "search") setRulesMode("options");
  }, [anyLeaguesExist, rulesMode]);

  useEffect(() => {
    if (step === "rules") trace("wizard rules mode", { rulesMode, anyLeaguesExist });
  }, [anyLeaguesExist, rulesMode, step]);

  useEffect(() => {
    if (rulesMode !== "search") return;
    const term = leagueQuery.trim();
    if (!term) {
      setLeagueResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setLeagueResults(await backendClient.searchLeagues(term));
      } catch (err) {
        toast.show({ message: toError(err).message, type: "error" });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [leagueQuery, rulesMode, toast]);

  const joinLeague = useCallback(
    async (league: LeagueSummary) => {
      if (!teamId || joiningLeagueId) return;
      setJoiningLeagueId(league.id);
      trace("wizard join league", { leagueId: league.id, name: league.name });
      try {
        const next = await backendClient.setTeamLeague(teamId, league.id);
        void rulesetStatus.refresh();
        void AsyncStorage.setItem(wizardKey, "done");
        handOffToRoster({
          kind: "joined",
          leagueName: league.name,
          status: next.ruleset?.status ?? "baking",
        });
      } catch (err) {
        toast.show({ message: toError(err).message, type: "error" });
      } finally {
        setJoiningLeagueId(null);
      }
    },
    [handOffToRoster, joiningLeagueId, rulesetStatus, teamId, toast, wizardKey],
  );

  // Mirrors the server's validation so the buttons only enable for a payload
  // that will pass it.
  const parsedSegmentCount = parseCount(segmentCountDraft);
  const parsedPlayersOnField = parseCount(playersOnFieldDraft);
  const sizeValid = parsedSegmentCount !== null && parsedPlayersOnField !== null;
  const createValid =
    leagueNameDraft.trim().length >= 2 &&
    sportDraft !== null &&
    leaguePlace !== null &&
    sizeValid &&
    rulesDraft.trim().length >= 10;
  const ownValid = sportDraft !== null && sizeValid && rulesDraft.trim().length >= 10;

  // Both saves are optimistic: the wizard advances to the roster step at once
  // and the request finishes in the background. A failure bounces the coach
  // back to the same form with drafts intact and the error shown.
  const createLeague = useCallback(
    async (confirmDistinct: boolean) => {
      if (
        !teamId ||
        !createValid ||
        sportDraft === null ||
        leaguePlace === null ||
        parsedSegmentCount === null ||
        parsedPlayersOnField === null
      ) {
        return;
      }
      const draft: CreateLeagueDraft = {
        sport: sportDraft,
        rulesText: rulesDraft.trim(),
        name: leagueNameDraft.trim(),
        city: leaguePlace.city,
        state: leaguePlace.state,
        zip: leaguePlace.zip,
        segmentCount: parsedSegmentCount,
        playersOnField: parsedPlayersOnField,
        confirmDistinct,
      };
      setRulesError(null);
      setSimilarLeagues(null);
      setIsSavingRules(true);
      handOffToRoster({ kind: "saving" });
      trace("wizard create league submit", { ...draft, rulesText: draft.rulesText.length + " chars" });
      try {
        const league = await backendClient.createLeague({
          name: draft.name,
          sport: draft.sport,
          city: draft.city,
          state: draft.state,
          zip: draft.zip,
          segmentCount: draft.segmentCount,
          playersOnField: draft.playersOnField,
          rulesText: draft.rulesText,
          confirmDistinct: draft.confirmDistinct,
        });
        trace("wizard create league ok", {
          leagueId: league.id,
          status: league.status,
          rulesetId: league.ruleset.id,
        });
        await backendClient.setTeamLeague(teamId, league.id);
        void rulesetStatus.refresh();
        announceResult({ kind: "rules", status: league.status });
      } catch (err) {
        // Bounce back: reopen the wizard on the form with drafts intact.
        setNoticeOpen(false);
        setVisible(true);
        setStep("rules");
        setRulesMode("create");
        const similar = getSimilarLeaguesError(err);
        trace("wizard create league failed", {
          similar: similar?.map((league) => ({ id: league.id, name: league.name, matchReasons: league.matchReasons })) ?? null,
          error: similar ? null : toError(err).message,
        });
        if (similar) {
          setSimilarLeagues(similar);
          toast.show({
            message: "Your league may already be on Coachr. Pick it or confirm yours is different.",
            type: "info",
          });
          return;
        }
        setRulesError(toError(err).message);
        toast.show({ message: "We couldn't save your rules.", type: "error" });
      } finally {
        setIsSavingRules(false);
      }
    },
    [
      announceResult,
      createValid,
      handOffToRoster,
      leagueNameDraft,
      leaguePlace,
      parsedPlayersOnField,
      parsedSegmentCount,
      rulesDraft,
      rulesetStatus,
      sportDraft,
      teamId,
      toast,
    ],
  );

  const saveOwnRules = useCallback(async () => {
    if (
      !teamId ||
      !ownValid ||
      sportDraft === null ||
      parsedSegmentCount === null ||
      parsedPlayersOnField === null
    ) {
      return;
    }
    const draft: OwnRulesDraft = {
      sport: sportDraft,
      rulesText: rulesDraft.trim(),
      segmentCount: parsedSegmentCount,
      playersOnField: parsedPlayersOnField,
    };
    setRulesError(null);
    setSimilarLeagues(null);
    setIsSavingRules(true);
    handOffToRoster({ kind: "saving" });
    trace("wizard own rules submit", { ...draft, rulesText: draft.rulesText.length + " chars" });
    try {
      const next = await backendClient.upsertTeamRules(teamId, {
        rulesText: draft.rulesText,
        sport: draft.sport,
        segmentCount: draft.segmentCount,
        playersOnField: draft.playersOnField,
      });
      void rulesetStatus.refresh();
      announceResult({ kind: "rules", status: next.ruleset?.status ?? "baking" });
    } catch (err) {
      setNoticeOpen(false);
      setVisible(true);
      setStep("rules");
      setRulesMode("own");
      setRulesError(toError(err).message);
      toast.show({ message: "We couldn't save your rules.", type: "error" });
    } finally {
      setIsSavingRules(false);
    }
  }, [
    announceResult,
    handOffToRoster,
    ownValid,
    parsedPlayersOnField,
    parsedSegmentCount,
    rulesDraft,
    rulesetStatus,
    sportDraft,
    teamId,
    toast,
  ]);

  const noticeSheet = (
    <Sheet
      visible={noticeOpen && notice !== null}
      onClose={() => setNoticeOpen(false)}
      title={notice ? noticeCopy(notice).title : undefined}
    >
      {notice ? (
        <AppText variant="body" color="secondary">
          {noticeCopy(notice).body}
        </AppText>
      ) : null}
      <Button
        label="Add players"
        icon="users"
        size="lg"
        fullWidth
        onPress={() => setNoticeOpen(false)}
        accessibilityLabel="Close and add players"
      />
    </Sheet>
  );

  if (!visible) return noticeSheet;

  const stepIndex = STEPS.indexOf(step);
  // With no leagues on Coachr the options stage is the root of the rules step.
  const rulesRoot: RulesMode = anyLeaguesExist === false ? "options" : "search";
  const inRulesSubMode = step === "rules" && rulesMode !== rulesRoot;
  const canGoBack = inRulesSubMode || stepIndex > 0;

  const goBack = () => {
    if (inRulesSubMode) {
      setSimilarLeagues(null);
      setRulesError(null);
      setRulesMode(rulesMode === "options" ? "search" : "options");
      return;
    }
    setStep(STEPS[stepIndex - 1]);
  };

  const rulesTitles: Record<RulesMode, string> = {
    search: "Which league do you play in?",
    options: "Set up your rules",
    create: "Start a shared league",
    own: "Write your rules in plain English",
  };
  const rulesTitle = rulesTitles[rulesMode];

  const footerPadding = { paddingBottom: Math.max(insets.bottom, space.md) };

  // The overlay is absolutely positioned, so the parent SafeAreaView's padding
  // doesn't reach it - it needs the top inset itself.
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
      <AmbientBackground />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {canGoBack ? (
            <AppPressable
              onPress={goBack}
              style={styles.backChevron}
              pressScale={1}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Feather name="chevron-left" size={22} color={theme.text.primary} />
            </AppPressable>
          ) : null}
          <View
            style={styles.progress}
            accessibilityLabel={`Step ${stepIndex + 1} of ${STEPS.length}`}
          >
            {STEPS.map((name, index) => (
              <View
                key={name}
                style={[styles.progressBar, index <= stepIndex && styles.progressBarActive]}
              />
            ))}
          </View>
        </View>
        <Button
          label="Set up later"
          variant="secondary"
          size="sm"
          onPress={confirmSkip}
          accessibilityLabel="Finish setup later"
        />
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
              <AppText style={styles.heroTitle}>Let's get your first lineup ready</AppText>
              <AppText variant="bodyLg" color="secondary">
                One quick step: your rules. Then add your players and you're generating.
              </AppText>
              <View style={styles.checklist}>
                {WELCOME_ITEMS.map((item, index) => (
                  <View key={item.label} style={styles.checkRow}>
                    <View style={styles.numberCircle}>
                      <AppText variant="bodyLg" family="display" color="accent">
                        {index + 1}
                      </AppText>
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
            </Reveal>
          ) : null}

          {step === "rules" ? (
            <Reveal key={rulesMode} style={styles.stack}>
              <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
                Rules
              </AppText>
              <AppText variant="display" family="display" style={styles.title}>
                {rulesTitle}
              </AppText>

              {rulesMode === "search" ? (
                <View style={styles.stack}>
                  <Input
                    value={leagueQuery}
                    onChangeText={setLeagueQuery}
                    placeholder="Search by league name or zip"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    highlighted={leagueQuery.trim().length > 0}
                    left={<Feather name="search" size={16} color={theme.accent.base} />}
                    accessibilityLabel="Search leagues"
                  />
                  {leagueResults && leagueResults.length > 0 ? (
                    <ListGroup>
                      {leagueResults.slice(0, 6).map((league) => (
                        <LeagueRow
                          key={league.id}
                          league={league}
                          onPress={() => void joinLeague(league)}
                          action={{ label: "Join", busy: joiningLeagueId === league.id }}
                        />
                      ))}
                    </ListGroup>
                  ) : null}
                  {leagueResults && leagueResults.length === 0 ? (
                    <AppText variant="caption" color="secondary">
                      No leagues match "{leagueQuery.trim()}" yet.
                    </AppText>
                  ) : null}
                  {!leagueResults ? (
                    <AppText variant="caption" color="secondary">
                      If it's on Coachr, you get its rules instantly.
                    </AppText>
                  ) : null}

                  <AppPressable
                    onPress={() => {
                      if (!leagueNameDraft && leagueQuery.trim()) {
                        setLeagueNameDraft(leagueQuery.trim());
                      }
                      setRulesMode("options");
                    }}
                    pressScale={motion.pressScale}
                    style={styles.linkRow}
                    accessibilityRole="button"
                    accessibilityLabel="League not here? Set up your rules another way"
                  >
                    <AppText variant="body" family="heading" color="accent">
                      League not here?
                    </AppText>
                    <Feather name="chevron-right" size={16} color={theme.accent.base} />
                  </AppPressable>
                </View>
              ) : null}

              {rulesMode === "options" ? (
                <View style={styles.stack}>
                  <AppText variant="body" color="secondary">
                    {anyLeaguesExist === false
                      ? "Be the first league on Coachr."
                      : "Create your league once so every team in it can join, or keep rules to your own team."}
                  </AppText>
                  <OptionRow
                    icon="plus"
                    title="Create a league"
                    detail="Every team in it can use your rules"
                    onPress={() => setRulesMode("create")}
                  />
                  <OptionRow
                    icon="edit-3"
                    title="Write my own rules"
                    detail="Just your team, plain English"
                    onPress={() => setRulesMode("own")}
                  />
                  {anyLeaguesExist !== false ? (
                    <AppPressable
                      onPress={() => setRulesMode("search")}
                      pressScale={motion.pressScale}
                      style={styles.linkRow}
                      accessibilityRole="button"
                      accessibilityLabel="Back to search"
                    >
                      <Feather name="chevron-left" size={16} color={theme.accent.base} />
                      <AppText variant="body" family="heading" color="accent">
                        Back to search
                      </AppText>
                    </AppPressable>
                  ) : null}
                </View>
              ) : null}

              {rulesMode === "create" ? (
                <View style={styles.stack}>
                  <Input
                    label="League name"
                    value={leagueNameDraft}
                    onChangeText={(value) => {
                      setLeagueNameDraft(value);
                      setSimilarLeagues(null);
                    }}
                    placeholder="Austin Coed Softball"
                    accessibilityLabel="League name"
                  />
                  <SportPicker
                    value={sportDraft}
                    onChange={(code) => {
                      setSportDraft(code);
                      setSimilarLeagues(null);
                    }}
                  />
                  <PlaceSearch
                    value={leaguePlace}
                    onChange={(next) => {
                      setLeaguePlace(next);
                      setSimilarLeagues(null);
                    }}
                  />
                  <View style={styles.fieldRow}>
                    <Input
                      label="Innings or periods"
                      value={segmentCountDraft}
                      onChangeText={(value) => setSegmentCountDraft(digitsOnly(value, 2))}
                      placeholder="7"
                      keyboardType="number-pad"
                      maxLength={2}
                      containerStyle={styles.flex}
                      accessibilityLabel="Innings or periods"
                    />
                    <Input
                      label="Players on field"
                      value={playersOnFieldDraft}
                      onChangeText={(value) => setPlayersOnFieldDraft(digitsOnly(value, 2))}
                      placeholder="10"
                      keyboardType="number-pad"
                      maxLength={2}
                      containerStyle={styles.flex}
                      accessibilityLabel="Players on the field"
                    />
                  </View>
                  <Input
                    label="League rules"
                    value={rulesDraft}
                    onChangeText={(value) => {
                      setRulesDraft(value);
                      if (rulesError) setRulesError(null);
                    }}
                    placeholder="7 innings, 10 on the field, at least 3 women, nobody sits twice in a row…"
                    multiline
                    textAlignVertical="top"
                    style={styles.textareaCreate}
                    error={rulesError}
                    hint={RULES_HINT}
                    accessibilityLabel="League rules"
                  />
                  {similarLeagues ? (
                    <View style={styles.stack}>
                      <AppText variant="bodyLg" family="heading">
                        Is your league one of these?
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        Same sport in your zip, or a similar name. Join it, or confirm
                        yours is different.
                      </AppText>
                      <ListGroup>
                        {similarLeagues.slice(0, 3).map((league) => (
                          <LeagueRow
                            key={league.id}
                            league={league}
                            tags={describeMatchReasons(league.matchReasons)}
                            onPress={() => void joinLeague(league)}
                            action={{ label: "Join", busy: joiningLeagueId === league.id }}
                          />
                        ))}
                      </ListGroup>
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
                      size="lg"
                      fullWidth
                      loading={isSavingRules}
                      disabled={!createValid}
                      onPress={() => void createLeague(false)}
                      accessibilityLabel="Create league"
                    />
                  )}
                </View>
              ) : null}

              {rulesMode === "own" ? (
                <View style={styles.stack}>
                  <SportPicker value={sportDraft} onChange={setSportDraft} />
                  <View style={styles.fieldRow}>
                    <Input
                      label="Innings or periods"
                      value={segmentCountDraft}
                      onChangeText={(value) => setSegmentCountDraft(digitsOnly(value, 2))}
                      placeholder="7"
                      keyboardType="number-pad"
                      maxLength={2}
                      containerStyle={styles.flex}
                      accessibilityLabel="Innings or periods"
                    />
                    <Input
                      label="Players on field"
                      value={playersOnFieldDraft}
                      onChangeText={(value) => setPlayersOnFieldDraft(digitsOnly(value, 2))}
                      placeholder="10"
                      keyboardType="number-pad"
                      maxLength={2}
                      containerStyle={styles.flex}
                      accessibilityLabel="Players on the field"
                    />
                  </View>
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
                    style={styles.textareaOwn}
                    error={rulesError}
                    hint={RULES_HINT}
                    accessibilityLabel="Team rules"
                  />
                  <Button
                    label="Save rules"
                    size="lg"
                    fullWidth
                    loading={isSavingRules}
                    disabled={!ownValid}
                    onPress={() => void saveOwnRules()}
                    accessibilityLabel="Save rules"
                  />
                </View>
              ) : null}
            </Reveal>
          ) : null}

        </ScrollView>

        {step === "welcome" ? (
          <View style={[styles.footer, footerPadding]}>
            <Button
              label="Set up my team"
              size="lg"
              fullWidth
              onPress={() => setStep("rules")}
              accessibilityLabel="Start setup"
            />
          </View>
        ) : null}

      </KeyboardAvoidingView>
      {noticeSheet}
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
  progress: {
    flexDirection: "row",
    gap: space.xs,
  },
  progressBar: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border.base,
  },
  progressBarActive: {
    backgroundColor: theme.accent.base,
  },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.xs,
  },
  stack: {
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    letterSpacing: -0.2,
  },
  heroTitle: {
    fontFamily: typeface.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
  },
  checklist: {
    gap: space.md,
    paddingVertical: space.md,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  numberCircle: {
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
    flex: 1,
    gap: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: theme.accent.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xxs,
    paddingVertical: space.xs,
    minHeight: 44,
  },
  fieldRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  textareaCreate: {
    minHeight: 120,
  },
  textareaOwn: {
    minHeight: 150,
  },
});

export default SetupWizard;
