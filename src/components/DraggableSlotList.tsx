import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";

type SlotPlayer = {
  id: string;
  name: string;
};

type Props = {
  slots: string[];
  players: SlotPlayer[];
  onDragStateChange?: (isDragging: boolean) => void;
  onReorderPlayers: (nextPlayers: SlotPlayer[]) => void;
  onBenchAt: (index: number) => void;
};

const DEFAULT_ROW_HEIGHT = 56;
const REVERSE_SWAP_HYSTERESIS_PX = 10;
const MIN_REVERSE_DRAG_PX = 34;
const MAX_DIRECTION_SWITCH_DELTA_PX = 46;
const SWAP_CONSUME_FACTOR = 0.45;
const DRAG_DEBUG = (process.env.EXPO_PUBLIC_LINEUP_DRAG_DEBUG ?? "1") !== "0";

const dragLog = (...args: unknown[]) => {
  if (!DRAG_DEBUG) return;
  console.log("[LineupDrag]", ...args);
};

const DraggableSlotList = ({
  slots,
  players,
  onDragStateChange,
  onReorderPlayers,
  onBenchAt,
}: Props) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingTranslateY = useRef(new Animated.Value(0)).current;
  const rowHeightsRef = useRef(new Map<string, number>());
  const playersRef = useRef(players);
  const draggingIdRef = useRef<string | null>(null);
  const activeIndexRef = useRef<number>(-1);
  const consumedDyRef = useRef<number>(0);
  const lastSwapDirectionRef = useRef<0 | 1 | -1>(0);
  const lastSwapGestureDyRef = useRef<number>(0);
  const lastGestureDyRef = useRef<number>(0);

  useEffect(() => {
    playersRef.current = players;
    if (draggingIdRef.current) {
      activeIndexRef.current = players.findIndex((p) => p.id === draggingIdRef.current);
      dragLog("players_update", {
        draggingId: draggingIdRef.current,
        nextActiveIndex: activeIndexRef.current,
        order: players.map((p) => p.name),
      });
    }
  }, [players]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
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

      dragLog("swap_commit", {
        fromIndex,
        toIndex,
        moved: moved.name,
        before: currentPlayers.map((p) => p.name),
        after: nextPlayers.map((p) => p.name),
      });

      playersRef.current = nextPlayers;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onReorderPlayers(nextPlayers);
    },
    [onReorderPlayers],
  );

  const stopDrag = useCallback((reason: "release" | "terminate") => {
    dragLog("drag_end_begin", {
      reason,
      draggingId: draggingIdRef.current,
      activeIndex: activeIndexRef.current,
      consumedDy: consumedDyRef.current,
    });

    setDraggingId(null);
    draggingIdRef.current = null;
    activeIndexRef.current = -1;
    consumedDyRef.current = 0;
    lastSwapDirectionRef.current = 0;
    lastSwapGestureDyRef.current = 0;
    lastGestureDyRef.current = 0;
    onDragStateChange?.(false);
    draggingTranslateY.stopAnimation(() => {
      draggingTranslateY.setValue(0);
      dragLog("drag_end_complete", { reason });
    });
  }, [draggingTranslateY, onDragStateChange]);

  const maybeSwapRows = useCallback(
    (gestureDy: number) => {
      const activeId = draggingIdRef.current;
      if (!activeId) return;

      const activeIndex = activeIndexRef.current;
      if (activeIndex < 0) return;

      let currentIndex = activeIndex;
      let localOffset = gestureDy - consumedDyRef.current;
      const currentPlayers = playersRef.current;
      const dyDelta = gestureDy - lastGestureDyRef.current;
      const movingDown = dyDelta > 0.6;
      const movingUp = dyDelta < -0.6;

      if (movingDown) {
        const switchingFromUp = lastSwapDirectionRef.current === -1;
        if (switchingFromUp && Math.abs(dyDelta) > MAX_DIRECTION_SWITCH_DELTA_PX) {
          dragLog("direction_switch_jump_blocked", {
            direction: "down",
            dyDelta,
            maxAllowed: MAX_DIRECTION_SWITCH_DELTA_PX,
            gestureDy,
          });
          draggingTranslateY.setValue(localOffset);
          lastGestureDyRef.current = gestureDy;
          return;
        }

        let swapped = false;
        if (localOffset > 0 && currentIndex < currentPlayers.length - 1) {
          const nextPlayer = currentPlayers[currentIndex + 1];
          const nextHeight = rowHeightsRef.current.get(nextPlayer.id) ?? DEFAULT_ROW_HEIGHT;
          const reverseTravel = gestureDy - lastSwapGestureDyRef.current;
          const reverseBlocked =
            lastSwapDirectionRef.current === -1 && reverseTravel < MIN_REVERSE_DRAG_PX;
          const threshold =
            nextHeight * 0.5 +
            (lastSwapDirectionRef.current === -1 ? REVERSE_SWAP_HYSTERESIS_PX : 0);

          if (reverseBlocked) {
            dragLog("reverse_drag_blocked", {
              direction: "down",
              reverseTravel,
              minRequired: MIN_REVERSE_DRAG_PX,
              gestureDy,
            });
          } else if (localOffset >= threshold) {
            dragLog("swap_down_threshold", {
              gestureDy,
              localOffset,
              threshold,
              currentIndex,
              nextIndex: currentIndex + 1,
              nextPlayer: nextPlayer.name,
            });

            movePlayer(currentIndex, currentIndex + 1);
            consumedDyRef.current += nextHeight * SWAP_CONSUME_FACTOR;
            currentIndex += 1;
            activeIndexRef.current = currentIndex;
            lastSwapDirectionRef.current = 1;
            lastSwapGestureDyRef.current = gestureDy;
            localOffset = gestureDy - consumedDyRef.current;
            swapped = true;
          }
        }
        if (swapped) {
          draggingTranslateY.setValue(localOffset);
          lastGestureDyRef.current = gestureDy;
          return;
        }
      }

      if (movingUp) {
        const switchingFromDown = lastSwapDirectionRef.current === 1;
        if (switchingFromDown && Math.abs(dyDelta) > MAX_DIRECTION_SWITCH_DELTA_PX) {
          dragLog("direction_switch_jump_blocked", {
            direction: "up",
            dyDelta,
            maxAllowed: MAX_DIRECTION_SWITCH_DELTA_PX,
            gestureDy,
          });
          draggingTranslateY.setValue(localOffset);
          lastGestureDyRef.current = gestureDy;
          return;
        }

        let swapped = false;
        if (localOffset < 0 && currentIndex > 0) {
          const prevPlayer = currentPlayers[currentIndex - 1];
          const prevHeight = rowHeightsRef.current.get(prevPlayer.id) ?? DEFAULT_ROW_HEIGHT;
          const reverseTravel = lastSwapGestureDyRef.current - gestureDy;
          const reverseBlocked =
            lastSwapDirectionRef.current === 1 && reverseTravel < MIN_REVERSE_DRAG_PX;
          const threshold =
            prevHeight * 0.5 +
            (lastSwapDirectionRef.current === 1 ? REVERSE_SWAP_HYSTERESIS_PX : 0);

          if (reverseBlocked) {
            dragLog("reverse_drag_blocked", {
              direction: "up",
              reverseTravel,
              minRequired: MIN_REVERSE_DRAG_PX,
              gestureDy,
            });
          } else if (Math.abs(localOffset) >= threshold) {
            dragLog("swap_up_threshold", {
              gestureDy,
              localOffset,
              threshold,
              currentIndex,
              prevIndex: currentIndex - 1,
              prevPlayer: prevPlayer.name,
            });

            movePlayer(currentIndex, currentIndex - 1);
            consumedDyRef.current -= prevHeight * SWAP_CONSUME_FACTOR;
            currentIndex -= 1;
            activeIndexRef.current = currentIndex;
            lastSwapDirectionRef.current = -1;
            lastSwapGestureDyRef.current = gestureDy;
            localOffset = gestureDy - consumedDyRef.current;
            swapped = true;
          }
        }
        if (swapped) {
          draggingTranslateY.setValue(localOffset);
          lastGestureDyRef.current = gestureDy;
          return;
        }
      }

      draggingTranslateY.setValue(localOffset);
      lastGestureDyRef.current = gestureDy;
    },
    [draggingTranslateY, movePlayer],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => draggingIdRef.current !== null,
        onMoveShouldSetPanResponderCapture: () => draggingIdRef.current !== null,
        onPanResponderTerminationRequest: () => {
          dragLog("termination_request_blocked");
          return false;
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!draggingIdRef.current) return;
          maybeSwapRows(gestureState.dy);
        },
        onPanResponderRelease: () => stopDrag("release"),
        onPanResponderTerminate: () => stopDrag("terminate"),
      }),
    [maybeSwapRows, stopDrag],
  );

  const beginDrag = useCallback(
    (playerId: string, playerName: string) => {
      if (!playerName.trim()) return;
      if (draggingIdRef.current) return;
      const index = playersRef.current.findIndex((player) => player.id === playerId);
      if (index < 0) return;

      dragLog("drag_begin", {
        playerId,
        playerName,
        index,
        order: playersRef.current.map((p) => p.name),
      });
      draggingIdRef.current = playerId;
      activeIndexRef.current = index;
      consumedDyRef.current = 0;
      lastSwapDirectionRef.current = 0;
      lastSwapGestureDyRef.current = 0;
      lastGestureDyRef.current = 0;
      draggingTranslateY.setValue(0);
      setDraggingId(playerId);
      onDragStateChange?.(true);
    },
    [draggingTranslateY, onDragStateChange],
  );

  return (
    <View style={styles.listWrap}>
      {players.map((player, index) => {
        const isDragging = draggingId === player.id;
        const slotLabel = slots[index] ?? `Slot ${index + 1}`;
        const hasPlayer = Boolean(player.name.trim());

        return (
          <Animated.View
            key={player.id}
            style={[
              styles.rowWrap,
              isDragging && styles.draggingRow,
              isDragging ? { transform: [{ translateY: draggingTranslateY }] } : null,
            ]}
            onLayout={(event) => {
              const prior = rowHeightsRef.current.get(player.id);
              rowHeightsRef.current.set(player.id, event.nativeEvent.layout.height);
              if (prior == null) {
                dragLog("row_height", {
                  playerId: player.id,
                  playerName: player.name,
                  height: event.nativeEvent.layout.height,
                });
              }
            }}
            {...(isDragging ? panResponder.panHandlers : {})}
          >
            <View style={styles.slotRow}>
              <Text style={styles.slotLabel}>{slotLabel}</Text>
              <View style={styles.slotActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.playerCard,
                    pressed && !isDragging && { opacity: 0.88 },
                  ]}
                  onLongPress={() => beginDrag(player.id, player.name)}
                  delayLongPress={40}
                >
                  <Text style={styles.playerText}>
                    {hasPlayer ? player.name : "Drop player here"}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.benchButton,
                    !hasPlayer && styles.benchButtonDisabled,
                    pressed && hasPlayer && { opacity: 0.85 },
                  ]}
                  onPress={() => onBenchAt(index)}
                  disabled={!hasPlayer}
                >
                  <Text style={styles.benchButtonText}>Bench</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  listWrap: {
    gap: 7,
  },
  rowWrap: {
    zIndex: 1,
  },
  draggingRow: {
    zIndex: 50,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  slotRow: {
    gap: 5,
  },
  slotLabel: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
  slotActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playerCard: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(126,207,157,0.45)",
    backgroundColor: "rgba(126,207,157,0.12)",
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  playerText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  benchButton: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  benchButtonDisabled: {
    opacity: 0.45,
  },
  benchButtonText: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
});

export default memo(DraggableSlotList);
