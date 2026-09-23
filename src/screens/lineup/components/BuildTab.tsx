import type { RefObject } from "react";
import { StyleSheet, View } from "react-native";
import type Reanimated from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import GameSetup from "../../../components/GameSetup";
import {
  AppPressable,
  AppText,
  Card,
  LoadTransition,
  Skeleton,
} from "../../../components/ui";
import { BackendGame } from "../../../lib/backend/types";
import { radius, space } from "../../../theme/tokens";
import { InningAssignment, Player } from "../../../types/lineup";
import { TeamRulesConfig } from "../../../types/rules";
import GameContextCard from "./GameContextCard";

type Props = {
  activeCount: number;
  rosterCount: number;
  rulesConfig: TeamRulesConfig | null;
  hasProSubscription: boolean;
  games: BackendGame[];
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
  lineup: InningAssignment[] | null;
  isGenerating: boolean;
  error: string | null;
  onEditSelection: () => void;
  onEditLineup: () => void;
  onGenerate: () => void;
  onSaveLineup: () => void;
  onSetLineupCell: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  playerGenderByName?: Record<string, Player["gender"]>;
  lineupScrollableRef?: AnimatedRef<Reanimated.ScrollView>;
  lineupAnchorRef?: RefObject<View | null>;
};

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

// Generate tab: game chips (Pro), a one-line context row, and the engine.
const BuildTab = ({
  activeCount,
  rosterCount,
  rulesConfig,
  hasProSubscription,
  games,
  selectedGameId,
  onSelectGame,
  lineup,
  isGenerating,
  error,
  onEditSelection,
  onEditLineup,
  onGenerate,
  onSaveLineup,
  onSetLineupCell,
  playerGenderByName,
  lineupScrollableRef,
  lineupAnchorRef,
}: Props) => (
  <>
    {hasProSubscription && games.length > 0 ? (
      <GameContextCard
        games={games}
        selectedGameId={selectedGameId}
        onSelectGame={onSelectGame}
      />
    ) : null}

    <LoadTransition
      loading={!rulesConfig}
      skeleton={<Skeleton height={62} radius={radius.lg} />}
    >
      <Card padding="none">
        <View style={styles.contextRow}>
          <View style={styles.contextText}>
            <AppText variant="bodyLg" family="heading">
              {activeCount} of {rosterCount} players active
            </AppText>
            <AppText variant="caption" color="secondary">
              {rulesConfig
                ? `${capitalize(rulesConfig.sport)} · ${rulesConfig.segmentCount} ${rulesConfig.segmentLabel}s · ${rulesConfig.playersOnField} on field`
                : ""}
            </AppText>
          </View>
          <AppPressable
            onPress={onEditSelection}
            pressScale={1}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit active players in the roster"
          >
            <AppText variant="caption" family="heading" color="accent">
              Edit
            </AppText>
          </AppPressable>
        </View>
      </Card>
    </LoadTransition>

    <GameSetup
      activePlayersCount={activeCount}
      inningCount={rulesConfig?.segmentCount ?? 7}
      inningLabel={rulesConfig?.segmentLabel ?? "inning"}
      lineup={lineup}
      isGenerating={isGenerating}
      error={error}
      onEditLineup={onEditLineup}
      onGenerate={onGenerate}
      onSaveLineup={onSaveLineup}
      onSetLineupCell={onSetLineupCell}
      playerGenderByName={playerGenderByName}
      lineupScrollableRef={lineupScrollableRef}
      lineupAnchorRef={lineupAnchorRef}
    />
  </>
);

const styles = StyleSheet.create({
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm + 2,
  },
  contextText: {
    flex: 1,
    gap: 2,
  },
});

export default BuildTab;
