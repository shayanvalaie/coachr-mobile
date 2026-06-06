import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { InningAssignment } from "../types/lineup";
import { normalizePlayerName } from "../utils/playerNames";

type Props = {
  lineup: InningAssignment[] | null;
  expandedInnings: Set<number>;
  onToggleInning: (inning: number) => void;
  editable?: boolean;
  presentation?: "inline" | "editModal";
  onSetPlayerPosition?: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  playerGenderByName?: Record<string, "male" | "female">;
  onDragStateChange?: (isDragging: boolean) => void;
};

const BENCH_MARKER = "X";
const EMPTY_MARKER = "-";
const DEFAULT_ROW_HEIGHT = 44;

const LineUp = ({
  lineup,
  editable = false,
  presentation = "inline",
  onSetPlayerPosition,
  playerGenderByName,
  onDragStateChange,
}: Props) => {
  const [openCell, setOpenCell] = useState<{
    inningNumber: number;
    playerName: string;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [draggingName, setDraggingName] = useState<string | null>(null);
  const draggingTranslateY = useRef(new Animated.Value(0)).current;
  const rowHeightsRef = useRef(new Map<string, number>());
  const playerOrderRef = useRef<string[]>([]);
  const draggingNameRef = useRef<string | null>(null);
  const activeIndexRef = useRef<number>(-1);
  const consumedDyRef = useRef<number>(0);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const femalePlayerNames = useMemo(() => {
    const names = new Set<string>();
    if (!playerGenderByName) return names;
    Object.entries(playerGenderByName).forEach(([name, gender]) => {
      if (gender !== "female") return;
      const key = normalizePlayerName(name);
      if (!key) return;
      names.add(key);
    });
    return names;
  }, [playerGenderByName]);

  useEffect(() => {
    if (!editable) setOpenCell(null);
  }, [editable]);

  useEffect(() => {
    setOpenCell(null);
  }, [lineup]);

  const { innings, players: discoveredPlayers } = useMemo(() => {
    const sorted = [...(lineup ?? [])].sort((a, b) => a.inning - b.inning);
    const inningCells = sorted.map((inning) => {
      const cells = new Map<string, string>();
      Object.entries(inning.positions).forEach(([position, playerName]) => {
        if (typeof playerName !== "string") return;
        const trimmed = playerName.trim();
        if (!trimmed) return;
        cells.set(trimmed, position);
      });
      inning.bench.forEach((playerName) => {
        const trimmed = playerName.trim();
        if (!trimmed) return;
        cells.set(trimmed, BENCH_MARKER);
      });
      return {
        inningNumber: inning.inning,
        cells,
        slotOrder: Object.keys(inning.positions),
      };
    });

    const seenPlayers = new Set<string>();
    const orderedPlayers: string[] = [];
    inningCells.forEach(({ cells }) => {
      cells.forEach((_value, playerName) => {
        if (seenPlayers.has(playerName)) return;
        seenPlayers.add(playerName);
        orderedPlayers.push(playerName);
      });
    });

    return { innings: inningCells, players: orderedPlayers };
  }, [lineup]);

  const [playerOrder, setPlayerOrder] = useState<string[]>([]);

  useEffect(() => {
    setPlayerOrder((prev) => {
      const discoveredSet = new Set(discoveredPlayers);
      const kept = prev.filter((name) => discoveredSet.has(name));
      const keptSet = new Set(kept);
      const appended = discoveredPlayers.filter((name) => !keptSet.has(name));
      return [...kept, ...appended];
    });
  }, [discoveredPlayers]);

  useEffect(() => {
    playerOrderRef.current = playerOrder;
  }, [playerOrder]);

  const movePlayer = useCallback((fromIndex: number, toIndex: number) => {
    const current = playerOrderRef.current;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= current.length ||
      toIndex >= current.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    playerOrderRef.current = next;
    LayoutAnimation.configureNext({
      duration: 150,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setPlayerOrder(next);
  }, []);

  const stopDrag = useCallback(() => {
    Animated.spring(draggingTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 16,
      stiffness: 220,
    }).start(() => {
      setDraggingName(null);
      draggingNameRef.current = null;
      activeIndexRef.current = -1;
      consumedDyRef.current = 0;
      onDragStateChange?.(false);
    });
  }, [draggingTranslateY, onDragStateChange]);

  const maybeSwapRows = useCallback(
    (gestureDy: number) => {
      if (!draggingNameRef.current) return;
      const activeIndex = activeIndexRef.current;
      if (activeIndex < 0) return;

      let currentIndex = activeIndex;
      let localOffset = gestureDy - consumedDyRef.current;
      const current = playerOrderRef.current;

      while (localOffset > 0 && currentIndex < current.length - 1) {
        const nextName = current[currentIndex + 1];
        const nextHeight = rowHeightsRef.current.get(nextName) ?? DEFAULT_ROW_HEIGHT;
        if (localOffset < nextHeight * 0.5) break;
        movePlayer(currentIndex, currentIndex + 1);
        consumedDyRef.current += nextHeight;
        currentIndex += 1;
        activeIndexRef.current = currentIndex;
        localOffset = gestureDy - consumedDyRef.current;
      }

      while (localOffset < 0 && currentIndex > 0) {
        const prevName = current[currentIndex - 1];
        const prevHeight = rowHeightsRef.current.get(prevName) ?? DEFAULT_ROW_HEIGHT;
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

  // Mirrors DraggablePlayerList exactly — panHandlers applied to the row
  // only while that row is being dragged.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => draggingNameRef.current !== null,
        onMoveShouldSetPanResponderCapture: () => draggingNameRef.current !== null,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_event, gestureState) => {
          maybeSwapRows(gestureState.dy);
        },
        onPanResponderRelease: stopDrag,
        onPanResponderTerminate: stopDrag,
      }),
    [maybeSwapRows, stopDrag],
  );

  const beginDrag = useCallback(
    (playerName: string) => {
      const index = playerOrderRef.current.indexOf(playerName);
      if (index < 0) return;
      draggingNameRef.current = playerName;
      activeIndexRef.current = index;
      consumedDyRef.current = 0;
      draggingTranslateY.setValue(0);
      setDraggingName(playerName);
      onDragStateChange?.(true);
    },
    [draggingTranslateY, onDragStateChange],
  );

  if (!lineup) {
    return <Text style={styles.empty}>Generate a lineup to see inning assignments.</Text>;
  }

  const players = playerOrder.length > 0 ? playerOrder : discoveredPlayers;
  const isDragging = draggingName !== null;
  const isEditModal = presentation === "editModal";
  const inningCount = innings.length;

  let playerCellWidth: number;
  let inningCellWidth: number;
  if (isEditModal && containerWidth > 0 && inningCount > 0) {
    playerCellWidth = Math.floor(containerWidth * 0.22);
    inningCellWidth = Math.floor((containerWidth - playerCellWidth) / inningCount);
  } else {
    playerCellWidth = 118;
    inningCellWidth = editable ? 36 : 32;
  }

  return (
    <View
      style={[styles.lineupContainer, isEditModal && styles.lineupContainerModal]}
      onLayout={isEditModal ? (e) => setContainerWidth(e.nativeEvent.layout.width) : undefined}
    >
      {!isEditModal ? <Text style={styles.title}>Active players ({players.length})</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!isDragging && !isEditModal}
      >
        <View>
          <View style={[styles.row, styles.headerRow]}>
            <Text
              style={[
                styles.headerCell,
                styles.playerHeaderCell,
                {
                  width: playerCellWidth,
                  paddingLeft: isEditModal ? 8 : 4,
                  paddingRight: isEditModal ? 4 : 0,
                },
              ]}
            >
              Player
            </Text>
            {innings.map(({ inningNumber }) => (
              <Text
                key={`header-${inningNumber}`}
                style={[
                  styles.headerCell,
                  styles.inningCell,
                  { width: inningCellWidth },
                ]}
              >
                {inningNumber}
              </Text>
            ))}
          </View>

          {players.map((playerName, index) => {
            const isFemale = femalePlayerNames.has(normalizePlayerName(playerName));
            const isRowDragging = draggingName === playerName;
            const playerNumber = index + 1;
            const rowHasOpenCell = openCell?.playerName === playerName;

            return (
              <Animated.View
                key={`row-${playerName}`}
                style={[
                  styles.row,
                  isFemale && styles.femaleRow,
                  isRowDragging && styles.draggingRow,
                  rowHasOpenCell && { zIndex: 70 },
                  isRowDragging
                    ? { transform: [{ translateY: draggingTranslateY }] }
                    : null,
                ]}
                onLayout={(e) => {
                  rowHeightsRef.current.set(playerName, e.nativeEvent.layout.height);
                }}
                {...(isRowDragging ? panResponder.panHandlers : {})}
              >
                <Pressable
                  style={[
                    styles.playerCell,
                    {
                      width: playerCellWidth,
                      paddingLeft: isEditModal ? 8 : 4,
                      paddingRight: isEditModal ? 4 : 0,
                    },
                  ]}
                  onLongPress={() => beginDrag(playerName)}
                  delayLongPress={120}
                >
                  <View
                    style={[
                      styles.playerNumberBadge,
                      isEditModal && styles.playerNumberBadgeModal,
                    ]}
                  >
                    <Text style={styles.playerNumberText}>{playerNumber}</Text>
                  </View>
                  <Text style={styles.playerNameText} numberOfLines={1}>
                    {playerName}
                  </Text>
                </Pressable>

                {innings.map(({ inningNumber, cells, slotOrder }) => {
                  const value = cells.get(playerName) ?? EMPTY_MARKER;
                  const cellKey = `${playerName}:${inningNumber}`;
                  const isOpen =
                    !!openCell &&
                    openCell.playerName === playerName &&
                    openCell.inningNumber === inningNumber;
                  const options = [...slotOrder, BENCH_MARKER];

                  if (editable) {
                    return (
                      <View
                        key={`cell-${cellKey}`}
                        style={[
                          styles.editableCellWrap,
                          isOpen && styles.editableCellWrapOpen,
                          {
                            width: inningCellWidth,
                            minHeight: isEditModal ? 38 : 34,
                          },
                        ]}
                      >
                        <Pressable
                          style={[
                            styles.editableCell,
                            isOpen && styles.editableCellOpen,
                            value === BENCH_MARKER && styles.editableBenchCell,
                            {
                              minHeight: isEditModal ? 38 : 34,
                            },
                          ]}
                          onPress={() => {
                            setOpenCell((prev) =>
                              prev?.playerName === playerName &&
                              prev?.inningNumber === inningNumber
                                ? null
                                : { playerName, inningNumber },
                            );
                          }}
                        >
                          <Text
                            style={[
                              styles.editableCellText,
                              value === BENCH_MARKER
                                ? styles.benchCellText
                                : value === EMPTY_MARKER
                                  ? styles.emptyCellText
                                  : styles.positionCellText,
                            ]}
                            numberOfLines={1}
                          >
                            {value}
                          </Text>
                        </Pressable>
                        {isOpen ? (
                          <View style={styles.cellDropdown}>
                            <ScrollView
                              nestedScrollEnabled
                              style={styles.cellDropdownScroll}
                              showsVerticalScrollIndicator={options.length > 5}
                            >
                              {options.map((option) => {
                                const active = option === value;
                                return (
                                  <Pressable
                                    key={`option-${cellKey}-${option}`}
                                    style={[
                                      styles.cellDropdownOption,
                                      active && styles.cellDropdownOptionActive,
                                    ]}
                                    onPress={() => {
                                      onSetPlayerPosition?.(inningNumber, playerName, option);
                                      setOpenCell(null);
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.cellDropdownOptionText,
                                        active && styles.cellDropdownOptionTextActive,
                                      ]}
                                    >
                                      {option}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                    );
                  }

                  return (
                    <Text
                      key={`cell-${cellKey}`}
                      style={[
                        styles.inningCell,
                        { width: inningCellWidth },
                        value === BENCH_MARKER
                          ? styles.benchCellText
                          : value === EMPTY_MARKER
                            ? styles.emptyCellText
                            : styles.positionCellText,
                      ]}
                    >
                      {value}
                    </Text>
                  );
                })}
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
      {!isEditModal ? <Text style={styles.legend}>X = benched during that inning.</Text> : null}
    </View>
  );
};

export default memo(LineUp);

const styles = StyleSheet.create({
  lineupContainer: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 8,
    gap: 8,
    backgroundColor: palette.cardAlt,
  },
  lineupContainerModal: {
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  title: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 18,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    minHeight: 44,
    zIndex: 1,
    overflow: "visible",
  },
  femaleRow: {
    backgroundColor: "#c96f95",
  },
  draggingRow: {
    zIndex: 50,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    backgroundColor: palette.cardAlt,
  },
  headerRow: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  headerCell: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 14,
  },
  playerCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
  },
  playerHeaderCell: {
  },
  playerNumberBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  playerNumberBadgeModal: {
    minWidth: 24,
    height: 24,
  },
  playerNumberText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
  playerNameText: {
    flex: 1,
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 16,
  },
  inningCell: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 0,
  },
  editableCell: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  editableCellWrap: {
    position: "relative",
    zIndex: 2,
  },
  editableCellWrapOpen: {
    zIndex: 60,
  },
  editableCellOpen: {
    borderColor: "rgba(126,207,157,0.58)",
    backgroundColor: "rgba(126,207,157,0.14)",
  },
  editableBenchCell: {
    borderColor: "rgba(242,115,87,0.45)",
  },
  editableCellText: {
    fontFamily: typeface.heading,
    fontSize: 14,
    textAlign: "center",
  },
  cellDropdown: {
    position: "absolute",
    top: 36,
    left: 0,
    minWidth: 74,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    zIndex: 100,
  },
  cellDropdownScroll: {
    maxHeight: 130,
  },
  cellDropdownOption: {
    minHeight: 24,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  cellDropdownOptionActive: {
    backgroundColor: "rgba(126,207,157,0.14)",
  },
  cellDropdownOptionText: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 11,
    textAlign: "left",
  },
  cellDropdownOptionTextActive: {
    color: palette.success,
  },
  positionCellText: {
    color: palette.text,
  },
  emptyCellText: {
    color: "rgba(201,192,171,0.8)",
  },
  benchCellText: {
    color: palette.danger,
    fontFamily: typeface.heading,
  },
  legend: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 14,
  },
  empty: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 13,
  },
});
