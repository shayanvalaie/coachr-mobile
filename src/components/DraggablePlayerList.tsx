import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  PanResponder,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
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
  const draggingTranslateY = useRef(new Animated.Value(0)).current;
  const rowHeightsRef = useRef(new Map<string, number>());
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onReorderPlayers(nextPlayers);
    },
    [onReorderPlayers],
  );

  const stopDrag = useCallback(() => {
    Animated.spring(draggingTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 16,
      stiffness: 220,
    }).start(() => {
      setDraggingId(null);
      draggingIdRef.current = null;
      activeIndexRef.current = -1;
      consumedDyRef.current = 0;
      onDragStateChange?.(false);
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

      while (localOffset > 0 && currentIndex < currentPlayers.length - 1) {
        const nextPlayer = currentPlayers[currentIndex + 1];
        const nextHeight = rowHeightsRef.current.get(nextPlayer.id) ?? DEFAULT_ROW_HEIGHT;
        if (localOffset < nextHeight * 0.5) break;

        movePlayer(currentIndex, currentIndex + 1);
        consumedDyRef.current += nextHeight;
        currentIndex += 1;
        activeIndexRef.current = currentIndex;
        localOffset = gestureDy - consumedDyRef.current;
      }

      while (localOffset < 0 && currentIndex > 0) {
        const prevPlayer = currentPlayers[currentIndex - 1];
        const prevHeight = rowHeightsRef.current.get(prevPlayer.id) ?? DEFAULT_ROW_HEIGHT;
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
      setDraggingId(playerId);
      onDragStateChange?.(true);
    },
    [draggingTranslateY, isSaving, onDragStateChange],
  );

  return (
    <View style={styles.listWrap}>
      {players.map((player) => {
        const isDragging = draggingId === player.id;

        return (
          <Animated.View
            key={player.id}
            style={[
              styles.rowWrap,
              isDragging && styles.draggingRow,
              isDragging
                ? {
                    transform: [{ translateY: draggingTranslateY }],
                  }
                : null,
            ]}
            onLayout={(event) => {
              rowHeightsRef.current.set(player.id, event.nativeEvent.layout.height);
            }}
            {...(isDragging ? panResponder.panHandlers : {})}
          >
            <PlayerCard
              player={player}
              isExpanded={expandedPlayers.has(player.id)}
              isActive={activeIds.has(player.id)}
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
  draggingRow: {
    zIndex: 50,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});

export default memo(DraggablePlayerList);
