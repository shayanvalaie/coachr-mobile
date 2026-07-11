import React, { memo, useCallback, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Entypo } from "../icons";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { Player, Position } from "../types/lineup";
import { parsePositions } from "../utils/lineupGenerator";

type Props = {
  player: Player;
  isExpanded: boolean;
  isActive: boolean;
  isDragging?: boolean;
  isSaving: boolean;
  lineupSlots: string[];
  onDragLongPress?: () => void;
  onToggleExpand: () => void;
  onToggleActive: (active: boolean) => void;
  onUpdate: (patch: Partial<Player>) => void;
  onRemove: () => void;
  onSave: () => void;
};

const PlayerCard = ({
  player,
  isExpanded,
  isActive,
  isDragging,
  isSaving,
  lineupSlots,
  onDragLongPress,
  onToggleExpand,
  onToggleActive,
  onUpdate,
  onRemove,
  onSave,
}: Props) => {
  const normalizedDesiredPositions = useMemo(
    () => parsePositions(player.desiredPositions),
    [player.desiredPositions],
  );
  const normalizedLineupSlots = useMemo(
    () =>
      lineupSlots.map((slot) => String(slot).trim().toUpperCase()).filter(Boolean),
    [lineupSlots],
  );

  const handleNameChange = useCallback(
    (text: string) => onUpdate({ name: text }),
    [onUpdate],
  );

  const handlePositionToggle = useCallback(
    (slot: string) => {
      const normalizedSlot = slot.trim().toUpperCase();
      const current = parsePositions(player.desiredPositions);
      const next = current.includes(normalizedSlot as Position)
        ? current.filter((p) => p !== normalizedSlot)
        : [...current, normalizedSlot as Position];
      onUpdate({ desiredPositions: next as Position[] });
    },
    [player.desiredPositions, onUpdate],
  );

  const handleGenderSelect = useCallback(
    (gender: Player["gender"]) => onUpdate({ gender }),
    [onUpdate],
  );

  const handleLockChange = useCallback(
    (checked: boolean) => onUpdate({ lockInPosition: checked }),
    [onUpdate],
  );
  const handleToggleActive = useCallback(
    () => onToggleActive(!isActive),
    [isActive, onToggleActive],
  );

  const initials = (player.name || "NP")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Pressable
      style={[
        styles.playerRow,
        !isActive && styles.playerInactive,
        isDragging && styles.playerDragging,
      ]}
      onLongPress={onDragLongPress}
      delayLongPress={500}
    >
      <View style={styles.rowHeader}>
        <View style={styles.identityWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.nameWrap}>
            <View style={styles.nameRow}>
              {player.gender === "female" ? (
                <View style={styles.genderBadge}>
                  <Text style={styles.genderBadgeText}>F</Text>
                </View>
              ) : null}
              <Text style={styles.nameText} numberOfLines={1}>
                {player.name?.trim() || "Unnamed Player"}
              </Text>
            </View>
            <Text style={styles.positionsPreview} numberOfLines={1}>
              {normalizedDesiredPositions.length > 0
                ? normalizedDesiredPositions.join(" • ")
                : "No preferred positions"}
            </Text>
          </View>
        </View>

        <View style={styles.rowHeaderActions}>
          <Pressable
            style={[styles.statePill, isActive ? styles.statePillActive : null]}
            onPress={handleToggleActive}
          >
            <Text
              style={[styles.statePillText, isActive ? styles.statePillTextActive : null]}
            >
              {isActive ? "Active" : "Bench"}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
            onPress={onToggleExpand}
          >
            <Entypo
              name={isExpanded ? "chevron-small-up" : "chevron-small-down"}
              size={24}
              color={palette.text}
            />
          </Pressable>
        </View>
      </View>

      {isExpanded && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={player.name}
              onChangeText={handleNameChange}
              placeholder="Player name"
              placeholderTextColor={palette.subtext}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Desired positions</Text>
            <View style={styles.inlineChips}>
              {normalizedLineupSlots.map((slot) => {
                const active = normalizedDesiredPositions.includes(slot as Position);
                return (
                  <Pressable
                    key={slot}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => handlePositionToggle(slot)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {slot}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.inlineChips}>
              {(["male", "female"] as const).map((g) => (
                <Pressable
                  key={g}
                  style={[styles.chip, player.gender === g && styles.chipActive]}
                  onPress={() => handleGenderSelect(g)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      player.gender === g && styles.chipTextActive,
                    ]}
                  >
                    {g[0].toUpperCase() + g.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Lock position</Text>
              <Switch
                value={player.lockInPosition}
                disabled={normalizedDesiredPositions.length !== 1}
                onValueChange={handleLockChange}
                trackColor={{
                  true: palette.success,
                  false: "#6a716d",
                }}
                thumbColor={player.lockInPosition ? "#123124" : "#e5dcc8"}
              />
            </View>
          </View>

          <View style={styles.bottomActions}>
            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                pressed && { opacity: 0.9 },
                isSaving && { opacity: 0.7 },
              ]}
              onPress={onSave}
              disabled={isSaving}
            >
              <Text style={styles.saveText}>{isSaving ? "Saving" : "Save player"}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.removeButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={onRemove}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        </>
      )}
    </Pressable>
  );
};

export default memo(PlayerCard);

const styles = StyleSheet.create({
  playerRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  playerInactive: {
    opacity: 0.72,
  },
  playerDragging: {
    // Thicker accent border + brighter surface so the picked-up card
    // clearly reads as raised. Padding drops by 1 to offset the extra
    // border width and keep the content from shifting.
    borderWidth: 2,
    borderColor: "rgba(242,166,59,0.65)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 11,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  identityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(242,166,59,0.18)",
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  nameWrap: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  rowHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: palette.cardAlt,
  },
  saveButton: {
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.5)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(242,166,59,0.14)",
  },
  saveText: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  nameText: {
    color: palette.text,
    fontSize: 15,
    fontFamily: typeface.heading,
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  genderBadge: {
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.58)",
    backgroundColor: "rgba(242,166,59,0.2)",
  },
  genderBadgeText: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 10,
    includeFontPadding: false,
    textAlignVertical: "center",
    lineHeight: 12,
  },
  positionsPreview: {
    color: palette.subtext,
    fontSize: 11,
    fontFamily: typeface.body,
  },
  field: {
    gap: 6,
  },
  label: {
    color: palette.subtext,
    fontSize: 12,
    fontFamily: typeface.heading,
  },
  input: {
    backgroundColor: palette.cardAlt,
    color: palette.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    fontFamily: typeface.body,
  },
  inlineChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: palette.cardAlt,
  },
  chipActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  chipText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  chipTextActive: {
    color: palette.accentText,
  },
  toggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  statePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statePillActive: {
    borderColor: "rgba(126,207,157,0.55)",
    backgroundColor: "rgba(126,207,157,0.2)",
  },
  statePillText: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
  statePillTextActive: {
    color: palette.success,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.cardAlt,
  },
  bottomActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  removeButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,107,91,0.45)",
    backgroundColor: "rgba(239,107,91,0.12)",
  },
  removeText: {
    color: palette.danger,
    fontFamily: typeface.heading,
  },
});
