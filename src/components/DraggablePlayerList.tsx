import React, { memo, useCallback, useState } from "react";
import * as Haptics from "expo-haptics";
import type Animated from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import Sortable, {
  type DragStartParams,
  type SortableGridDragEndParams,
  type SortableGridRenderItem,
} from "react-native-sortables";
import { space } from "../theme/tokens";
import { Player } from "../types/lineup";
import PlayerCard from "./Player";

type Props = {
  players: Player[];
  expandedPlayers: Set<string>;
  activeIds: Set<string>;
  isSaving: boolean;
  lineupSlots: string[];
  // Outer scroller hosting this list; Sortable auto-scrolls it when a
  // dragged card nears the viewport edge.
  scrollableRef: AnimatedRef<Animated.ScrollView>;
  onReorderPlayers: (nextPlayers: Player[]) => void;
  onToggleExpand: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onUpdatePlayer: (id: string, patch: Partial<Player>) => void;
  onRemovePlayer: (id: string) => void;
  onSavePlayer: (id: string) => void;
};

const DraggablePlayerList = ({
  players,
  expandedPlayers,
  activeIds,
  isSaving,
  lineupSlots,
  scrollableRef,
  onReorderPlayers,
  onToggleExpand,
  onToggleActive,
  onUpdatePlayer,
  onRemovePlayer,
  onSavePlayer,
}: Props) => {
  // Only drives PlayerCard's raised border styling; the drag itself (item
  // positions, neighbor shifts, lift scale/shadow) runs on the UI thread
  // inside Sortable and never touches React state until drop.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = useCallback(({ key }: DragStartParams) => {
    setDraggingId(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const handleOrderChange = useCallback(() => {
    // A light tick per swap so each reorder is felt, not just seen.
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleDragEnd = useCallback(
    ({ data }: SortableGridDragEndParams<Player>) => {
      setDraggingId(null);
      onReorderPlayers(data);
    },
    [onReorderPlayers],
  );

  const renderItem = useCallback<SortableGridRenderItem<Player>>(
    ({ item }) => (
      <PlayerCard
        player={item}
        isExpanded={expandedPlayers.has(item.id)}
        isActive={activeIds.has(item.id)}
        isDragging={draggingId === item.id}
        lineupSlots={lineupSlots}
        onToggleExpand={() => onToggleExpand(item.id)}
        onToggleActive={(active) => onToggleActive(item.id, active)}
        onUpdate={(patch) => onUpdatePlayer(item.id, patch)}
        onRemove={() => onRemovePlayer(item.id)}
        onSave={() => onSavePlayer(item.id)}
        isSaving={isSaving}
      />
    ),
    [
      expandedPlayers,
      activeIds,
      draggingId,
      lineupSlots,
      isSaving,
      onToggleExpand,
      onToggleActive,
      onUpdatePlayer,
      onRemovePlayer,
      onSavePlayer,
    ],
  );

  return (
    <Sortable.Grid
      data={players}
      renderItem={renderItem}
      keyExtractor={(player) => player.id}
      columns={1}
      rowGap={space.sm}
      // Drag starts from the Sortable.Handle inside PlayerCard (the
      // avatar + name area), so the expanded card's inputs, switch and
      // buttons never fight the drag gesture.
      customHandle
      sortEnabled={!isSaving}
      scrollableRef={scrollableRef}
      activeItemScale={1.03}
      activeItemShadowOpacity={0.15}
      // Keep neighbors at full opacity — the lift alone marks the active
      // card, matching the rest of the app's drag styling.
      inactiveItemOpacity={1}
      onDragStart={handleDragStart}
      onOrderChange={handleOrderChange}
      onDragEnd={handleDragEnd}
    />
  );
};

export default memo(DraggablePlayerList);
