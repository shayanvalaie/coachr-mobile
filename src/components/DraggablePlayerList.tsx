import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Player } from "../types/lineup";
import PlayerCard from "./Player";

type Props = {
  players: Player[];
  expandedPlayers: Set<string>;
  activeIds: Set<string>;
  isSaving: boolean;
  lineupSlots: string[];
  onDragStateChange?: (isDragging: boolean) => void;
  onReorderPlayers: (nextPlayers: Player[]) => void;
  onToggleExpand: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onUpdatePlayer: (id: string, patch: Partial<Player>) => void;
  onRemovePlayer: (id: string) => void;
  onSavePlayer: (id: string) => void;
};

const DEFAULT_ROW_HEIGHT = 108;
// Must match styles.listWrap gap so swap distances line up with layout.
const ROW_GAP = 10;

const DraggablePlayerList = ({
  players,
  expandedPlayers,
  activeIds,
  isSaving,
  lineupSlots,
  onDragStateChange,
  onReorderPlayers,
  onToggleExpand,
  onToggleActive,
  onUpdatePlayer,
  onRemovePlayer,
  onSavePlayer,
}: Props) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Visual "lifted" styling (border, shadow). Cleared immediately on release,
  // while draggingId stays set until the snap-back animation finishes.
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const draggingTranslateY = useRef(new Animated.Value(0)).current;
  const draggingScale = useRef(new Animated.Value(1)).current;
  const rowShiftsRef = useRef(new Map<string, Animated.Value>());
  const rowHeightsRef = useRef(new Map<string, number>());
  const rowYsRef = useRef(new Map<string, number>());
  const playersRef = useRef(players);
  const draggingIdRef = useRef<string | null>(null);
  const activeIndexRef = useRef<number>(-1);
  const consumedDyRef = useRef<number>(0);

  useEffect(() => {
    playersRef.current = players;
    if (draggingIdRef.current) {
      activeIndexRef.current = players.findIndex((p) => p.id === draggingIdRef.current);
    }
  }, [players]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const getRowShift = useCallback((id: string) => {
    let value = rowShiftsRef.current.get(id);
    if (!value) {
      value = new Animated.Value(0);
      rowShiftsRef.current.set(id, value);
    }
    return value;
  }, []);

  const movePlayer = useCallback(
    (fromIndex: number, toIndex: number) => {
      const currentPlayers = playersRef.current;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentPlayers.length ||
        toIndex >= currentPlayers.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const nextPlayers = [...currentPlayers];
      const [moved] = nextPlayers.splice(fromIndex, 1);
      nextPlayers.splice(toIndex, 0, moved);

      playersRef.current = nextPlayers;

      // Displaced neighbors animate into place from onLayout (FLIP), which
      // fires with their actual new position — guessing the offset here and
      // setting it before React commits the reorder causes a one-frame jump.
      onReorderPlayers(nextPlayers);
    },
    [onReorderPlayers],
  );

  const stopDrag = useCallback(() => {
    // Drop the lifted styling right away; only the position snap-back
    // keeps running until it settles.
    setLiftedId(null);
    Animated.parallel([
      Animated.spring(draggingTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 320,
        restDisplacementThreshold: 0.5,
        restSpeedThreshold: 5,
      }),
      Animated.spring(draggingScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 320,
        restDisplacementThreshold: 0.005,
        restSpeedThreshold: 0.05,
      }),
    ]).start(() => {
      setDraggingId(null);
      draggingIdRef.current = null;
      activeIndexRef.current = -1;
      consumedDyRef.current = 0;
      onDragStateChange?.(false);
    });
  }, [draggingTranslateY, draggingScale, onDragStateChange]);

  const maybeSwapRows = useCallback(
    (gestureDy: number) => {
      const activeId = draggingIdRef.current;
      if (!activeId) return;

      const activeIndex = activeIndexRef.current;
      if (activeIndex < 0) return;

      let currentIndex = activeIndex;
      let localOffset = gestureDy - consumedDyRef.current;
      const currentPlayers = playersRef.current;

      while (localOffset > 0 && currentIndex < currentPlayers.length - 1) {
        const nextPlayer = currentPlayers[currentIndex + 1];
        const nextHeight =
          (rowHeightsRef.current.get(nextPlayer.id) ?? DEFAULT_ROW_HEIGHT) +
          ROW_GAP;
        if (localOffset < nextHeight * 0.5) break;

        movePlayer(currentIndex, currentIndex + 1);
        consumedDyRef.current += nextHeight;
        currentIndex += 1;
        activeIndexRef.current = currentIndex;
        localOffset = gestureDy - consumedDyRef.current;
      }

      while (localOffset < 0 && currentIndex > 0) {
        const prevPlayer = currentPlayers[currentIndex - 1];
        const prevHeight =
          (rowHeightsRef.current.get(prevPlayer.id) ?? DEFAULT_ROW_HEIGHT) +
          ROW_GAP;
        if (Math.abs(localOffset) < prevHeight * 0.5) break;

        movePlayer(currentIndex, currentIndex - 1);
        consumedDyRef.current -= prevHeight;
        currentIndex -= 1;
        activeIndexRef.current = currentIndex;
        localOffset = gestureDy - consumedDyRef.current;
      }

      draggingTranslateY.setValue(localOffset);
    },
    [draggingTranslateY, movePlayer],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => draggingIdRef.current !== null,
        onMoveShouldSetPanResponderCapture: () => draggingIdRef.current !== null,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_event, gestureState) => {
          if (!draggingIdRef.current) return;
          maybeSwapRows(gestureState.dy);
        },
        onPanResponderRelease: stopDrag,
        onPanResponderTerminate: stopDrag,
      }),
    [maybeSwapRows, stopDrag],
  );

  const beginDrag = useCallback(
    (playerId: string) => {
      if (isSaving) return;
      const index = playersRef.current.findIndex((player) => player.id === playerId);
      if (index < 0) return;

      draggingIdRef.current = playerId;
      activeIndexRef.current = index;
      consumedDyRef.current = 0;
      draggingTranslateY.setValue(0);
      getRowShift(playerId).setValue(0);
      setDraggingId(playerId);
      setLiftedId(playerId);
      onDragStateChange?.(true);

      // Signal "drag mode": a haptic buzz and a slight lift of the card.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Animated.spring(draggingScale, {
        toValue: 1.03,
        useNativeDriver: true,
        damping: 14,
        stiffness: 260,
      }).start();
    },
    [draggingTranslateY, draggingScale, getRowShift, isSaving, onDragStateChange],
  );

  return (
    <View style={styles.listWrap}>
      {players.map((player) => {
        const isDragging = draggingId === player.id;
        const isLifted = liftedId === player.id;

        return (
          <Animated.View
            key={player.id}
            style={[
              styles.rowWrap,
              isDragging && styles.draggingRowLayer,
              isLifted && styles.liftedRow,
              isDragging
                ? {
                    transform: [
                      { translateY: draggingTranslateY },
                      { scale: draggingScale },
                    ],
                  }
                : {
                    transform: [{ translateY: getRowShift(player.id) }],
                  },
            ]}
            onLayout={(event) => {
              const { height, y } = event.nativeEvent.layout;
              rowHeightsRef.current.set(player.id, height);

              const prevY = rowYsRef.current.get(player.id);
              rowYsRef.current.set(player.id, y);

              // FLIP: when a drag reorders the list, a displaced row reports
              // its new position here. Start it at its old spot and spring it
              // into place — using the real measured offset avoids the
              // one-frame jump that guessing the distance caused.
              if (
                draggingIdRef.current &&
                player.id !== draggingIdRef.current &&
                prevY !== undefined &&
                prevY !== y
              ) {
                const shift = getRowShift(player.id);
                shift.setValue(prevY - y);
                Animated.spring(shift, {
                  toValue: 0,
                  useNativeDriver: true,
                  damping: 20,
                  stiffness: 300,
                  restDisplacementThreshold: 0.5,
                  restSpeedThreshold: 5,
                }).start();
              }
            }}
            {...(isDragging ? panResponder.panHandlers : {})}
          >
            <PlayerCard
              player={player}
              isExpanded={expandedPlayers.has(player.id)}
              isActive={activeIds.has(player.id)}
              isDragging={isLifted}
              lineupSlots={lineupSlots}
              onDragLongPress={() => beginDrag(player.id)}
              onToggleExpand={() => onToggleExpand(player.id)}
              onToggleActive={(active) => onToggleActive(player.id, active)}
              onUpdate={(patch) => onUpdatePlayer(player.id, patch)}
              onRemove={() => onRemovePlayer(player.id)}
              onSave={() => onSavePlayer(player.id)}
              isSaving={isSaving}
            />
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  listWrap: {
    gap: 10,
  },
  rowWrap: {
    zIndex: 1,
  },
  // Stacking only — kept until the snap-back finishes so the card
  // travels above its neighbors.
  draggingRowLayer: {
    zIndex: 50,
  },
  // Raised look — dropped immediately on release.
  liftedRow: {
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});

export default memo(DraggablePlayerList);
