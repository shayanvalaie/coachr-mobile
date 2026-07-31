import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import type Animated from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import Sortable, {
  type SortableGridDragEndParams,
  type SortableGridRenderItem,
} from "react-native-sortables";
import { theme, withAlpha } from "../../theme/colors";
import { radius } from "../../theme/tokens";
import { typeface } from "../../theme/typography";
import { InningAssignment } from "../../types/lineup";
import { normalizePlayerName } from "../../utils/playerNames";
import { AppText, Skeleton } from "../ui";

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
  // Vertical scroller hosting this grid; when provided, Sortable auto-scrolls
  // it as a dragged row nears the viewport edge.
  scrollableRef?: AnimatedRef<Animated.ScrollView>;
};

const BENCH_MARKER = "X";
const EMPTY_MARKER = "-";
const DEFAULT_ROW_HEIGHT = 44;
// Vertical offset from a cell's row top to where its dropdown opens —
// just under the cell, mirroring the old inline `top: 36` placement.
const DROPDOWN_ROW_OFFSET = 36;
// Metrics used to estimate the dropdown's rendered height so it can flip above
// the cell when opening below would overflow the table. Keep these in sync with
// the `cellDropdownOption` minHeight, `cellDropdownScroll` maxHeight, and
// `cellDropdown` paddingVertical styles below.
const DROPDOWN_OPTION_HEIGHT = 24;
const DROPDOWN_MAX_SCROLL_HEIGHT = 130;
const DROPDOWN_VERTICAL_PADDING = 8;

// Off-palette rose used to tint grid rows for female players. Kept as a local
// constant (not a semantic token): the tint is unique to the lineup grid
// and must stay visually distinct from both accent (amber) and danger (red).
// Semi-transparent so the tint stays subtle and the cell markers (incl. the
// red X's) remain legible over it.
const FEMALE_ROW_TINT = "rgba(201, 111, 149, 0.45)";

const LineupGrid = ({
  lineup,
  editable = false,
  presentation = "inline",
  onSetPlayerPosition,
  playerGenderByName,
  scrollableRef,
}: Props) => {
  const [openCell, setOpenCell] = useState<{
    inningNumber: number;
    playerName: string;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // Measured table metrics that anchor the dropdown overlay. Rows are
  // uniform height, so one row's measurement covers all of them.
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_ROW_HEIGHT);
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  // In the landscape editor the cell widths are derived from the measured
  // container width, so the real grid can't be laid out until that first
  // layout pass lands. Show a full-width skeleton until then (and briefly
  // after, so it reads as an intentional load rather than a flash). This keeps
  // the card the same size the whole time instead of rendering the narrow
  // fallback grid first and expanding to full width once measured.
  const isEditModal = presentation === "editModal";
  const [gridReady, setGridReady] = useState(!isEditModal);

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

  // Reveal the real grid once the container has been measured, holding the
  // skeleton a beat longer so it doesn't flash and the sortable grid has a
  // moment to lay out at the final width before it swaps in.
  useEffect(() => {
    if (!isEditModal || gridReady || containerWidth <= 0) return;
    const timer = setTimeout(() => setGridReady(true), 150);
    return () => clearTimeout(timer);
  }, [isEditModal, gridReady, containerWidth]);

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

  const players = useMemo(
    () => (playerOrder.length > 0 ? playerOrder : discoveredPlayers),
    [playerOrder, discoveredPlayers],
  );

  const handleDragStart = useCallback(() => {
    // A row picked up under an open dropdown would leave the dropdown
    // anchored to a stale position — close it.
    setOpenCell(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const handleOrderChange = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleDragEnd = useCallback(
    ({ data }: SortableGridDragEndParams<string>) => {
      setPlayerOrder(data);
    },
    [],
  );

  const handleHeaderLayout = useCallback((height: number) => {
    setHeaderHeight((prev) => (Math.abs(prev - height) > 0.5 ? height : prev));
  }, []);

  const handleRowLayout = useCallback((height: number) => {
    setRowHeight((prev) => (Math.abs(prev - height) > 0.5 ? height : prev));
  }, []);

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

  const renderItem = useCallback<SortableGridRenderItem<string>>(
    ({ item: playerName, index }) => {
      const isFemale = femalePlayerNames.has(normalizePlayerName(playerName));
      const playerNumber = index + 1;

      return (
        <View
          style={[styles.row, isFemale && styles.femaleRow]}
          onLayout={(e) => handleRowLayout(e.nativeEvent.layout.height)}
        >
          {/* Drag handle: press and hold the player name to reorder rows.
              Scoped to the name cell so inning cells stay free for taps. */}
          <Sortable.Handle
            style={[
              styles.playerCell,
              {
                width: playerCellWidth,
                paddingLeft: isEditModal ? 8 : 4,
                paddingRight: isEditModal ? 4 : 0,
              },
            ]}
          >
            <View
              style={styles.playerCellInner}
              accessibilityRole="button"
              accessibilityLabel={`${playerName}, batting position ${playerNumber}. Press and hold to reorder.`}
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
            </View>
          </Sortable.Handle>

          {innings.map(({ inningNumber, cells }) => {
            const value = cells.get(playerName) ?? EMPTY_MARKER;
            const cellKey = `${playerName}:${inningNumber}`;
            const isOpen =
              !!openCell &&
              openCell.playerName === playerName &&
              openCell.inningNumber === inningNumber;

            if (editable) {
              return (
                <View
                  key={`cell-${cellKey}`}
                  style={[
                    styles.editableCellWrap,
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
                    accessibilityRole="button"
                    accessibilityLabel={`Inning ${inningNumber}, ${playerName}, ${value === EMPTY_MARKER ? "unassigned" : value === BENCH_MARKER ? "bench" : value}`}
                    accessibilityState={{ expanded: isOpen }}
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
        </View>
      );
    },
    [
      femalePlayerNames,
      innings,
      openCell,
      editable,
      isEditModal,
      playerCellWidth,
      inningCellWidth,
      handleRowLayout,
    ],
  );

  if (!lineup) {
    return (
      <AppText variant="body" color="secondary">
        Generate a lineup to see inning assignments.
      </AppText>
    );
  }

  // Dropdown overlay anchor. The dropdown must live OUTSIDE the sortable rows:
  // sortable items are absolutely-positioned siblings, so a dropdown inside a
  // row would paint underneath the rows after it. Rendered as the last child
  // of the table content instead, its position derived from the fixed cell
  // widths and measured row height.
  const openInningIndex = openCell
    ? innings.findIndex((i) => i.inningNumber === openCell.inningNumber)
    : -1;
  const openRowIndex = openCell ? players.indexOf(openCell.playerName) : -1;
  const openInning = openInningIndex >= 0 ? innings[openInningIndex] : null;
  const dropdownVisible =
    !!openCell && !!openInning && openRowIndex >= 0 && editable;
  const dropdownOptions = openInning
    ? [...openInning.slotOrder, BENCH_MARKER]
    : [];
  const openValue =
    openCell && openInning
      ? (openInning.cells.get(openCell.playerName) ?? EMPTY_MARKER)
      : EMPTY_MARKER;

  // The dropdown opens below its cell by default, but for rows near the bottom
  // of the grid that overflows past the table content (which the edit overlay
  // clips and can't scroll to). Estimate the dropdown height and flip it above
  // the cell whenever opening below would run past the content bottom.
  const dropdownHeight =
    Math.min(
      dropdownOptions.length * DROPDOWN_OPTION_HEIGHT,
      DROPDOWN_MAX_SCROLL_HEIGHT,
    ) + DROPDOWN_VERTICAL_PADDING;
  const cellRowTop = headerHeight + openRowIndex * rowHeight;
  const contentHeight = headerHeight + players.length * rowHeight;
  const dropdownBelowTop = cellRowTop + DROPDOWN_ROW_OFFSET;
  const flipDropdownUp = dropdownBelowTop + dropdownHeight > contentHeight;
  const dropdownTop = flipDropdownUp
    ? Math.max(cellRowTop + rowHeight - DROPDOWN_ROW_OFFSET - dropdownHeight, 0)
    : dropdownBelowTop;

  return (
    <View
      style={[styles.lineupContainer, isEditModal && styles.lineupContainerModal]}
      onLayout={isEditModal ? (e) => setContainerWidth(e.nativeEvent.layout.width) : undefined}
    >
      {!isEditModal ? (
        <AppText variant="title" family="heading" style={styles.title}>
          Active players ({players.length})
        </AppText>
      ) : null}
      {isEditModal && !gridReady ? (
        <EditGridSkeleton
          rowCount={players.length}
          inningCount={inningCount}
        />
      ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!isEditModal}
      >
        <View>
          <View
            style={[styles.row, styles.headerRow]}
            onLayout={(e) => handleHeaderLayout(e.nativeEvent.layout.height)}
          >
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

          <Sortable.Grid
            data={players}
            renderItem={renderItem}
            keyExtractor={(name) => name}
            columns={1}
            customHandle
            activeItemScale={1.02}
            activeItemShadowOpacity={0.15}
            inactiveItemOpacity={1}
            onDragStart={handleDragStart}
            onOrderChange={handleOrderChange}
            onDragEnd={handleDragEnd}
            {...(scrollableRef ? { scrollableRef } : {})}
          />

          {dropdownVisible ? (
            <View
              style={[
                styles.cellDropdown,
                {
                  left: playerCellWidth + openInningIndex * inningCellWidth,
                  top: dropdownTop,
                },
              ]}
            >
              <ScrollView
                nestedScrollEnabled
                style={styles.cellDropdownScroll}
                showsVerticalScrollIndicator={dropdownOptions.length > 5}
              >
                {dropdownOptions.map((option) => {
                  const active = option === openValue;
                  return (
                    <Pressable
                      key={`option-${option}`}
                      style={[
                        styles.cellDropdownOption,
                        active && styles.cellDropdownOptionActive,
                      ]}
                      onPress={() => {
                        if (openCell) {
                          onSetPlayerPosition?.(
                            openCell.inningNumber,
                            openCell.playerName,
                            option,
                          );
                        }
                        setOpenCell(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={option === BENCH_MARKER ? "Bench" : option}
                      accessibilityState={{ selected: active }}
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
      </ScrollView>
      )}
      {!isEditModal ? (
        <AppText variant="body" color="secondary">
          X = benched during that inning.
        </AppText>
      ) : null}
    </View>
  );
};

// Full-width placeholder table shown while the landscape editor measures its
// container and the sortable grid settles. Mirrors the real grid's row count,
// heights, and column proportions (22% player column, evenly-split innings) so
// the swap to real content happens at exactly the same size.
const EditGridSkeleton = ({
  rowCount,
  inningCount,
}: {
  rowCount: number;
  inningCount: number;
}) => {
  const rows = Math.max(rowCount, 1);
  const columns = Math.max(inningCount, 1);
  return (
    <View style={styles.skeletonRoot}>
      <View style={[styles.row, styles.headerRow]}>
        <View style={styles.skeletonPlayerCell}>
          <Skeleton width={52} height={12} />
        </View>
        <View style={styles.skeletonInnings}>
          {Array.from({ length: columns }, (_, i) => (
            <View key={`sk-h-${i}`} style={styles.skeletonInningCell}>
              <Skeleton width={14} height={12} />
            </View>
          ))}
        </View>
      </View>
      {Array.from({ length: rows }, (_, r) => (
        <View key={`sk-r-${r}`} style={styles.row}>
          <View style={styles.skeletonPlayerCell}>
            <Skeleton width={24} height={24} radius={radius.pill} />
            <Skeleton width="58%" height={12} style={styles.skeletonName} />
          </View>
          <View style={styles.skeletonInnings}>
            {Array.from({ length: columns }, (_, i) => (
              <View key={`sk-c-${r}-${i}`} style={styles.skeletonInningCell}>
                <Skeleton width={28} height={30} radius={radius.sm} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

export default memo(LineupGrid);

const styles = StyleSheet.create({
  lineupContainer: {
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: 14,
    padding: 8,
    gap: 8,
    backgroundColor: theme.bg.elevated,
  },
  lineupContainerModal: {
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  title: {
    marginBottom: 2,
  },
  skeletonRoot: {
    alignSelf: "stretch",
  },
  skeletonPlayerCell: {
    width: "22%",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 4,
  },
  skeletonName: {
    marginLeft: 6,
  },
  skeletonInnings: {
    flex: 1,
    flexDirection: "row",
  },
  skeletonInningCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    minHeight: 44,
    overflow: "visible",
  },
  femaleRow: {
    backgroundColor: FEMALE_ROW_TINT,
  },
  headerRow: {
    backgroundColor: withAlpha(theme.text.primary, 0.04),
  },
  headerCell: {
    color: theme.text.secondary,
    fontFamily: typeface.heading,
    fontSize: 14,
  },
  playerCell: {
    minHeight: 44,
    justifyContent: "center",
  },
  playerCellInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  playerHeaderCell: {
  },
  playerNumberBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(theme.text.primary, 0.16),
    borderWidth: 1,
    borderColor: withAlpha(theme.text.primary, 0.12),
  },
  playerNumberBadgeModal: {
    minWidth: 24,
    height: 24,
  },
  playerNumberText: {
    color: theme.text.primary,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
  playerNameText: {
    flex: 1,
    color: theme.text.primary,
    fontFamily: typeface.heading,
    fontSize: 16,
  },
  inningCell: {
    color: theme.text.primary,
    fontFamily: typeface.heading,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 0,
  },
  editableCell: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: withAlpha(theme.text.primary, 0.12),
    backgroundColor: withAlpha(theme.text.primary, 0.03),
    alignItems: "center",
    justifyContent: "center",
  },
  editableCellWrap: {
    position: "relative",
  },
  editableCellOpen: {
    borderColor: withAlpha(theme.success.base, 0.58),
    backgroundColor: theme.success.subtle,
  },
  editableBenchCell: {
    borderColor: withAlpha(theme.danger.base, 0.45),
  },
  editableCellText: {
    fontFamily: typeface.heading,
    fontSize: 14,
    textAlign: "center",
  },
  cellDropdown: {
    position: "absolute",
    minWidth: 74,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.base,
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
    backgroundColor: theme.success.subtle,
  },
  cellDropdownOptionText: {
    color: theme.text.secondary,
    fontFamily: typeface.heading,
    fontSize: 11,
    textAlign: "left",
  },
  cellDropdownOptionTextActive: {
    color: theme.success.base,
  },
  positionCellText: {
    color: theme.text.primary,
  },
  emptyCellText: {
    color: withAlpha(theme.text.secondary, 0.8),
  },
  benchCellText: {
    color: theme.danger.base,
    fontFamily: typeface.heading,
  },
});
