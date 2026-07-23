import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import { Feather } from "../icons";
import { BackendSession } from "../lib/backend/types";
import { backendClient } from "../lib/backend/client";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  Chip,
  Input,
  LoadTransition,
  MetricTile,
  ScreenContainer,
  ScreenHeader,
  Skeleton,
  SkeletonMetricRow,
  useToast,
} from "../components/ui";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import {
  defaultTeamRulesConfig,
  parseTeamRulesConfig,
  sportPresets,
  stringifyTeamRulesConfig,
  TeamRulesConfig,
} from "../types/rules";

type Props = {
  session: BackendSession;
};

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const RulesScreen = ({ session }: Props) => {
  const toast = useToast();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rulesConfig, setRulesConfig] = useState<TeamRulesConfig>(
    defaultTeamRulesConfig,
  );
  const [slotDraft, setSlotDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;

    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;

    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadRules = useCallback(async () => {
    try {
      setError(null);
      const team = await ensureTeam();
      if (!team) return;

      const teamRules = await backendClient.getTeamRules(team);
      setRulesConfig(parseTeamRulesConfig(teamRules));
    } catch (_err) {
      setError("Unable to load rules.");
    } finally {
      setIsLoading(false);
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadRules().catch(() => {
      setError("Unable to load rules.");
      setIsLoading(false);
    });
  }, [loadRules]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const updateRulesConfig = useCallback((patch: Partial<TeamRulesConfig>) => {
    setRulesConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const applySportPreset = useCallback((sportKey: string) => {
    const preset = sportPresets[sportKey];
    if (!preset) return;

    setRulesConfig((prev) => ({
      ...preset,
      customInstructions: prev.customInstructions,
    }));
  }, []);

  const addSlot = useCallback(() => {
    const next = slotDraft.trim();
    if (!next) return;

    setRulesConfig((prev) => {
      const hasDuplicate = prev.lineupSlots.some(
        (slot) => slot.toLowerCase() === next.toLowerCase(),
      );
      if (hasDuplicate) return prev;
      return { ...prev, lineupSlots: [...prev.lineupSlots, next] };
    });
    setSlotDraft("");
  }, [slotDraft]);

  const removeSlot = useCallback((slotToRemove: string) => {
    setRulesConfig((prev) => ({
      ...prev,
      lineupSlots: prev.lineupSlots.filter((slot) => slot !== slotToRemove),
    }));
  }, []);

  const normalizeSlotsToFieldCount = useCallback(() => {
    setRulesConfig((prev) => {
      const clean = prev.lineupSlots
        .map((slot) => slot.trim())
        .filter(Boolean)
        .filter(
          (slot, idx, arr) =>
            arr.findIndex((candidate) => candidate.toLowerCase() === slot.toLowerCase()) ===
            idx,
        );
      const next = [...clean];
      while (next.length < prev.playersOnField) {
        next.push(`Slot ${next.length + 1}`);
      }
      return {
        ...prev,
        lineupSlots: next.slice(0, prev.playersOnField),
      };
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setRulesConfig(defaultTeamRulesConfig);
    setStatus("Reset to default rules.");
  }, []);

  const toggleAdvancedRules = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAdvancedRules((prev) => !prev);
  }, []);

  const handleSaveRules = useCallback(async () => {
    setIsSavingRules(true);
    setError(null);
    try {
      const team = await ensureTeam();
      if (!team) {
        setError("Unable to find team to save rules.");
        return;
      }

      await backendClient.upsertTeamRules(team, stringifyTeamRulesConfig(rulesConfig));
      setStatus("Rules saved.");
      toast.show({ message: "Rules saved.", type: "success" });
    } catch (_err) {
      setError("Failed to save rules.");
    } finally {
      setIsSavingRules(false);
    }
  }, [ensureTeam, rulesConfig, toast]);

  const benchPerInning = useMemo(
    () => Math.max(rulesConfig.minimumPlayers - rulesConfig.playersOnField, 0),
    [rulesConfig.minimumPlayers, rulesConfig.playersOnField],
  );

  return (
    <ScreenContainer keyboard scroll contentStyle={styles.content}>
      <ScreenHeader
        title="Lineup Rules"
        subtitle="Set defaults once. Use Advanced only when needed."
      />

      <LoadTransition
        loading={isLoading}
        style={styles.loadedStack}
        skeleton={
          <>
            <SkeletonMetricRow count={3} height={67} />
            <Skeleton height={120} radius={radius.lg} />
            <Skeleton height={330} radius={radius.lg} />
            <Skeleton height={110} radius={radius.lg} />
          </>
        }
      >
      <View style={styles.metricsRow}>
        <MetricTile small label="Sport" value={capitalize(rulesConfig.sport)} />
        <MetricTile
          small
          label="Innings"
          value={`${rulesConfig.segmentCount} ${rulesConfig.segmentLabel}`}
        />
        <MetricTile small label="Bench / Inning" value={benchPerInning} />
      </View>

      <Card>
        <View style={styles.cardInner}>
          <AppText variant="bodyLg" family="heading">
            Sport Presets
          </AppText>
          <View style={styles.chipRow}>
            {Object.keys(sportPresets).map((sportKey) => (
              <Chip
                key={sportKey}
                label={capitalize(sportKey)}
                selected={rulesConfig.sport.toLowerCase() === sportKey}
                onPress={() => applySportPreset(sportKey)}
              />
            ))}
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.cardInner}>
          <AppText variant="bodyLg" family="heading">
            Core Rules
          </AppText>
          <View style={styles.row}>
            <Input
              label="Inning Label"
              value={rulesConfig.segmentLabel}
              onChangeText={(value) =>
                updateRulesConfig({ segmentLabel: value.trim() || "inning" })
              }
              placeholder="inning"
              containerStyle={styles.field}
              accessibilityLabel="Inning label"
            />
            <Input
              label="Inning Count"
              value={String(rulesConfig.segmentCount)}
              onChangeText={(value) =>
                updateRulesConfig({
                  segmentCount: Math.max(1, Number.parseInt(value || "1", 10) || 1),
                })
              }
              keyboardType="number-pad"
              containerStyle={styles.field}
              accessibilityLabel="Inning count"
            />
          </View>
          <View style={styles.row}>
            <Input
              label="Minimum Players"
              value={String(rulesConfig.minimumPlayers)}
              onChangeText={(value) =>
                updateRulesConfig({
                  minimumPlayers: Math.max(1, Number.parseInt(value || "1", 10) || 1),
                })
              }
              keyboardType="number-pad"
              containerStyle={styles.field}
              accessibilityLabel="Minimum players"
            />
            <Input
              label="Players On Field"
              value={String(rulesConfig.playersOnField)}
              onChangeText={(value) =>
                updateRulesConfig({
                  playersOnField: Math.max(1, Number.parseInt(value || "1", 10) || 1),
                })
              }
              keyboardType="number-pad"
              containerStyle={styles.field}
              accessibilityLabel="Players on field"
            />
          </View>
          <View style={styles.row}>
            <Input
              label="Max Consecutive Bench"
              value={String(rulesConfig.maxConsecutiveBench)}
              onChangeText={(value) =>
                updateRulesConfig({
                  maxConsecutiveBench: Math.max(0, Number.parseInt(value || "0", 10) || 0),
                })
              }
              keyboardType="number-pad"
              containerStyle={styles.field}
              accessibilityLabel="Max consecutive bench"
            />
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.cardInner}>
          <AppPressable
            style={styles.sectionRow}
            onPress={toggleAdvancedRules}
            pressScale={1}
            accessibilityRole="button"
            accessibilityLabel="Advanced Rules"
            accessibilityState={{ expanded: showAdvancedRules }}
          >
            <View style={styles.sectionTitleWrap}>
              <AppText variant="bodyLg" family="heading">
                Advanced Rules
              </AppText>
              <AppText variant="caption" color="secondary">
                Lineup slots and custom instructions
              </AppText>
            </View>
            <Feather
              name={showAdvancedRules ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.text.primary}
            />
          </AppPressable>

          {showAdvancedRules ? (
            <View style={styles.advancedContent}>
              <View style={styles.sectionRow}>
                <AppText variant="caption" family="heading" color="secondary">
                  Lineup Slots
                </AppText>
                <Button
                  label="Auto-size"
                  variant="secondary"
                  size="sm"
                  onPress={normalizeSlotsToFieldCount}
                  accessibilityLabel="Auto-size lineup slots to field count"
                />
              </View>
              <View style={styles.slotInputRow}>
                <Input
                  label="Add slot"
                  value={slotDraft}
                  onChangeText={setSlotDraft}
                  placeholder="e.g. GK, QB, Wing"
                  containerStyle={styles.slotInput}
                  accessibilityLabel="Add slot"
                />
                <Button
                  label="Add"
                  variant="secondary"
                  onPress={addSlot}
                  accessibilityLabel="Add lineup slot"
                />
              </View>
              <View style={styles.slotWrap}>
                {rulesConfig.lineupSlots.length ? (
                  rulesConfig.lineupSlots.map((slot) => (
                    <AppPressable
                      key={slot}
                      style={styles.slotChip}
                      onPress={() => removeSlot(slot)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${slot} slot`}
                    >
                      <AppText variant="caption" family="heading">
                        {slot}
                      </AppText>
                      <Feather name="x" size={14} color={theme.text.secondary} />
                    </AppPressable>
                  ))
                ) : (
                  <AppText variant="caption" color="secondary">
                    No lineup slots set yet.
                  </AppText>
                )}
              </View>

              <Input
                label="Custom Instructions"
                value={rulesConfig.customInstructions}
                onChangeText={(value) => updateRulesConfig({ customInstructions: value })}
                placeholder="League-specific constraints or coaching preferences."
                multiline
                textAlignVertical="top"
                style={styles.textarea}
                accessibilityLabel="Custom instructions"
              />
            </View>
          ) : (
            <AppText variant="caption" color="secondary">
              Hidden to keep this page compact.
            </AppText>
          )}
        </View>
      </Card>

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
      {status ? (
        <AppText variant="caption" color="success">
          {status}
        </AppText>
      ) : null}

      <View style={styles.footerButtons}>
        <View style={styles.footerButton}>
          <Button
            label="Reset defaults"
            variant="secondary"
            onPress={resetToDefault}
            fullWidth
            accessibilityLabel="Reset rules to defaults"
          />
        </View>
        <View style={styles.footerButton}>
          <Button
            label="Save rules"
            onPress={handleSaveRules}
            loading={isSavingRules}
            fullWidth
            accessibilityLabel="Save rules"
          />
        </View>
      </View>
      </LoadTransition>
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
  metricsRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  cardInner: {
    gap: space.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  row: {
    flexDirection: "row",
    gap: space.sm,
  },
  field: {
    flex: 1,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  sectionTitleWrap: {
    gap: space.xxs,
  },
  slotInputRow: {
    flexDirection: "row",
    gap: space.xs,
    alignItems: "flex-end",
  },
  slotInput: {
    flex: 1,
  },
  slotWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  slotChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.elevated,
    paddingHorizontal: space.sm,
    minHeight: 32,
    justifyContent: "center",
  },
  textarea: {
    minHeight: 100,
  },
  advancedContent: {
    gap: space.sm,
  },
  footerButtons: {
    flexDirection: "row",
    gap: space.sm,
  },
  footerButton: {
    flex: 1,
  },
});

export default RulesScreen;
