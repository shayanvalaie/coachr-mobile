import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import Sortable from "react-native-sortables";
import { Feather } from "../icons";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { Player, Position } from "../types/lineup";
import { parsePositions } from "../utils/lineupGenerator";
import { AppPressable, AppText, Button, Card, Chip, Input } from "./ui";

type Props = {
  player: Player;
  isExpanded: boolean;
  isActive: boolean;
  isDragging?: boolean;
  isSaving: boolean;
  lineupSlots: string[];
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

  // Sortable's item store re-renders cards one commit after roster state
  // changes, but RN's controlled Switch force-resets the native thumb
  // whenever its `value` prop disagrees with the native value — so a stale
  // `player` for even one commit makes the switch snap back on every press.
  // Mirror the value locally so the Switch updates in the same commit as
  // the gesture, then re-sync when the roster value lands.
  const [lockValue, setLockValue] = useState(player.lockInPosition);
  useEffect(() => {
    setLockValue(player.lockInPosition);
  }, [player.lockInPosition]);

  const handleLockChange = useCallback(
    (checked: boolean) => {
      setLockValue(checked);
      onUpdate({ lockInPosition: checked });
    },
    [onUpdate],
  );
  const handleToggleActive = useCallback(
    () => onToggleActive(!isActive),
    [isActive, onToggleActive],
  );

  const displayName = player.name?.trim() || "Unnamed Player";
  const initials = (player.name || "NP")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={!isActive ? styles.inactive : undefined}>
      <Card
        variant="raised"
        padding="sm"
        style={[styles.card, isDragging && styles.cardDragging]}
      >
        <View style={styles.rowHeader}>
          {/* Drag handle: press and hold the avatar/name area to reorder.
              Scoped to the identity block so the expanded card's inputs,
              switch and buttons never conflict with the drag gesture. */}
          <Sortable.Handle style={styles.identityWrap}>
            <View style={styles.avatar}>
              <AppText variant="body" family="heading" color="accent">
                {initials}
              </AppText>
            </View>
            <View style={styles.nameWrap}>
              <View style={styles.nameRow}>
                {player.gender === "female" ? (
                  <View
                    style={styles.genderBadge}
                    accessibilityLabel="Female player"
                  >
                    <AppText
                      variant="caption"
                      family="heading"
                      color="accent"
                      style={styles.genderBadgeText}
                    >
                      F
                    </AppText>
                  </View>
                ) : null}
                <AppText
                  variant="bodyLg"
                  family="heading"
                  numberOfLines={1}
                  style={styles.nameText}
                >
                  {displayName}
                </AppText>
              </View>
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {normalizedDesiredPositions.length > 0
                  ? normalizedDesiredPositions.join(" • ")
                  : "No preferred positions"}
              </AppText>
            </View>
          </Sortable.Handle>

          <View style={styles.rowHeaderActions}>
            <Chip
              label={isActive ? "Active" : "Bench"}
              selected={isActive}
              onPress={handleToggleActive}
            />
            <AppPressable
              style={styles.iconButton}
              onPress={onToggleExpand}
              accessibilityRole="button"
              accessibilityLabel={
                isExpanded
                  ? `Collapse ${displayName}`
                  : `Expand ${displayName}`
              }
              accessibilityState={{ expanded: isExpanded }}
              hitSlop={4}
            >
              <Feather
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={theme.text.primary}
              />
            </AppPressable>
          </View>
        </View>

        {isExpanded && (
          <>
            <Input
              label="Name"
              value={player.name}
              onChangeText={handleNameChange}
              placeholder="Player name"
            />

            <View style={styles.field}>
              <AppText variant="caption" family="heading" color="secondary">
                Desired positions
              </AppText>
              <View style={styles.inlineChips}>
                {normalizedLineupSlots.map((slot) => (
                  <Chip
                    key={slot}
                    label={slot}
                    selected={normalizedDesiredPositions.includes(
                      slot as Position,
                    )}
                    onPress={() => handlePositionToggle(slot)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="caption" family="heading" color="secondary">
                Gender
              </AppText>
              <View style={styles.inlineChips}>
                {(["male", "female"] as const).map((g) => (
                  <Chip
                    key={g}
                    label={g[0].toUpperCase() + g.slice(1)}
                    selected={player.gender === g}
                    onPress={() => handleGenderSelect(g)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.switchRow}>
              <AppText variant="caption" family="heading" color="secondary">
                Lock position
              </AppText>
              <Switch
                value={lockValue}
                disabled={normalizedDesiredPositions.length !== 1}
                onValueChange={handleLockChange}
                accessibilityRole="switch"
                accessibilityLabel="Lock position"
                accessibilityState={{
                  checked: lockValue,
                  disabled: normalizedDesiredPositions.length !== 1,
                }}
                trackColor={{
                  true: theme.accent.base,
                  false: theme.border.strong,
                }}
                thumbColor={
                  lockValue ? theme.text.onAccent : theme.text.primary
                }
              />
            </View>

            <View style={styles.bottomActions}>
              <Button
                label="Save player"
                variant="secondary"
                size="sm"
                icon="check"
                onPress={onSave}
                loading={isSaving}
                accessibilityLabel={`Save ${displayName}`}
              />
              <Button
                label="Remove"
                variant="danger"
                size="sm"
                icon="trash-2"
                onPress={onRemove}
                accessibilityLabel={`Remove ${displayName}`}
              />
            </View>
          </>
        )}
      </Card>
    </View>
  );
};

export default memo(PlayerCard);

const styles = StyleSheet.create({
  inactive: {
    opacity: 0.72,
  },
  card: {
    gap: space.sm,
  },
  cardDragging: {
    // Thicker accent border + brighter surface so the picked-up card
    // clearly reads as raised. Padding drops by 1 to offset the extra
    // border width and keep the content from shifting.
    borderWidth: 2,
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.bg.elevated,
    padding: space.sm - 1,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.sm,
    alignItems: "center",
  },
  identityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  nameWrap: {
    flex: 1,
    gap: space.xxs / 2,
    minWidth: 0,
  },
  rowHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  iconButton: {
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.sm,
    padding: space.xs,
    backgroundColor: theme.bg.elevated,
  },
  nameText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  genderBadge: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
  },
  genderBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  field: {
    gap: space.xs,
  },
  inlineChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.md,
    backgroundColor: theme.bg.elevated,
  },
  bottomActions: {
    flexDirection: "row",
    gap: space.xs,
    flexWrap: "wrap",
  },
});
