import { useCallback, useEffect, useState } from "react";
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
  ScreenContainer,
  ScreenHeader,
  Sheet,
  Skeleton,
  SkeletonMetricRow,
  useToast,
} from "../components/ui";
import { BackendSession } from "../lib/backend/types";
import { backendClient } from "../lib/backend/client";
import { toError } from "../lib/backend/utils";
import { radius, space } from "../theme/tokens";
import { RulesetPayload, TeamRulesState } from "../types/rules";

type Props = {
  session: BackendSession;
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

const RulesScreen = ({ session, onOpenLeagues }: Props) => {
  const toast = useToast();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rules, setRules] = useState<TeamRulesState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rulesDraft, setRulesDraft] = useState("");
  const [sportDraft, setSportDraft] = useState("");
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [isSavingRules, setIsSavingRules] = useState(false);

  const [prefsDraft, setPrefsDraft] = useState("");
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
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
    setSportDraft(next.ruleset?.sport ?? "");
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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadRules().finally(() => setRefreshing(false));
  }, [loadRules]);

  const handleCheckStatus = useCallback(async () => {
    if (!rules?.ruleset) return;
    setIsCheckingStatus(true);
    try {
      const ruleset = await backendClient.getRuleset(rules.ruleset.id);
      setRules((prev) => (prev ? { ...prev, ruleset } : prev));
      toast.show({
        message:
          ruleset.status === "active"
            ? "Your rules are ready."
            : "Still working on it. We'll email you.",
        type: ruleset.status === "active" ? "success" : "info",
      });
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    } finally {
      setIsCheckingStatus(false);
    }
  }, [rules, toast]);

  const handleSaveRules = useCallback(async () => {
    const rulesText = rulesDraft.trim();
    if (!rulesText) {
      setRulesError("Describe your rules before saving.");
      return;
    }
    setRulesError(null);
    setIsSavingRules(true);
    try {
      const team = await ensureTeam();
      if (!team) return;

      const next = await backendClient.upsertTeamRules(team, {
        rulesText,
        sport: sportDraft.trim() || undefined,
      });
      applyRules(next);
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
  }, [applyRules, ensureTeam, rulesDraft, sportDraft, toast]);

  const handleSavePrefs = useCallback(async () => {
    setIsSavingPrefs(true);
    try {
      const team = await ensureTeam();
      if (!team) return;

      const next = await backendClient.upsertTeamRules(team, {
        coachPreferences: prefsDraft,
      });
      setRules(next);
      toast.show({ message: "Coach notes saved.", type: "success" });
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    } finally {
      setIsSavingPrefs(false);
    }
  }, [ensureTeam, prefsDraft, toast]);

  const leaveLeague = useCallback(async () => {
    setIsLeaving(true);
    try {
      const team = await ensureTeam();
      if (!team) return;

      applyRules(await backendClient.setTeamLeague(team, null));
      toast.show({ message: "Left the league. Set up your own rules below.", type: "info" });
    } catch (err) {
      toast.show({ message: toError(err).message, type: "error" });
    } finally {
      setIsLeaving(false);
    }
  }, [applyRules, ensureTeam, toast]);

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
  const rulesDirty = rulesDraft.trim() !== (rules?.rulesText ?? "").trim();
  const prefsDirty = prefsDraft !== (rules?.coachPreferences ?? "");

  return (
    <ScreenContainer
      keyboard
      scroll
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentStyle={styles.content}
    >
      <ScreenHeader
        title="Lineup Rules"
        subtitle={
          league
            ? "Your team plays by its league's rules."
            : "Describe your rules once. Coachr builds the lineup engine."
        }
      />

      <LoadTransition
        loading={isLoading}
        style={styles.loadedStack}
        skeleton={
          <>
            <Skeleton height={150} radius={radius.lg} />
            <SkeletonMetricRow count={3} height={67} />
            <Skeleton height={260} radius={radius.lg} />
            <Skeleton height={140} radius={radius.lg} />
          </>
        }
      >
        {ruleset && ruleset.status !== "active" ? (
          <RulesetStatusBanner
            status={ruleset.status}
            onCheckStatus={handleCheckStatus}
            checking={isCheckingStatus}
          />
        ) : null}

        {!league ? (
          <Card variant="elevated">
            <View style={styles.cardInner}>
              <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
                Start here
              </AppText>
              <View style={styles.rowBetween}>
                <View style={styles.rowText}>
                  <AppText variant="title" family="heading">
                    Is your league on Coachr?
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    Join it and your team plays by its rules — nothing to write. Not
                    there? Create it once for every team, or set up your own rules
                    below.
                  </AppText>
                </View>
              </View>
              <Button
                label="Find or create your league"
                icon="search"
                onPress={onOpenLeagues}
                fullWidth
                accessibilityLabel="Find or create your league"
              />
            </View>
          </Card>
        ) : null}

        {league ? (
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
              <AppText variant="caption" color="muted">
                League rules are shared and can't be edited here. Spot a mistake or a
                rule change? Send a request and we'll update it for every team.
              </AppText>
              <View style={styles.buttonRow}>
                <View style={styles.buttonGrow}>
                  <Button
                    label="Request a change"
                    icon="edit-3"
                    variant="secondary"
                    fullWidth
                    onPress={() => setChangeSheetVisible(true)}
                    accessibilityLabel="Request a change to the league rules"
                  />
                </View>
                <Button
                  label="Leave"
                  variant="danger"
                  loading={isLeaving}
                  onPress={confirmLeaveLeague}
                  accessibilityLabel="Leave this league"
                />
              </View>
            </View>
          </Card>
        ) : (
          <Card variant="elevated">
            <View style={styles.cardInner}>
              <AppText variant="caption" family="heading" color="secondary" style={styles.eyebrow}>
                Or set up your own rules
              </AppText>
              <AppText variant="title" family="heading">
                Write your rules in plain English
              </AppText>
              <AppText variant="body" color="secondary">
                Players on the field, innings or periods, positions, gender rules,
                bench limits. Anything the rulebook says.
              </AppText>
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
                placeholder={RULES_PLACEHOLDER}
                multiline
                textAlignVertical="top"
                style={styles.textarea}
                error={rulesError}
                hint="Simple rules go live instantly. Unusual ones get a custom engine built in a few minutes."
                accessibilityLabel="Team rules"
              />
              <Button
                label={ruleset ? "Save rules" : "Set up rules"}
                icon="check"
                onPress={handleSaveRules}
                loading={isSavingRules}
                disabled={!rulesDirty && !!ruleset}
                fullWidth
                accessibilityLabel="Save team rules"
              />
            </View>
          </Card>
        )}

        {ruleset ? (
          <RulesSummary
            spec={ruleset.spec}
            unexpressedRules={ruleset.unexpressedRules}
            eyebrow={league ? "League rules" : "What's enforced"}
          />
        ) : (
          <Card variant="outline" padding="xxs">
            <EmptyState
              icon="clipboard"
              title="No rules yet"
              body="Write your rules above, or join a league to use its rules."
            />
          </Card>
        )}

        <Card>
          <View style={styles.cardInner}>
            <AppText variant="bodyLg" family="heading">
              Coach notes
            </AppText>
            <AppText variant="caption" color="secondary">
              Personal reminders for game day. Saved with your team, never shared
              with the league, and not applied by the generator — use player
              positions, locks, and bench flags for that.
            </AppText>
            <Input
              value={prefsDraft}
              onChangeText={setPrefsDraft}
              placeholder="Sam prefers SS in late innings. Keep the Ortiz twins apart."
              multiline
              textAlignVertical="top"
              style={styles.notes}
              accessibilityLabel="Coach notes"
            />
            <Button
              label="Save notes"
              variant="secondary"
              onPress={handleSavePrefs}
              loading={isSavingPrefs}
              disabled={!prefsDirty}
              fullWidth
              accessibilityLabel="Save coach notes"
            />
          </View>
        </Card>
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
    gap: space.sm,
  },
  // Mirrors the screen's content gap so wrapping the loaded region in the
  // transition view doesn't change spacing.
  loadedStack: {
    gap: space.sm,
  },
  cardInner: {
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: space.xs,
    marginTop: space.xxs,
  },
  buttonGrow: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  rowText: {
    flex: 1,
    gap: space.xxs,
  },
  textarea: {
    minHeight: 120,
  },
  notes: {
    minHeight: 88,
  },
});

export default RulesScreen;
