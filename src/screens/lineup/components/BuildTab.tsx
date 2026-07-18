import { RefObject } from "react";
import { StyleSheet, View } from "react-native";
import type Reanimated from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import GameSetup from "../../../components/GameSetup";
import {
  AppText,
  Card,
  LoadTransition,
  MetricTile,
  Skeleton,
  SkeletonMetricRow,
} from "../../../components/ui";
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
  onGenerate: () => void;
  onSaveLineup: () => void;
  onToggleInning: (inning: number) => void;
  onSetLineupCell: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  playerGenderByName?: Record<string, Player["gender"]>;
  lineupScrollableRef?: AnimatedRef<Reanimated.ScrollView>;
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
  onGenerate,
  onSaveLineup,
  onToggleInning,
  onSetLineupCell,
  playerGenderByName,
  lineupScrollableRef,
  lineupAnchorRef,
}: Props) => (
  <>
    <Card variant="elevated" padding="sm">
      <LoadTransition
        loading={!rulesConfig}
        style={styles.heroInner}
        skeleton={
          <>
            <Skeleton width={150} height={15} />
            <SkeletonMetricRow count={3} height={67} />
          </>
        }
      >
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
      </LoadTransition>
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
      onGenerate={onGenerate}
      onSaveLineup={onSaveLineup}
      onToggleInning={onToggleInning}
      onSetLineupCell={onSetLineupCell}
      playerGenderByName={playerGenderByName}
      lineupScrollableRef={lineupScrollableRef}
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
