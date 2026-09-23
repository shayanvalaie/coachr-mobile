import React, { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import { space } from "../theme/tokens";
import { InningAssignment, Player } from "../types/lineup";
import LineupGrid from "./lineup/LineupGrid";
import LineupGridSkeleton from "./lineup/LineupGridSkeleton";
import { AppText, Button } from "./ui";

type Props = {
  activePlayersCount: number;
  inningCount: number;
  inningLabel: string;
  lineup: InningAssignment[] | null;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onEditLineup: () => void;
  onSaveLineup: () => void;
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

// How long the skeleton lingers over a freshly mounted grid before it fades.
const REVEAL_HOLD_MS = 280;

// The generation panel: one amber button before a lineup exists, a skeleton
// while the engine works, then the grid with Regenerate / Edit / Save.
const GameSetup = ({
  activePlayersCount,
  inningCount,
  inningLabel,
  lineup,
  isGenerating,
  error,
  onGenerate,
  onEditLineup,
  onSaveLineup,
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
      setRevealPhase("revealing");
      const timer = setTimeout(() => setRevealPhase("idle"), REVEAL_HOLD_MS);
      return () => clearTimeout(timer);
    }
  }, [isGenerating]);

  const showGenerate = !lineup && !isGenerating;
  const showActions = !!lineup && !isGenerating;
  const skeletonMessage = `Balancing bench time across ${inningCount} ${inningLabel}${
    inningCount === 1 ? "" : "s"
  }…`;

  return (
    <View style={styles.panel}>
      {showGenerate ? (
        <Button
          label="Generate lineup"
          icon="zap"
          size="lg"
          fullWidth
          onPress={onGenerate}
          accessibilityLabel="Generate lineup"
        />
      ) : null}

      {error ? (
        <AppText variant="body" color="danger">
          {error}
        </AppText>
      ) : null}

      {/* Skeleton -> grid cross-fade. During generation the skeleton holds
          the slot. On completion the grid mounts underneath and the skeleton
          overlays it opaquely for a beat, then fades out - so the finished
          lineup appears all at once rather than row-by-row. */}
      {lineup || revealPhase !== "idle" ? (
        <View ref={lineupAnchorRef} collapsable={false} style={styles.gridSlot}>
          {revealPhase !== "generating" && lineup ? (
            <LineupGrid
              lineup={lineup}
              onSetPlayerPosition={onSetLineupCell}
              playerGenderByName={playerGenderByName}
              scrollableRef={lineupScrollableRef}
            />
          ) : null}
          {revealPhase !== "idle" ? (
            <Animated.View
              pointerEvents="none"
              exiting={FadeOut.duration(300)}
              style={revealPhase === "revealing" ? styles.skeletonOverlay : undefined}
            >
              <LineupGridSkeleton
                rows={activePlayersCount}
                innings={inningCount}
                message={skeletonMessage}
              />
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {showActions ? (
        <View style={styles.actionRow}>
          <Button
            label="Regenerate"
            variant="secondary"
            size="lg"
            onPress={onGenerate}
            style={styles.action}
            accessibilityLabel="Regenerate lineup"
          />
          <Button
            label="Edit"
            variant="success"
            size="lg"
            onPress={onEditLineup}
            style={styles.action}
            accessibilityLabel="Edit lineup"
          />
          <Button
            label="Save"
            size="lg"
            onPress={onSaveLineup}
            style={styles.action}
            accessibilityLabel="Save lineup"
          />
        </View>
      ) : null}
    </View>
  );
};

export default memo(GameSetup);

const styles = StyleSheet.create({
  panel: {
    gap: space.sm + 2,
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
  actionRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  action: {
    flex: 1,
    paddingHorizontal: space.xs,
  },
});
