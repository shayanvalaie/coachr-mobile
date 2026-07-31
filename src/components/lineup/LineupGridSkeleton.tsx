import { StyleSheet, View } from "react-native";
import { theme } from "../../theme/colors";
import { radius as radiusScale } from "../../theme/tokens";
import { Skeleton } from "../ui";

// Row height mirrors LineupGrid's rows closely so swapping the skeleton for the
// real grid doesn't shift the surrounding layout.
const ROW_HEIGHT = 40;
const MIN_ROWS = 6;
const MAX_ROWS = 12;

type Props = {
  // Roughly the number of active players, so the placeholder stands in for the
  // grid it's replacing. Clamped to a sensible range.
  rows?: number;
};

// Table-shaped placeholder shown while a lineup is generating. Mirrors the
// LineupGrid card (bordered container, title, header row, one bar per player)
// so it can cross-fade into the finished grid with no layout jump.
export const LineupGridSkeleton = ({ rows = 10 }: Props) => {
  const rowCount = Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows));

  return (
    <View style={styles.container}>
      <Skeleton width={150} height={16} style={styles.title} />
      <Skeleton height={ROW_HEIGHT} radius={radiusScale.sm} />
      {Array.from({ length: rowCount }, (_, i) => (
        <Skeleton key={i} height={ROW_HEIGHT} radius={radiusScale.sm} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  // Matches LineupGrid's `lineupContainer` so the skeleton reads as the same
  // card and stays opaque enough to cover the grid mounting underneath it.
  container: {
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: 14,
    padding: 8,
    gap: 8,
    backgroundColor: theme.bg.raised,
  },
  title: {
    marginBottom: 2,
  },
});

export default LineupGridSkeleton;
