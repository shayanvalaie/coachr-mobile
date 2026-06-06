import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Entypo } from "../icons";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { Player } from "../types/lineup";
import DraggablePlayerList from "./DraggablePlayerList";

type Props = {
  players: Player[];
  expandedPlayers: Set<string>;
  activeIds: Set<string>;
  collapsed: boolean;
  isSaving: boolean;
  lineupSlots: string[];
  onToggleCollapse: () => void;
  onImportRoster: () => void;
  onAddPlayer: () => void;
  onSaveAll: () => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onReorderPlayers: (nextPlayers: Player[]) => void;
  onToggleExpand: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onUpdatePlayer: (id: string, patch: Partial<Player>) => void;
  onRemovePlayer: (id: string) => void;
  onSavePlayer: (id: string) => void;
};

const Roster = ({
  players,
  expandedPlayers,
  activeIds,
  collapsed,
  isSaving,
  lineupSlots,
  onToggleCollapse,
  onAddPlayer,
  onSaveAll,
  onReorderPlayers,
  onToggleExpand,
  onToggleActive,
  onUpdatePlayer,
  onRemovePlayer,
  onImportRoster,
  onSavePlayer,
  onDragStateChange,
}: Props) => {
  const activeCount = players.filter((player) =>
    activeIds.has(player.id),
  ).length;

  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [
          styles.cardHeader,
          pressed && { opacity: 0.85 },
        ]}
        onPress={onToggleCollapse}
      >
        <View>
          <Text style={styles.eyebrow}>Roster Builder</Text>
          <Text style={styles.cardTitle}>Players ({players.length})</Text>
          <Text style={styles.caption}>
            {activeCount} active for next lineup
          </Text>
        </View>
        <View style={styles.cardHeaderActions}>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{activeCount}</Text>
          </View>
          <View style={styles.rosterChevronButton}>
            <Entypo
              name={collapsed ? "chevron-small-down" : "chevron-small-up"}
              size={24}
              color={palette.text}
            />
          </View>
        </View>
      </Pressable>

      {collapsed ? null : (
        <>
          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.actionButton,
                pressed && { opacity: 0.9 },
              ]}
              onPress={onImportRoster}
            >
              <Text style={styles.secondaryText}>Import</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.actionButton,
                pressed && { opacity: 0.9 },
                isSaving && { opacity: 0.7 },
              ]}
              onPress={onSaveAll}
              disabled={isSaving}
            >
              <Text style={styles.secondaryText}>
                {isSaving ? "Saving..." : "Save all"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                styles.actionButton,
                pressed && { opacity: 0.9 },
              ]}
              onPress={onAddPlayer}
            >
              <Text style={styles.primaryText}>Add player</Text>
            </Pressable>
          </View>
          <View style={styles.listWrap}>
            <DraggablePlayerList
              players={players}
              expandedPlayers={expandedPlayers}
              activeIds={activeIds}
              isSaving={isSaving}
              lineupSlots={lineupSlots}
              onDragStateChange={onDragStateChange}
              onReorderPlayers={onReorderPlayers}
              onToggleExpand={onToggleExpand}
              onToggleActive={onToggleActive}
              onUpdatePlayer={onUpdatePlayer}
              onRemovePlayer={onRemovePlayer}
              onSavePlayer={onSavePlayer}
            />
          </View>
        </>
      )}
    </View>
  );
};

export default memo(Roster);

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
  cardHeaderActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  cardTitle: {
    color: palette.text,
    fontSize: 22,
    fontFamily: typeface.display,
    letterSpacing: 0.4,
  },
  caption: {
    color: palette.subtext,
    fontSize: 12,
    marginTop: 2,
    fontFamily: typeface.body,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontFamily: typeface.heading,
    marginBottom: 2,
  },
  countPill: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(242,166,59,0.16)",
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    color: palette.accent,
    fontSize: 15,
    fontFamily: typeface.heading,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: palette.cardAlt,
  },
  secondaryText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  primaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.6)",
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: palette.accent,
  },
  primaryText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  rosterChevronButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: palette.cardAlt,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  actionButton: {
    minWidth: 116,
  },
  listWrap: {
    gap: 10,
  },
});
