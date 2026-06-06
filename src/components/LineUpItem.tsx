import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Entypo } from "../icons";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { InningAssignment } from "../types/lineup";

type Props = {
  inning: InningAssignment;
  expanded: boolean;
  onToggle: () => void;
};

const LineUpItem = ({ inning, expanded, onToggle }: Props) => {
  const filledCount = Object.values(inning.positions).filter(Boolean).length;

  return (
    <View style={styles.inningCard}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.inningHeader, pressed && { opacity: 0.9 }]}
      >
        <View>
          <Text style={styles.inningTitle}>Inning {inning.inning}</Text>
          <Text style={styles.inningSubtitle}>{filledCount} positions filled</Text>
        </View>
        <Entypo
          name={expanded ? "chevron-small-up" : "chevron-small-down"}
          size={24}
          color={palette.text}
        />
      </Pressable>

      {expanded && (
        <>
          <View style={styles.positionsGrid}>
            {Object.entries(inning.positions).map(([pos, name]) => (
              <View key={`${inning.inning}-${pos}`} style={styles.positionRow}>
                <Text style={styles.positionLabel}>{pos}</Text>
                <Text style={styles.positionValue}>{name ?? "—"}</Text>
              </View>
            ))}
          </View>

          <View style={styles.benchSection}>
            <Text style={styles.benchLabel}>Bench</Text>
            <View style={styles.benchWrap}>
              {(inning.bench.length ? inning.bench : ["None"]).map((name) => (
                <View key={`${inning.inning}-bench-${name}`} style={styles.benchChip}>
                  <Text style={styles.benchChipText}>{name}</Text>
                </View>
              ))}
            </View>
          </View>

          {inning.droppedPosition ? (
            <Text style={styles.subtext}>Dropped position: {inning.droppedPosition}</Text>
          ) : null}
        </>
      )}
    </View>
  );
};

export default memo(LineUpItem);

const styles = StyleSheet.create({
  inningCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    backgroundColor: palette.cardAlt,
  },
  inningHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inningTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 15,
  },
  inningSubtitle: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  positionsGrid: {
    gap: 6,
  },
  positionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  positionLabel: {
    color: palette.subtext,
    fontFamily: typeface.mono,
    fontSize: 12,
  },
  positionValue: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  benchSection: {
    gap: 6,
    marginTop: 4,
  },
  benchLabel: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  benchWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  benchChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(239,107,91,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,107,91,0.35)",
  },
  benchChipText: {
    color: palette.danger,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
  subtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
});
