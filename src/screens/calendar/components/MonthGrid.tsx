import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { BackendGame } from "../../../lib/backend/types";
import { AppText } from "../../../components/ui";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import { buildMonthCells, WEEKDAY_NAMES } from "../../../utils/calendarDates";
import DayCell from "./DayCell";

type Props = {
  year: number;
  monthIndex: number;
  gamesByDay: Map<string, BackendGame[]>;
  todayKey: string;
  selectedDateKey: string;
  onPressDay: (dayKey: string) => void;
};

// The month grid: weekday header row plus day cells with game indicators.
const MonthGrid = ({
  year,
  monthIndex,
  gamesByDay,
  todayKey,
  selectedDateKey,
  onPressDay,
}: Props) => {
  const cells = useMemo(() => buildMonthCells(year, monthIndex), [monthIndex, year]);

  return (
    <View style={styles.monthCard}>
      <View style={styles.weekdaysRow}>
        {WEEKDAY_NAMES.map((weekday, weekdayIndex) => (
          <AppText
            key={`${year}-${monthIndex}-${weekdayIndex}-${weekday}`}
            variant="caption"
            family="heading"
            color="secondary"
            style={styles.weekdayLabel}
          >
            {weekday}
          </AppText>
        ))}
      </View>
      <View style={styles.daysGrid}>
        {cells.map((cell) => (
          <DayCell
            key={`${year}-${monthIndex}-${cell.dayKey}`}
            cell={cell}
            gameCount={gamesByDay.get(cell.dayKey)?.length ?? 0}
            isToday={cell.dayKey === todayKey}
            isSelected={cell.dayKey === selectedDateKey}
            onPress={onPressDay}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  monthCard: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.elevated,
    padding: space.xs,
    gap: space.xs,
  },
  weekdaysRow: {
    flexDirection: "row",
  },
  weekdayLabel: {
    width: "14.2857%",
    textAlign: "center",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 2,
  },
});

export default MonthGrid;
