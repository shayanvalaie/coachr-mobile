import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { BackendSession } from "../lib/backend/types";
import { backendClient } from "../lib/backend/client";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import {
  defaultTeamRulesConfig,
  parseTeamRulesConfig,
  sportPresets,
  stringifyTeamRulesConfig,
  TeamRulesConfig,
} from "../types/rules";

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenProfile: () => void;
};

const RulesScreen = ({ session, onBack, onOpenProfile }: Props) => {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rulesConfig, setRulesConfig] = useState<TeamRulesConfig>(
    defaultTeamRulesConfig,
  );
  const [slotDraft, setSlotDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);

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
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadRules().catch(() => {
      setError("Unable to load rules.");
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
    } catch (_err) {
      setError("Failed to save rules.");
    } finally {
      setIsSavingRules(false);
    }
  }, [ensureTeam, rulesConfig]);

  const benchPerInning = useMemo(
    () => Math.max(rulesConfig.minimumPlayers - rulesConfig.playersOnField, 0),
    [rulesConfig.minimumPlayers, rulesConfig.playersOnField],
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          onPress={onBack}
        >
          <Feather name="arrow-left" size={18} color={palette.text} />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow}>Rules Workspace</Text>
          <Text style={styles.headerTitle}>Lineup Rules</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          onPress={onOpenProfile}
        >
          <Feather name="user" size={18} color={palette.text} />
        </Pressable>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Rules</Text>
        <Text style={styles.heroSubtext}>
          Set defaults once. Use Advanced only when needed.
        </Text>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Sport</Text>
            <Text style={styles.metricValue}>{rulesConfig.sport}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Innings</Text>
            <Text style={styles.metricValue}>
              {rulesConfig.segmentCount} {rulesConfig.segmentLabel}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Bench / Inning</Text>
            <Text style={styles.metricValue}>{benchPerInning}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sport Presets</Text>
        <View style={styles.chipRow}>
          {Object.keys(sportPresets).map((sportKey) => {
            const selected = rulesConfig.sport.toLowerCase() === sportKey;
            return (
              <Pressable
                key={sportKey}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => applySportPreset(sportKey)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {sportKey}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Core Rules</Text>
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.label}>Inning Label</Text>
            <TextInput
              value={rulesConfig.segmentLabel}
              onChangeText={(value) =>
                updateRulesConfig({ segmentLabel: value.trim() || "inning" })
              }
              placeholder="inning"
              placeholderTextColor={palette.subtext}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Inning Count</Text>
            <TextInput
              value={String(rulesConfig.segmentCount)}
              onChangeText={(value) =>
                updateRulesConfig({
                  segmentCount: Math.max(1, Number.parseInt(value || "1", 10) || 1),
                })
              }
              keyboardType="number-pad"
              placeholderTextColor={palette.subtext}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Minimum Players</Text>
            <TextInput
              value={String(rulesConfig.minimumPlayers)}
              onChangeText={(value) =>
                updateRulesConfig({
                  minimumPlayers: Math.max(1, Number.parseInt(value || "1", 10) || 1),
                })
              }
              keyboardType="number-pad"
              placeholderTextColor={palette.subtext}
              style={styles.input}
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.label}>Players On Field</Text>
            <TextInput
              value={String(rulesConfig.playersOnField)}
              onChangeText={(value) =>
                updateRulesConfig({
                  playersOnField: Math.max(1, Number.parseInt(value || "1", 10) || 1),
                })
              }
              keyboardType="number-pad"
              placeholderTextColor={palette.subtext}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Max Consecutive Bench</Text>
            <TextInput
              value={String(rulesConfig.maxConsecutiveBench)}
              onChangeText={(value) =>
                updateRulesConfig({
                  maxConsecutiveBench: Math.max(0, Number.parseInt(value || "0", 10) || 0),
                })
              }
              keyboardType="number-pad"
              placeholderTextColor={palette.subtext}
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.sectionRow, pressed && { opacity: 0.85 }]}
          onPress={toggleAdvancedRules}
        >
          <View>
            <Text style={styles.sectionTitle}>Advanced Rules</Text>
            <Text style={styles.sectionSubtext}>Lineup slots and custom instructions</Text>
          </View>
          <Feather
            name={showAdvancedRules ? "chevron-up" : "chevron-down"}
            size={18}
            color={palette.text}
          />
        </Pressable>

        {showAdvancedRules ? (
          <View style={styles.advancedContent}>
            <View style={styles.sectionRow}>
              <Text style={styles.label}>Lineup Slots</Text>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.8 }]}
                onPress={normalizeSlotsToFieldCount}
              >
                <Text style={styles.secondaryButtonText}>Auto-size</Text>
              </Pressable>
            </View>
            <View style={styles.slotInputRow}>
              <TextInput
                value={slotDraft}
                onChangeText={setSlotDraft}
                placeholder="Add slot (e.g. GK, QB, Wing)"
                placeholderTextColor={palette.subtext}
                style={[styles.input, styles.slotInput]}
              />
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.8 }]}
                onPress={addSlot}
              >
                <Text style={styles.secondaryButtonText}>Add</Text>
              </Pressable>
            </View>
            <View style={styles.slotWrap}>
              {rulesConfig.lineupSlots.length ? (
                rulesConfig.lineupSlots.map((slot) => (
                  <Pressable
                    key={slot}
                    style={({ pressed }) => [styles.slotChip, pressed && { opacity: 0.8 }]}
                    onPress={() => removeSlot(slot)}
                  >
                    <Text style={styles.slotChipText}>{slot}</Text>
                    <Feather name="x" size={14} color={palette.subtext} />
                  </Pressable>
                ))
              ) : (
                <Text style={styles.emptyText}>No lineup slots set yet.</Text>
              )}
            </View>

            <Text style={styles.label}>Custom Instructions</Text>
            <TextInput
              value={rulesConfig.customInstructions}
              onChangeText={(value) => updateRulesConfig({ customInstructions: value })}
              placeholder="League-specific constraints or coaching preferences."
              placeholderTextColor={palette.subtext}
              style={styles.textarea}
              multiline
              textAlignVertical="top"
            />
          </View>
        ) : (
          <Text style={styles.collapsedHint}>Hidden to keep this page compact.</Text>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.footerButtons}>
        <Pressable
          style={({ pressed }) => [styles.ghostButton, pressed && { opacity: 0.8 }]}
          onPress={resetToDefault}
        >
          <Text style={styles.ghostButtonText}>Reset defaults</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { opacity: 0.85 },
            isSavingRules && { opacity: 0.7 },
          ]}
          onPress={handleSaveRules}
          disabled={isSavingRules}
        >
          <Text style={styles.primaryButtonText}>
            {isSavingRules ? "Saving..." : "Save rules"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    padding: 16,
    paddingBottom: 28,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  headerTextWrap: {
    alignItems: "center",
    gap: 2,
  },
  headerEyebrow: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 24,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cardAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroCard: {
    backgroundColor: palette.cardAlt,
    borderRadius: 20,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 21,
  },
  heroSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  metric: {
    flex: 1,
    minWidth: 98,
    backgroundColor: palette.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricLabel: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  metricValue: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
    marginTop: 2,
    textTransform: "capitalize",
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 15,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
  },
  chipActive: {
    borderColor: palette.accent,
    backgroundColor: "rgba(242, 166, 59, 0.16)",
  },
  chipText: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 12,
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: palette.text,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  input: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    color: palette.text,
    fontFamily: typeface.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  slotInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  slotInput: {
    flex: 1,
  },
  slotWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  slotChipText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  emptyText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  textarea: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    color: palette.text,
    fontFamily: typeface.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
    lineHeight: 18,
  },
  advancedContent: {
    gap: 8,
  },
  collapsedHint: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  error: {
    color: palette.danger,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  status: {
    color: palette.success,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  footerButtons: {
    flexDirection: "row",
    gap: 10,
  },
  ghostButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  ghostButtonText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.75)",
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
});

export default RulesScreen;
