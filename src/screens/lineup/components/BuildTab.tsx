import { RefObject } from "react";
import { StyleSheet, View } from "react-native";
import GameSetup from "../../../components/GameSetup";
import { AppText, Card, MetricTile } from "../../../components/ui";
import { BackendGame } from "../../../lib/backend/types";
import { space } from "../../../theme/tokens";
import { InningAssignment, Player } from "../../../types/lineup";
import { TeamRulesConfig } from "../../../types/rules";
import GameContextCard from "./GameContextCard";

type Props = {
  activeCount: number;
  rosterCount: number;
  rulesConfig: TeamRulesConfig | null;
  hasProSubscription: boolean;
  games: BackendGame[];
  selectedGame: BackendGame | null;
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
  lineup: InningAssignment[] | null;
  lineupInlineEditMode: boolean;
  expandedInnings: Set<number>;
  gameSetupCollapsed: boolean;
  isGenerating: boolean;
  status: string;
  error: string | null;
  onToggleCollapse: () => void;
  onEditSelection: () => void;
  onEditLineup: () => void;
  onSelectAll: () => void;
  onGenerate: () => void;
  onSaveLineup: () => void;
  onToggleInning: (inning: number) => void;
  onSetLineupCell: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  playerGenderByName?: Record<string, Player["gender"]>;
  onLineupDragStateChange?: (isDragging: boolean) => void;
  lineupAnchorRef?: RefObject<View | null>;
};

// Build tab: rules snapshot, game context (Pro), and the generation engine.
const BuildTab = ({
  activeCount,
  rosterCount,
  rulesConfig,
  hasProSubscription,
  games,
  selectedGame,
  selectedGameId,
  onSelectGame,
  lineup,
  lineupInlineEditMode,
  expandedInnings,
  gameSetupCollapsed,
  isGenerating,
  status,
  error,
  onToggleCollapse,
  onEditSelection,
  onEditLineup,
  onSelectAll,
  onGenerate,
  onSaveLineup,
  onToggleInning,
  onSetLineupCell,
  playerGenderByName,
  onLineupDragStateChange,
  lineupAnchorRef,
}: Props) => (
  <>
    <Card variant="elevated" padding="sm">
      <View style={styles.heroInner}>
        <AppText variant="caption" color="secondary">
          Active {activeCount} / {rosterCount} players
        </AppText>
        <View style={styles.metricsRow}>
          <MetricTile small label="Sport" value={rulesConfig?.sport ?? "-"} />
          <MetricTile
            small
            label="Innings"
            value={
              rulesConfig
                ? `${rulesConfig.segmentCount} ${rulesConfig.segmentLabel}`
                : "-"
            }
          />
          <MetricTile
            small
            label="On Field"
            value={rulesConfig ? String(rulesConfig.playersOnField) : "-"}
          />
        </View>
      </View>
    </Card>

    {hasProSubscription && (
      <GameContextCard
        games={games}
        selectedGame={selectedGame}
        selectedGameId={selectedGameId}
        onSelectGame={onSelectGame}
      />
    )}

    <GameSetup
      activePlayersCount={activeCount}
      segmentCount={rulesConfig?.segmentCount ?? 7}
      lineup={lineup}
      canEditLineup={!!lineup}
      isInlineEditing={lineupInlineEditMode}
      expandedInnings={expandedInnings}
      collapsed={gameSetupCollapsed}
      isGenerating={isGenerating}
      status={status}
      error={error}
      onToggleCollapse={onToggleCollapse}
      onEditSelection={onEditSelection}
      onEditLineup={onEditLineup}
      onSelectAll={onSelectAll}
      onGenerate={onGenerate}
      onSaveLineup={onSaveLineup}
      onToggleInning={onToggleInning}
      onSetLineupCell={onSetLineupCell}
      playerGenderByName={playerGenderByName}
      onLineupDragStateChange={onLineupDragStateChange}
      lineupAnchorRef={lineupAnchorRef}
    />
  </>
);

const styles = StyleSheet.create({
  heroInner: {
    gap: space.xs,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
});

export default BuildTab;
