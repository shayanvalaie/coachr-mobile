import React, { memo, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import { Feather } from "../icons";
import { theme, withAlpha } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { InningAssignment, Player } from "../types/lineup";
import LineUp from "./lineup/LineupGrid";
import LineupGridSkeleton from "./lineup/LineupGridSkeleton";
import { AppText } from "./ui";

type Props = {
  activePlayersCount: number;
  lineup: InningAssignment[] | null;
  canEditLineup: boolean;
  isInlineEditing: boolean;
  expandedInnings: Set<number>;
  collapsed: boolean;
  isGenerating: boolean;
  status: string;
  error: string | null;
  onToggleCollapse: () => void;
  onEditSelection: () => void;
  onEditLineup: () => void;
  onGenerate: () => void;
  onSaveLineup: () => void;
  onToggleInning: (inning: number) => void;
  onSetLineupCell: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  playerGenderByName?: Record<string, Player["gender"]>;
  lineupScrollableRef?: AnimatedRef<Animated.ScrollView>;
  // Wraps the finished lineup so the screen can measure it and scroll it into
  // view (e.g. from the "jump to lineup" toast after a generation).
  lineupAnchorRef?: React.RefObject<View | null>;
};

const GameSetup = ({
  activePlayersCount,
  lineup,
  canEditLineup,
  isInlineEditing,
  expandedInnings,
  collapsed,
  isGenerating,
  status,
  error,
  onToggleCollapse,
  onEditSelection,
  onEditLineup,
  onGenerate,
  onSaveLineup,
  onToggleInning,
  onSetLineupCell,
  playerGenderByName,
  lineupScrollableRef,
  lineupAnchorRef,
}: Props) => {
  // Reveal state machine for the skeleton -> grid hand-off. The grid mounts
  // hidden under an opaque skeleton and settles; the skeleton then fades out to
  // reveal a fully-formed grid, instead of the sortable rows popping in one by
  // one on a fresh mount.
  const [revealPhase, setRevealPhase] = useState<
    "generating" | "revealing" | "idle"
  >(isGenerating ? "generating" : "idle");
  const wasGenerating = useRef(isGenerating);

  useEffect(() => {
    if (isGenerating) {
      wasGenerating.current = true;
      setRevealPhase("generating");
      return;
    }
    if (wasGenerating.current) {
      wasGenerating.current = false;
      // Hold the skeleton over the freshly mounted grid for a beat so its rows
      // settle, then drop it — its FadeOut reveals the grid all at once.
      setRevealPhase("revealing");
      const timer = setTimeout(() => setRevealPhase("idle"), 280);
      return () => clearTimeout(timer);
    }
  }, [isGenerating]);

  return (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.headerInfo}>
        <AppText
          variant="caption"
          family="heading"
          color="accent"
          style={styles.eyebrow}
        >
          Generate
        </AppText>
        <AppText variant="title" family="display" style={styles.cardTitle}>
          Lineup Engine
        </AppText>
        <AppText variant="caption" color="secondary">
          {activePlayersCount} active players
        </AppText>
      </View>
      <View style={styles.cardHeaderActions}>
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onToggleCollapse}
          accessibilityRole="button"
          accessibilityLabel={
            collapsed ? "Expand lineup engine" : "Collapse lineup engine"
          }
          accessibilityState={{ expanded: !collapsed }}
        >
          <Feather
            name={collapsed ? "chevron-down" : "chevron-up"}
            size={24}
            color={theme.text.primary}
          />
        </Pressable>
      </View>
    </View>
    {collapsed ? null : (
      <>
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              pressed && { opacity: 0.9 },
            ]}
            onPress={onEditSelection}
            accessibilityRole="button"
            accessibilityLabel="Edit player selection"
          >
            <Feather
              name="users"
              size={16}
              color={theme.text.primary}
              style={styles.quickActionIcon}
            />
            <AppText variant="body" family="heading">
              Edit selection
            </AppText>
          </Pressable>
        </View>
        <View style={styles.generateWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              styles.generateButton,
              pressed && { transform: [{ translateY: 1 }] },
              isGenerating && { opacity: 0.7 },
            ]}
            onPress={onGenerate}
            disabled={isGenerating}
            accessibilityRole="button"
            accessibilityLabel="Generate lineup"
            accessibilityState={{ disabled: isGenerating, busy: isGenerating }}
          >
            <AppText variant="bodyLg" family="heading" color="onAccent">
              {isGenerating ? "Working..." : "Generate lineup"}
            </AppText>
          </Pressable>
        </View>
        {lineup ? (
          <View style={styles.saveRow}>
            <Pressable
              style={({ pressed }) => [
                styles.editLineupButton,
                isInlineEditing && styles.editLineupButtonActive,
                styles.saveRowButton,
                pressed && { opacity: 0.9 },
                !canEditLineup && styles.editLineupButtonDisabled,
              ]}
              onPress={onEditLineup}
              disabled={!canEditLineup}
              accessibilityRole="button"
              accessibilityLabel={
                isInlineEditing ? "Done editing lineup" : "Edit lineup"
              }
              accessibilityState={{
                disabled: !canEditLineup,
                selected: isInlineEditing,
              }}
            >
              <AppText variant="caption" family="heading" color="success">
                {isInlineEditing ? "Done editing" : "Edit lineup"}
              </AppText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.saveInlineButton,
                styles.saveRowButton,
                pressed && { opacity: 0.9 },
              ]}
              onPress={onSaveLineup}
              accessibilityRole="button"
              accessibilityLabel="Save lineup"
            >
              <AppText variant="caption" family="heading">
                Save lineup
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <AppText variant="body" color="danger">
            {error}
          </AppText>
        ) : null}

        {/* Skeleton -> grid cross-fade. During generation the skeleton holds
            the slot. On completion the grid mounts underneath and the skeleton
            overlays it opaquely for a beat, then fades out — so the finished
            lineup appears all at once rather than row-by-row. */}
        <View ref={lineupAnchorRef} collapsable={false} style={styles.gridSlot}>
          {revealPhase !== "generating" ? (
            <LineUp
              lineup={lineup}
              expandedInnings={expandedInnings}
              onToggleInning={onToggleInning}
              editable={isInlineEditing}
              onSetPlayerPosition={onSetLineupCell}
              playerGenderByName={playerGenderByName}
              scrollableRef={lineupScrollableRef}
            />
          ) : null}
          {revealPhase !== "idle" ? (
            <Animated.View
              pointerEvents="none"
              exiting={FadeOut.duration(300)}
              style={
                revealPhase === "revealing" ? styles.skeletonOverlay : undefined
              }
            >
              <LineupGridSkeleton rows={activePlayersCount} />
            </Animated.View>
          ) : null}
        </View>
      </>
    )}
  </View>
  );
};

export default memo(GameSetup);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.bg.raised,
    borderRadius: radius.xl,
    padding: space.md,
    gap: space.sm,
    borderWidth: 1,
    borderColor: theme.border.base,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerInfo: {
    flex: 1,
    paddingRight: space.sm,
  },
  cardHeaderActions: {
    flexDirection: "row",
    gap: space.xs,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cardTitle: {
    letterSpacing: 0.4,
  },
  eyebrow: {
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  primaryButton: {
    backgroundColor: theme.accent.base,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: withAlpha(theme.accent.base, 0.7),
  },
  iconButton: {
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.md,
    paddingVertical: space.xs,
    paddingHorizontal: 10,
    backgroundColor: theme.bg.elevated,
  },
  editLineupButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: withAlpha(theme.success.base, 0.45),
    backgroundColor: theme.success.subtle,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  editLineupButtonActive: {
    backgroundColor: withAlpha(theme.success.base, 0.22),
  },
  editLineupButtonDisabled: {
    opacity: 0.55,
  },
  actionsRow: {
    flexDirection: "row",
    gap: space.xs,
    marginTop: 2,
  },
  quickActionButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.elevated,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
  },
  quickActionIcon: {
    marginTop: 1,
  },
  generateWrap: {
    marginTop: 2,
  },
  generateButton: {
    minHeight: 46,
  },
  saveRow: {
    marginTop: space.xs,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.xs,
  },
  saveRowButton: {
    minHeight: 36,
  },
  saveInlineButton: {
    minWidth: 112,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: withAlpha(theme.text.primary, 0.28),
    backgroundColor: withAlpha(theme.bg.raised, 0.9),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    paddingVertical: 6,
  },
  gridSlot: {
    position: "relative",
  },
  skeletonOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
