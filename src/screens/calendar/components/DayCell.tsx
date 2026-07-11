import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { AppPressable, AppText } from "../../../components/ui";
import { theme } from "../../../theme/colors";
import { radius } from "../../../theme/tokens";
import { dayKeyToMonthDayLabel, MonthCell } from "../../../utils/calendarDates";

type Props = {
  cell: MonthCell;
  gameCount: number;
  isToday: boolean;
  isSelected: boolean;
  onPress: (dayKey: string) => void;
};

// One day in the month grid. A single accent dot marks days that have games;
// the exact count is carried in the accessibility label.
const DayCell = ({ cell, gameCount, isToday, isSelected, onPress }: Props) => {
  const countLabel =
    gameCount > 0 ? `, ${gameCount} ${gameCount === 1 ? "game" : "games"}` : "";

  return (
    <AppPressable
      onPress={() => onPress(cell.dayKey)}
      accessibilityRole="button"
      accessibilityLabel={`${dayKeyToMonthDayLabel(cell.dayKey)}${countLabel}`}
      accessibilityState={{ selected: isSelected }}
      style={[
        styles.cell,
        !cell.inMonth && styles.cellOutside,
        isToday && styles.cellToday,
        isSelected && styles.cellSelected,
      ]}
    >
      <AppText
        variant="caption"
        family={isSelected ? "heading" : "body"}
        color={cell.inMonth ? "primary" : "secondary"}
      >
        {cell.day}
      </AppText>
      {gameCount > 0 ? <View style={styles.gameDot} /> : null}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  cell: {
    width: "14.2857%",
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  cellOutside: {
    opacity: 0.5,
  },
  cellToday: {
    borderColor: theme.border.strong,
  },
  cellSelected: {
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
  },
  gameDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.accent.base,
  },
});

export default memo(DayCell);
