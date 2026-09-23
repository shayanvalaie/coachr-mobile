import { ActivityIndicator, StyleSheet, View } from "react-native";
import { theme } from "../../theme/colors";
import { radius as radiusScale, shadow, space } from "../../theme/tokens";
import { AppText, Skeleton } from "../ui";

// Row height mirrors LineupGrid's rows so swapping the skeleton for the real
// grid doesn't shift the surrounding layout.
const ROW_HEIGHT = 40;
const NAME_BAR_WIDTH = 110;
const MIN_ROWS = 6;
const MAX_ROWS = 12;
const STAGGER_MS = 60;

type Props = {
  // Roughly the number of active players, so the placeholder stands in for
  // the grid it's replacing. Clamped to a sensible range.
  rows?: number;
  innings?: number;
  // Spinner + copy above the rows while the engine works.
  message?: string;
};

// Table-shaped placeholder shown while a lineup is generating: one name bar
// and one cell per inning for each player, pulsing in sequence.
export const LineupGridSkeleton = ({ rows = 10, innings = 7, message }: Props) => {
  const rowCount = Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows));
  const cellCount = Math.max(1, innings);

  return (
    <View style={styles.container}>
      {message ? (
        <View style={styles.messageRow}>
          <ActivityIndicator size="small" color={theme.accent.base} />
          <AppText variant="body" color="secondary" style={styles.messageText}>
            {message}
          </AppText>
        </View>
      ) : null}
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          <Skeleton
            width={NAME_BAR_WIDTH}
            height={14}
            delay={rowIndex * STAGGER_MS}
          />
          <View style={styles.cells}>
            {Array.from({ length: cellCount }, (_, cellIndex) => (
              <Skeleton
                key={cellIndex}
                height={14}
                radius={radiusScale.sm / 2}
                delay={rowIndex * STAGGER_MS}
                style={styles.cell}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  // Solid raised surface: it also has to cover the grid mounting beneath it
  // during the reveal hand-off.
  container: {
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radiusScale.lg,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    ...shadow.card,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
    paddingBottom: space.sm,
  },
  messageText: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: ROW_HEIGHT,
  },
  cells: {
    flex: 1,
    flexDirection: "row",
    gap: space.xs,
  },
  cell: {
    flex: 1,
  },
});

export default LineupGridSkeleton;
