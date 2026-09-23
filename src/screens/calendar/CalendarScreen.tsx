import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BackendGame, BackendSession } from "../../lib/backend/types";
import { IconButton, PageHeader, ScreenContainer } from "../../components/ui";
import { space } from "../../theme/tokens";
import { LineupLaunchRequestInput } from "../../types/lineupLaunch";
import {
  dayKeyToMonthDate,
  MONTH_NAMES,
  shiftDayKeyByMonths,
  toDayKeyFromDate,
} from "../../utils/calendarDates";
import DayAgenda from "./components/DayAgenda";
import GameFormSheet from "./components/GameFormSheet";
import LineupsSheet from "./components/LineupsSheet";
import MonthGrid from "./components/MonthGrid";
import { useCalendarData } from "./hooks/useCalendarData";
import { useGameForm } from "./hooks/useGameForm";
import { useLineupCarousel } from "./hooks/useLineupCarousel";

type Props = {
  session: BackendSession;
  onOpenLineupPage: (request: LineupLaunchRequestInput) => void;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
};

const dayKeyToAgendaLabel = (dayKey: string) => {
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

// Calendar workspace orchestrator: owns the selected day (which also drives
// the month shown) and wires the data/form/carousel hooks into the grid,
// agenda, and sheets.
const CalendarScreen = ({
  session,
  onOpenLineupPage,
  hasProSubscription,
  onRequirePro,
}: Props) => {
  const initialTodayKey = toDayKeyFromDate(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(initialTodayKey);

  const {
    ensureTeam,
    gamesByDay,
    lineupsByGameId,
    playerGenderByName,
    isLoading,
    loadGames,
  } = useCalendarData({ session });

  const gameForm = useGameForm({
    ensureTeam,
    loadGames,
    selectedDateKey,
    setSelectedDateKey,
    onSaved: () => {},
  });

  const carousel = useLineupCarousel({ ensureTeam, loadGames, lineupsByGameId });

  const selectedGames = useMemo(
    () => gamesByDay.get(selectedDateKey) ?? [],
    [gamesByDay, selectedDateKey],
  );

  const calendarMonthDate = useMemo(
    () => dayKeyToMonthDate(selectedDateKey),
    [selectedDateKey],
  );
  const calendarYear = calendarMonthDate.getFullYear();
  const calendarMonthIndex = calendarMonthDate.getMonth();
  const monthTitle =
    calendarYear === new Date().getFullYear()
      ? MONTH_NAMES[calendarMonthIndex]
      : `${MONTH_NAMES[calendarMonthIndex]} ${calendarYear}`;

  const moveMonth = useCallback((offset: number) => {
    setSelectedDateKey((prevDayKey) => shiftDayKeyByMonths(prevDayKey, offset));
  }, []);

  const openLineupWorkspace = useCallback(
    (request: LineupLaunchRequestInput) => {
      if (!hasProSubscription && request.gameId) {
        onRequirePro("Per-game lineup generation");
        return;
      }
      carousel.close();
      onOpenLineupPage(request);
    },
    [carousel, hasProSubscription, onOpenLineupPage, onRequirePro],
  );

  const handleOpenLineups = useCallback(
    (game: BackendGame) => {
      const savedLineups = game.id ? lineupsByGameId.get(game.id) ?? [] : [];
      if (savedLineups.length === 0) {
        openLineupWorkspace({ gameId: game.id ?? null, autoGenerate: true });
        return;
      }
      void carousel.openForGame(game);
    },
    [carousel, lineupsByGameId, openLineupWorkspace],
  );

  const handleExport = useCallback(
    (lineupId: string, format: "xlsx" | "pdf") => {
      if (!hasProSubscription) {
        onRequirePro("Lineup exports");
        return;
      }
      void carousel.exportLineupVersion(lineupId, format);
    },
    [carousel, hasProSubscription, onRequirePro],
  );

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <PageHeader
        eyebrow="Calendar"
        title={monthTitle}
        right={
          <View style={styles.monthNav}>
            <IconButton
              icon="chevron-left"
              size={36}
              onPress={() => moveMonth(-1)}
              accessibilityLabel="Previous month"
            />
            <IconButton
              icon="chevron-right"
              size={36}
              onPress={() => moveMonth(1)}
              accessibilityLabel="Next month"
            />
          </View>
        }
      />

      <MonthGrid
        year={calendarYear}
        monthIndex={calendarMonthIndex}
        gamesByDay={gamesByDay}
        todayKey={initialTodayKey}
        selectedDateKey={selectedDateKey}
        onPressDay={setSelectedDateKey}
      />

      <DayAgenda
        dayLabel={dayKeyToAgendaLabel(selectedDateKey)}
        games={selectedGames}
        lineupsByGameId={lineupsByGameId}
        isLoading={isLoading}
        onAddGame={() => gameForm.openCreateForDate(selectedDateKey)}
        onOpenLineups={handleOpenLineups}
        onEditGame={gameForm.startEditingGame}
        onDeleteGame={gameForm.deleteGame}
      />

      <LineupsSheet
        visible={carousel.isOpen}
        onClose={carousel.close}
        title={carousel.modalTitle}
        gameId={carousel.modalGameId}
        lineups={carousel.lineups}
        carouselIndex={carousel.carouselIndex}
        onCarouselIndexChange={carousel.setCarouselIndex}
        detailsById={carousel.detailsById}
        isDetailsLoading={carousel.isDetailsLoading}
        detailsError={carousel.detailsError}
        activeLineupId={carousel.activeLineupId}
        editingLineupId={carousel.editingLineupId}
        draftRowsByLineupId={carousel.draftRowsByLineupId}
        playerGenderByName={playerGenderByName}
        onToggleEditing={carousel.toggleEditing}
        onApplyCellEdit={carousel.applyCellEdit}
        onSaveEdited={(lineupVersion) => void carousel.saveEditedLineupVersion(lineupVersion)}
        onExport={handleExport}
        onGenerateInLineupPage={(gameId) =>
          openLineupWorkspace({ gameId, autoGenerate: true })
        }
      />

      <GameFormSheet
        visible={gameForm.isFormOpen}
        onClose={gameForm.closeForm}
        form={gameForm.form}
        setForm={gameForm.setForm}
        selectedDateKey={selectedDateKey}
        isSaving={gameForm.isSaving}
        error={gameForm.formError}
        onSave={() => void gameForm.saveGame()}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.md,
  },
  monthNav: {
    flexDirection: "row",
    gap: space.xs,
  },
});

export default CalendarScreen;
