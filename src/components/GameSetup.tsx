import React, { memo, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Entypo } from "../icons";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { InningAssignment, Player } from "../types/lineup";
import LineUp from "./LineUp";

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
  onSelectAll: () => void;
  onGenerate: () => void;
  onSaveLineup: () => void;
  onToggleInning: (inning: number) => void;
  onSetLineupCell: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  playerGenderByName?: Record<string, Player["gender"]>;
  onLineupDragStateChange?: (isDragging: boolean) => void;
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
        <ActivityIndicator color={palette.accent} />
        <Text style={styles.loaderTitle}>Generating lineup...</Text>
      </View>
      <Text style={styles.loaderText}>
        Balancing positions, bench rotation, and your custom rules.
      </Text>
      <View style={styles.loaderTrack}>
        <Animated.View style={[styles.loaderFill, { width }]} />
      </View>
    </View>
  );
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
  onSelectAll,
  onGenerate,
  onSaveLineup,
  onToggleInning,
  onSetLineupCell,
  playerGenderByName,
  onLineupDragStateChange,
}: Props) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.headerInfo}>
        <Text style={styles.eyebrow}>Generate</Text>
        <Text style={styles.cardTitle}>Lineup Engine</Text>
        <Text style={styles.caption}>{activePlayersCount} active players</Text>
      </View>
      <View style={styles.cardHeaderActions}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{lineup?.length ?? 0}/7</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onToggleCollapse}
        >
          <Entypo
            name={collapsed ? "chevron-small-down" : "chevron-small-up"}
            size={24}
            color={palette.text}
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
          >
            <Text style={styles.quickActionText}>Edit selection</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              pressed && { opacity: 0.9 },
            ]}
            onPress={onSelectAll}
          >
            <Text style={styles.quickActionText}>Select all</Text>
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
          >
            <Text style={styles.primaryText}>
              {isGenerating ? "Working..." : "Generate lineup"}
            </Text>
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
            >
              <Text style={styles.editLineupText}>
                {isInlineEditing ? "Done editing" : "Edit lineup"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.saveInlineButton,
                styles.saveRowButton,
                pressed && { opacity: 0.9 },
              ]}
              onPress={onSaveLineup}
            >
              <Text style={styles.saveButtonText}>Save lineup</Text>
            </Pressable>
          </View>
        ) : null}

        {isGenerating ? <GeneratingState /> : null}
        {!isGenerating && status ? (
          <Text style={styles.status}>{status}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>
          Engine honors locked/fixed players, minimum women requirements,
          catcher rules, and fair bench rotation.
        </Text>

        <LineUp
          lineup={lineup}
          expandedInnings={expandedInnings}
          onToggleInning={onToggleInning}
          editable={isInlineEditing}
          onSetPlayerPosition={onSetLineupCell}
          playerGenderByName={playerGenderByName}
          onDragStateChange={onLineupDragStateChange}
        />
      </>
    )}
  </View>
);

export default memo(GameSetup);

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerInfo: {
    flex: 1,
    paddingRight: 12,
  },
  cardHeaderActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cardTitle: {
    color: palette.text,
    fontSize: 22,
    fontFamily: typeface.display,
    letterSpacing: 0.4,
  },
  caption: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: typeface.heading,
    marginBottom: 2,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.7)",
  },
  primaryText: {
    color: palette.accentText,
    fontSize: 14,
    fontFamily: typeface.heading,
  },
  iconButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: palette.cardAlt,
  },
  badge: {
    borderWidth: 1,
    borderColor: "rgba(126,207,157,0.45)",
    borderRadius: 10,
    backgroundColor: "rgba(126,207,157,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  badgeText: {
    color: palette.success,
    fontFamily: typeface.mono,
    fontSize: 12,
  },
  editLineupButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(126,207,157,0.45)",
    backgroundColor: "rgba(126,207,157,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editLineupButtonActive: {
    backgroundColor: "rgba(126,207,157,0.22)",
  },
  editLineupButtonDisabled: {
    opacity: 0.55,
  },
  editLineupText: {
    color: palette.success,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  quickActionButton: {
    flex: 1,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  quickActionText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  generateWrap: {
    marginTop: 2,
  },
  generateButton: {
    minHeight: 46,
  },
  saveRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  saveRowButton: {
    minHeight: 36,
  },
  saveInlineButton: {
    minWidth: 112,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(21, 47, 39, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveButtonText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  loaderCard: {
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.45)",
    borderRadius: 12,
    backgroundColor: "rgba(242,166,59,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  loaderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loaderTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 14,
  },
  loaderText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  loaderTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  loaderFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  status: {
    color: palette.success,
    fontFamily: typeface.body,
  },
  error: {
    color: palette.danger,
    fontFamily: typeface.body,
  },
  hint: {
    color: palette.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typeface.body,
  },
});
