import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import RulesSummary from "../components/rules/RulesSummary";
import RulesetStatusBanner from "../components/rules/RulesetStatusBanner";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Input,
  LoadTransition,
  PageHeader,
  ScreenContainer,
  SectionLabel,
  Sheet,
  SportPicker,
  Skeleton,
  SkeletonMetricRow,
  useToast,
} from "../components/ui";
import { BackendSession } from "../lib/backend/types";
import { clearReads } from "../lib/backend/cache";
import { backendClient } from "../lib/backend/client";
import { toError } from "../lib/backend/utils";
import { useRulesetStatus } from "../lib/rulesetStatus/RulesetStatusProvider";
import { radius, space } from "../theme/tokens";
import { RulesetPayload, TeamRulesState } from "../types/rules";
import { digitsOnly, parseCount } from "../utils/formNumbers";
import { describeLeague } from "./leagues/LeagueRow";

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenLeagues: () => void;
};

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const RULES_PLACEHOLDER =
  "e.g. Coed softball, 7 innings, 10 on the field (P, C, 1B, 2B, 3B, SS, LF, LCF, RCF, RF). At least 3 women; with exactly 3 women play 9 and the catcher must be a man. Nobody sits two innings in a row.";

const savedRulesMessage = (ruleset: RulesetPayload): string => {
  switch (ruleset.status) {
    case "active":
      return "Rules saved and ready to generate.";
    case "baking":
      return "Rules saved. We're building your lineup engine.";
    case "review":
      return "Rules saved and sent for review.";
    case "rejected":
      return "These rules couldn't be supported.";
  }
};

const RulesScreen = ({ session, onBack, onOpenLeagues }: Props) => {
  const toast = useToast();
  const rulesetStatus = useRulesetStatus();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rules, setRules] = useState<TeamRulesState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rulesDraft, setRulesDraft] = useState("");
  const [sportDraft, setSportDraft] = useState<string | null>(null);
  const [segmentCountDraft, setSegmentCountDraft] = useState("");
  const [playersOnFieldDraft, setPlayersOnFieldDraft] = useState("");
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [isSavingRules, setIsSavingRules] = useState(false);

  const [prefsDraft, setPrefsDraft] = useState("");

  const [isLeaving, setIsLeaving] = useState(false);

  const [changeSheetVisible, setChangeSheetVisible] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isSendingChange, setIsSendingChange] = useState(false);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;

    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;

    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  // Drafts track the server state only when it changes underneath (load,
  // join/leave, save); typing never gets clobbered by a background refresh.
  const applyRules = useCallback((next: TeamRulesState) => {
    setRules(next);
    setRulesDraft(next.rulesText ?? "");
    setSportDraft(next.ruleset?.sport ?? null);
    setSegmentCountDraft(next.ruleset ? String(next.ruleset.spec.segment.count) : "");
    setPlayersOnFieldDraft(next.ruleset ? String(next.ruleset.spec.field.playersOnField) : "");
    setPrefsDraft(next.coachPreferences);
  }, []);

  const loadRules = useCallback(async () => {
    try {
      setLoadError(null);
      const team = await ensureTeam();
      if (!team) return;

      applyRules(await backendClient.getTeamRules(team));
    } catch (_err) {
      setLoadError("Unable to load rules.");
    } finally {
      setIsLoading(false);
    }
  }, [applyRules, ensureTeam]);

  // Reload on focus: joining a league on the Leagues screen, or a ruleset
  // finishing baking, must show up when the coach comes back here.
  useFocusEffect(
    useCallback(() => {
      loadRules().catch(() => {
        setLoadError("Unable to load rules.");
        setIsLoading(false);
      });
    }, [loadRules]),
  );

  useEffect(() => {
    if (!loadError) return;
    toast.show({ message: loadError, type: "error" });
  }, [loadError, toast]);

  // The provider polls while baking; when it observes "active" and this
  // screen still shows the pending ruleset, reload so it flips in place.
  const localStatusRef = useRef<string | null>(null);
  localStatusRef.current = rules?.ruleset?.status ?? null;
  useEffect(() => {
    if (rulesetStatus.status !== "active") return;
    if (localStatusRef.current === null || localStatusRef.current === "active") return;
    void loadRules();
  }, [loadRules, rulesetStatus.status]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Pull-to-refresh means "go to the server", not "reuse the last read".
    clearReads();
    loadRules().finally(() => setRefreshing(false));
  }, [loadRules]);

  const handleSaveRules = useCallback(async () => {
    const rulesText = rulesDraft.trim();
    if (!rulesText) {
      setRulesError("Describe your rules before saving.");
      return;
    }
    if (sportDraft === null) {
      setRulesError("Pick a sport.");
      return;
    }
    const segmentCount = parseCount(segmentCountDraft);
    const playersOnField = parseCount(playersOnFieldDraft);
    if (segmentCount === null || playersOnField === null) {
      setRulesError("Enter how many innings or periods you play and how many players are on the field (1–30).");
      return;
    }
    setRulesError(null);
    setIsSavingRules(true);
    try {
      const team = await ensureTeam();
      if (!team) return;

      const next = await backendClient.upsertTeamRules(team, {
        rulesText,
        sport: sportDraft,
        segmentCount,
        playersOnField,
      });
      applyRules(next);
      void rulesetStatus.refresh();
      if (next.ruleset) {
        toast.show({
          message: savedRulesMessage(next.ruleset),
          type: next.ruleset.status === "active" ? "success" : "info",
        });
      }
    } catch (err) {
      setRulesError(toError(err).message);
    } finally {
      setIsSavingRules(false);
    }
  }, [
    applyRules,
    ensureTeam,
    playersOnFieldDraft,
    rulesDraft,
    rulesetStatus,
    segmentCountDraft,
    sportDraft,
    toast,
  ]);

  // Coach notes persist quietly when the field blurs.
  const handleSavePrefs = useCallback(async () => {
    if (prefsDraft === (rules?.coachPreferences ?? "")) return;
    try {
      const team = await ensureTeam();
      if (!team) return;

      const next = await backendClient.upsertTeamRules(team, {
        coachPreferences: prefsDraft,
      });
      setRules(next);
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    }
  }, [ensureTeam, prefsDraft, rules?.coachPreferences, toast]);

  const leaveLeague = useCallback(async () => {
    setIsLeaving(true);
    try {
      const team = await ensureTeam();
      if (!team) return;

      applyRules(await backendClient.setTeamLeague(team, null));
      void rulesetStatus.refresh();
      toast.show({ message: "Left the league. Set up your own rules below.", type: "info" });
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    } finally {
      setIsLeaving(false);
    }
  }, [applyRules, ensureTeam, rulesetStatus, toast]);

  const confirmLeaveLeague = useCallback(() => {
    if (!rules?.league) return;
    Alert.alert(
      `Leave ${rules.league.name}?`,
      "Your team will need its own rules before generating lineups again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave league", style: "destructive", onPress: () => void leaveLeague() },
      ],
    );
  }, [leaveLeague, rules]);

  const handleSendChangeRequest = useCallback(async () => {
    const message = changeMessage.trim();
    if (message.length < 5) {
      setChangeError("Tell us what should change.");
      return;
    }
    if (!rules?.league) return;
    setChangeError(null);
    setIsSendingChange(true);
    try {
      await backendClient.createChangeRequest(rules.league.id, message);
      setChangeSheetVisible(false);
      setChangeMessage("");
      toast.show({ message: "Change request sent. We'll follow up by email.", type: "success" });
    } catch (err) {
      setChangeError(toError(err).message);
    } finally {
      setIsSendingChange(false);
    }
  }, [changeMessage, rules, toast]);

  const league = rules?.league ?? null;
  const ruleset = rules?.ruleset ?? null;
  const savedSegmentCount = ruleset ? String(ruleset.spec.segment.count) : "";
  const savedPlayersOnField = ruleset ? String(ruleset.spec.field.playersOnField) : "";
  const rulesDirty =
    rulesDraft.trim() !== (rules?.rulesText ?? "").trim() ||
    sportDraft !== (ruleset?.sport ?? null) ||
    segmentCountDraft !== savedSegmentCount ||
    playersOnFieldDraft !== savedPlayersOnField;

  return (
    <ScreenContainer
      keyboard
      scroll
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentStyle={styles.content}
    >
      {league ? (
        <PageHeader
          back={{ label: "Back", onPress: onBack }}
          eyebrow="League rules"
          title={league.name}
          subtitle={describeLeague(league)}
        />
      ) : (
        <PageHeader
          back={{ label: "Back", onPress: onBack }}
          eyebrow="Your rules"
          title={ruleset ? `${capitalize(ruleset.sport)} rules` : "Team rules"}
          subtitle={
            isLoading
              ? undefined
              : "Describe your rules once. Coachr builds the lineup engine."
          }
        />
      )}

      <LoadTransition
        loading={isLoading}
        style={styles.loadedStack}
        skeleton={
          <>
            <SkeletonMetricRow count={2} />
            <SkeletonMetricRow count={2} />
            <Skeleton height={120} radius={radius.lg} delay={120} />
            <Skeleton height={140} radius={radius.lg} delay={180} />
          </>
        }
      >
        {ruleset && ruleset.status !== "active" ? (
          <RulesetStatusBanner status={ruleset.status} />
        ) : null}

        {!league ? (
          <>
            <Card variant="glass" radius="xl">
              <View style={styles.cardInner}>
                <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
                  Start here
                </AppText>
                <AppText variant="title" family="heading">
                  Is your league on Coachr?
                </AppText>
                <AppText variant="body" color="secondary">
                  Join it and your team plays by its rules, nothing to write. Not
                  there? Create it once for every team, or set up your own rules
                  below.
                </AppText>
                <Button
                  label="Find or create your league"
                  icon="search"
                  onPress={onOpenLeagues}
                  fullWidth
                  accessibilityLabel="Find or create your league"
                />
              </View>
            </Card>

            <Card>
              <View style={styles.cardInner}>
                <AppText variant="title" family="heading">
                  Write your rules in plain English
                </AppText>
                <AppText variant="body" color="secondary">
                  Players on the field, innings or periods, positions, gender rules,
                  bench limits. Anything the rulebook says.
                </AppText>
                <SportPicker
                  value={sportDraft}
                  onChange={(code) => {
                    setSportDraft(code);
                    if (rulesError) setRulesError(null);
                  }}
                />
                <View style={styles.fieldRow}>
                  <Input
                    label="Innings or periods"
                    value={segmentCountDraft}
                    onChangeText={(value) => {
                      setSegmentCountDraft(digitsOnly(value, 2));
                      if (rulesError) setRulesError(null);
                    }}
                    placeholder="7"
                    keyboardType="number-pad"
                    maxLength={2}
                    containerStyle={styles.field}
                    accessibilityLabel="Innings or periods"
                  />
                  <Input
                    label="Players on field"
                    value={playersOnFieldDraft}
                    onChangeText={(value) => {
                      setPlayersOnFieldDraft(digitsOnly(value, 2));
                      if (rulesError) setRulesError(null);
                    }}
                    placeholder="10"
                    keyboardType="number-pad"
                    maxLength={2}
                    containerStyle={styles.field}
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
                  placeholder={RULES_PLACEHOLDER}
                  multiline
                  textAlignVertical="top"
                  style={styles.textarea}
                  error={rulesError}
                  hint="Simple rules go live instantly. Unusual ones get a custom engine built in a few minutes."
                  accessibilityLabel="Team rules"
                />
                <Button
                  label="Save rules"
                  size="lg"
                  onPress={handleSaveRules}
                  loading={isSavingRules}
                  disabled={!rulesDirty && !!ruleset}
                  fullWidth
                  accessibilityLabel="Save team rules"
                />
              </View>
            </Card>
          </>
        ) : null}

        {ruleset ? (
          <RulesSummary ruleset={ruleset} />
        ) : (
          <Card padding="xxs">
            <EmptyState
              icon="clipboard"
              title="No rules yet"
              body="Write your rules above, or join a league to use its rules."
            />
          </Card>
        )}

        <View style={styles.notes}>
          <SectionLabel>Coach notes</SectionLabel>
          <Input
            value={prefsDraft}
            onChangeText={setPrefsDraft}
            onBlur={() => void handleSavePrefs()}
            placeholder="Sam prefers SS in late innings. Keep the Ortiz twins apart."
            multiline
            textAlignVertical="top"
            style={styles.notesInput}
            hint="Private to you. Not applied by the generator."
            accessibilityLabel="Coach notes"
          />
        </View>

        {league ? (
          <View style={styles.footerRow}>
            <Button
              label="Request a change"
              variant="secondary"
              onPress={() => setChangeSheetVisible(true)}
              style={styles.footerGrow}
              accessibilityLabel="Request a change to the league rules"
            />
            <Button
              label="Leave"
              variant="danger"
              loading={isLeaving}
              onPress={confirmLeaveLeague}
              accessibilityLabel="Leave this league"
            />
          </View>
        ) : null}
      </LoadTransition>

      <Sheet
        visible={changeSheetVisible}
        onClose={() => setChangeSheetVisible(false)}
        title="Request a rule change"
        keyboard
      >
        <AppText variant="body" color="secondary">
          Describe what's wrong or what changed. An admin reviews every request and
          updates the league for all of its teams.
        </AppText>
        <Input
          value={changeMessage}
          onChangeText={(value) => {
            setChangeMessage(value);
            if (changeError) setChangeError(null);
          }}
          placeholder="We moved to 9 innings this season and RCF is no longer dropped with 3 women."
          multiline
          textAlignVertical="top"
          style={styles.textarea}
          error={changeError}
          autoFocus
          accessibilityLabel="Change request message"
        />
        <Button
          label="Send request"
          icon="send"
          onPress={handleSendChangeRequest}
          loading={isSendingChange}
          fullWidth
          accessibilityLabel="Send change request"
        />
      </Sheet>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.md,
  },
  // Mirrors the screen's content gap so wrapping the loaded region in the
  // transition view doesn't change spacing.
  loadedStack: {
    gap: space.md,
  },
  cardInner: {
    gap: space.sm,
  },
  fieldRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  field: {
    flex: 1,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  textarea: {
    minHeight: 120,
  },
  notes: {
    gap: space.xs,
  },
  notesInput: {
    minHeight: 60,
  },
  footerRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  footerGrow: {
    flex: 1,
  },
});

export default RulesScreen;
