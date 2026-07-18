import React, { memo, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import type Reanimated from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import { Feather } from "../icons";
import { theme, withAlpha } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { InningAssignment, Player } from "../types/lineup";
import LineUp from "./lineup/LineupGrid";
import { AppText } from "./ui";

type Props = {
  activePlayersCount: number;
  segmentCount: number;
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
  lineupScrollableRef?: AnimatedRef<Reanimated.ScrollView>;
  lineupAnchorRef?: React.RefObject<View | null>;
};

const GeneratingState = () => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 850,
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 850,
          useNativeDriver: false,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["22%", "92%"],
  });

  return (
    <View style={styles.loaderCard}>
      <View style={styles.loaderHeaderRow}>
        <ActivityIndicator color={theme.accent.base} />
        <AppText variant="body" family="heading">
          Generating lineup...
        </AppText>
      </View>
      <AppText variant="caption" color="secondary">
        Balancing positions, bench rotation, and your custom rules.
      </AppText>
      <View style={styles.loaderTrack}>
        <Animated.View style={[styles.loaderFill, { width }]} />
      </View>
    </View>
  );
};

const GameSetup = ({
  activePlayersCount,
  segmentCount,
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
}: Props) => (
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
        <View style={styles.badge}>
          <AppText variant="caption" family="mono" color="success">
            {lineup?.length ?? 0}/{segmentCount}
          </AppText>
        </View>
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

        {isGenerating ? <GeneratingState /> : null}
        {error ? (
          <AppText variant="body" color="danger">
            {error}
          </AppText>
        ) : null}

        <View ref={lineupAnchorRef} collapsable={false}>
          <LineUp
            lineup={lineup}
            expandedInnings={expandedInnings}
            onToggleInning={onToggleInning}
            editable={isInlineEditing}
            onSetPlayerPosition={onSetLineupCell}
            playerGenderByName={playerGenderByName}
            scrollableRef={lineupScrollableRef}
          />
        </View>
      </>
    )}
  </View>
);

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
  badge: {
    borderWidth: 1,
    borderColor: withAlpha(theme.success.base, 0.45),
    borderRadius: radius.sm,
    backgroundColor: theme.success.subtle,
    paddingHorizontal: 10,
    paddingVertical: 7,
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
  loaderCard: {
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    borderRadius: radius.md,
    backgroundColor: theme.accent.subtle,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  loaderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  loaderTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(theme.text.primary, 0.12),
    overflow: "hidden",
  },
  loaderFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: theme.accent.base,
  },
});
