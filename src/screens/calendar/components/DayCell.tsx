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

// One day in the month grid. A green dot marks days with games; the exact
// count is carried in the accessibility label.
const DayCell = ({ cell, gameCount, isToday, isSelected, onPress }: Props) => {
  const hasGame = gameCount > 0;
  const countLabel = hasGame
    ? `, ${gameCount} ${gameCount === 1 ? "game" : "games"}`
    : "";

  return (
    <AppPressable
      onPress={() => onPress(cell.dayKey)}
      pressScale={0.96}
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
        family={hasGame || isSelected ? "display" : "body"}
        color={isSelected ? "accent" : cell.inMonth ? "primary" : "secondary"}
        style={styles.number}
      >
        {cell.day}
      </AppText>
      {hasGame ? (
        <View
          style={[
            styles.gameDot,
            { backgroundColor: isSelected ? theme.accent.base : theme.success.base },
          ]}
        />
      ) : null}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  cell: {
    width: "14.2857%",
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  cellOutside: {
    opacity: 0.35,
  },
  cellToday: {
    backgroundColor: theme.bg.raised,
    borderColor: theme.border.base,
  },
  cellSelected: {
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
  },
  number: {
    fontSize: 14,
    lineHeight: 18,
  },
  gameDot: {
    position: "absolute",
    bottom: 5,
    width: 5,
    height: 5,
    borderRadius: radius.pill,
  },
});

export default memo(DayCell);
