import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import Sortable from "react-native-sortables";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { Player, Position } from "../types/lineup";
import { parsePositions } from "../utils/lineupGenerator";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  Chip,
  Input,
  SectionLabel,
} from "./ui";

type Props = {
  player: Player;
  isExpanded: boolean;
  isActive: boolean;
  isDragging?: boolean;
  isSaving: boolean;
  lineupSlots: string[];
  // Handlers take the player id so the list can pass the same function to
  // every card and memo() keeps untouched cards from re-rendering.
  onToggleExpand: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onRemove: (id: string) => void;
  onSave: (id: string) => void;
  // Quiet persist (no toast, card stays open) when the name field blurs.
  onAutoSave: (id: string) => void;
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
  onAutoSave,
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

  const playerId = player.id;

  const handleToggleExpand = useCallback(
    () => onToggleExpand(playerId),
    [onToggleExpand, playerId],
  );

  const handleNameChange = useCallback(
    (text: string) => onUpdate(playerId, { name: text }),
    [onUpdate, playerId],
  );

  const handlePositionToggle = useCallback(
    (slot: string) => {
      const normalizedSlot = slot.trim().toUpperCase();
      const current = parsePositions(player.desiredPositions);
      const next = current.includes(normalizedSlot as Position)
        ? current.filter((p) => p !== normalizedSlot)
        : [...current, normalizedSlot as Position];
      onUpdate(playerId, { desiredPositions: next as Position[] });
    },
    [player.desiredPositions, onUpdate, playerId],
  );

  const handleGenderSelect = useCallback(
    (gender: Player["gender"]) => onUpdate(playerId, { gender }),
    [onUpdate, playerId],
  );

  const handleRemove = useCallback(() => onRemove(playerId), [onRemove, playerId]);
  const handleSave = useCallback(() => onSave(playerId), [onSave, playerId]);
  const handleAutoSave = useCallback(
    () => onAutoSave(playerId),
    [onAutoSave, playerId],
  );

  // Sortable's item store re-renders cards one commit after roster state
  // changes, but RN's controlled Switch force-resets the native thumb
  // whenever its `value` prop disagrees with the native value - so a stale
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
      onUpdate(playerId, { lockInPosition: checked });
    },
    [onUpdate, playerId],
  );
  const handleToggleActive = useCallback(
    () => onToggleActive(playerId, !isActive),
    [isActive, onToggleActive, playerId],
  );

  const displayName = player.name?.trim() || "Unnamed Player";
  const initials = (player.name || "NP")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const isFemale = player.gender === "female";
  const canLock = normalizedDesiredPositions.length === 1;

  return (
    <View style={!isActive ? styles.inactive : undefined}>
      <Card padding="none" style={isDragging ? styles.cardDragging : undefined}>
        <View style={styles.rowHeader}>
          {/* Drag handle: press and hold the avatar/name area to reorder; a
              plain tap expands. Scoped to the identity block so the expanded
              card's inputs, switch and buttons never conflict with the drag. */}
          <Sortable.Handle style={styles.identityWrap}>
            <AppPressable
              onPress={handleToggleExpand}
              pressScale={1}
              style={styles.identityPress}
              accessibilityRole="button"
              accessibilityLabel={
                isExpanded ? `Collapse ${displayName}` : `Edit ${displayName}`
              }
              accessibilityHint="Press and hold to reorder"
              accessibilityState={{ expanded: isExpanded }}
            >
              <View style={styles.avatar}>
                <AppText family="heading" color="accent" style={styles.initials}>
                  {initials}
                </AppText>
              </View>
              <View style={styles.nameWrap}>
                <View style={styles.nameRow}>
                  <AppText
                    variant="bodyLg"
                    family="heading"
                    numberOfLines={1}
                    style={styles.nameText}
                  >
                    {displayName}
                  </AppText>
                  <View
                    style={[styles.genderTag, isFemale && styles.genderTagFemale]}
                    accessibilityLabel={isFemale ? "Woman" : "Man"}
                  >
                    <AppText
                      family="heading"
                      style={[styles.genderTagText, isFemale && styles.genderTagTextFemale]}
                    >
                      {isFemale ? "F" : "M"}
                    </AppText>
                  </View>
                </View>
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {normalizedDesiredPositions.length > 0
                    ? normalizedDesiredPositions.join(" · ")
                    : "No preferred positions"}
                </AppText>
              </View>
            </AppPressable>
          </Sortable.Handle>

          <Chip
            label={isActive ? "Active" : "Bench"}
            selected={isActive}
            onPress={handleToggleActive}
          />
        </View>

        {isExpanded && (
          <View style={styles.expanded}>
            <Input
              label="Name"
              value={player.name}
              onChangeText={handleNameChange}
              onBlur={handleAutoSave}
              placeholder="Player name"
            />

            <View style={styles.field}>
              <SectionLabel>Preferred positions</SectionLabel>
              <View style={styles.inlineChips}>
                {normalizedLineupSlots.map((slot) => (
                  <Chip
                    key={slot}
                    label={slot}
                    shape="rounded"
                    selected={normalizedDesiredPositions.includes(slot as Position)}
                    onPress={() => handlePositionToggle(slot)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <SectionLabel>Gender</SectionLabel>
              <View style={styles.inlineChips}>
                <Chip
                  label="Man"
                  selected={player.gender === "male"}
                  onPress={() => handleGenderSelect("male")}
                />
                <Chip
                  label="Woman"
                  selected={player.gender === "female"}
                  onPress={() => handleGenderSelect("female")}
                />
              </View>
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <AppText variant="body" family="heading">
                  Lock to one position
                </AppText>
                {!canLock ? (
                  <AppText variant="caption" color="muted">
                    Pick exactly one preferred position to lock it.
                  </AppText>
                ) : null}
              </View>
              <Switch
                value={lockValue}
                disabled={!canLock}
                onValueChange={handleLockChange}
                accessibilityRole="switch"
                accessibilityLabel="Lock to one position"
                accessibilityState={{ checked: lockValue, disabled: !canLock }}
                trackColor={{
                  true: theme.accent.base,
                  false: theme.border.strong,
                }}
                thumbColor={lockValue ? theme.text.onAccent : theme.text.primary}
              />
            </View>

            <View style={styles.bottomActions}>
              <Button
                label="Save player"
                variant="secondary"
                size="sm"
                icon="check"
                onPress={handleSave}
                loading={isSaving}
                accessibilityLabel={`Save ${displayName}`}
              />
              <Button
                label="Remove"
                variant="danger"
                size="sm"
                icon="trash-2"
                onPress={handleRemove}
                accessibilityLabel={`Remove ${displayName}`}
              />
            </View>
          </View>
        )}
      </Card>
    </View>
  );
};

export default memo(PlayerCard);

const styles = StyleSheet.create({
  inactive: {
    opacity: 0.6,
  },
  cardDragging: {
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.bg.elevated,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm + 2,
  },
  identityWrap: {
    flex: 1,
    minWidth: 0,
  },
  identityPress: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 13,
    lineHeight: 16,
  },
  nameWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  nameText: {
    flexShrink: 1,
  },
  genderTag: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border.base,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  genderTagFemale: {
    borderColor: theme.rose.border,
  },
  genderTagText: {
    fontSize: 10,
    lineHeight: 12,
    color: theme.text.secondary,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  genderTagTextFemale: {
    color: theme.rose.text,
  },
  expanded: {
    paddingHorizontal: space.sm + 2,
    paddingBottom: space.sm + 2,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
    paddingTop: space.sm,
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
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: theme.bg.elevated,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  bottomActions: {
    flexDirection: "row",
    gap: space.xs,
    flexWrap: "wrap",
  },
});
