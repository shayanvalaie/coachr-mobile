import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import { LayoutAnimation } from "react-native";
import { presentLineupInterstitial } from "../../../lib/ads/lineupInterstitial";
import { backendClient } from "../../../lib/backend/client";
import { BackendGame } from "../../../lib/backend/types";
import { notifySuccess } from "../../../lib/haptics";
import { InningAssignment, Player } from "../../../types/lineup";
import { TeamRulesConfig } from "../../../types/rules";
import { generateLineup } from "../../../utils/lineupGenerator";
import {
  describeInvokeError,
  extractRowsFromResponse,
  formatGameLabel,
  normalizeLineupRows,
} from "../../../utils/lineupTransforms";

const LINEUP_GENERATOR_MODE = (
  process.env.EXPO_PUBLIC_LINEUP_GENERATOR_MODE ?? "fallback"
)
  .trim()
  .toLowerCase();
const USE_LOCAL_LINEUP_GENERATOR = LINEUP_GENERATOR_MODE !== "openai";

export type RosterRequirement = {
  required: number;
  have: number;
  detail: string;
};

type Params = {
  ensureTeam: () => Promise<string | null>;
  rulesConfig: TeamRulesConfig | null;
  activePlayers: Player[];
  hasProSubscription: boolean;
  games: BackendGame[];
  selectedGameId: string | null;
  setStatus: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLineup: Dispatch<SetStateAction<InningAssignment[] | null>>;
  setLineupInlineEditMode: Dispatch<SetStateAction<boolean>>;
  setEditModalVisible: Dispatch<SetStateAction<boolean>>;
  setHistoryEditRows: Dispatch<SetStateAction<InningAssignment[] | null>>;
  setLineupParentVersionId: Dispatch<SetStateAction<string | null>>;
  setExpandedInnings: Dispatch<SetStateAction<Set<number>>>;
  setSaveModalVisible: Dispatch<SetStateAction<boolean>>;
  setSaveLineupName: Dispatch<SetStateAction<string>>;
};

// Lineup generation flow, including the pre-generation interstitial ad gate
// (the ad always runs before generation, never while a sheet is open) and the
// auto-generate handoff from launch requests.
export const useLineupGeneration = ({
  ensureTeam,
  rulesConfig,
  activePlayers,
  hasProSubscription,
  games,
  selectedGameId,
  setStatus,
  setError,
  setLineup,
  setLineupInlineEditMode,
  setEditModalVisible,
  setHistoryEditRows,
  setLineupParentVersionId,
  setExpandedInnings,
  setSaveModalVisible,
  setSaveLineupName,
}: Params) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [rosterRequirement, setRosterRequirement] =
    useState<RosterRequirement | null>(null);
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState<{
    requestId: number;
    gameId: string | null;
  } | null>(null);

  const runLineupGeneration = useCallback(
    async (overrideGameId?: string | null) => {
      const effectiveGameId =
        overrideGameId === undefined ? selectedGameId : overrideGameId;

      setIsGenerating(true);
      setStatus("Generating...");
      setError(null);

      try {
        const team = await ensureTeam();
        if (!team) {
          setError("Unable to load your team.");
          setStatus("");
          return;
        }
        if (!rulesConfig) {
          setError("No rules configuration found.");
          setStatus("");
          return;
        }

        if (activePlayers.length < rulesConfig.minimumPlayers) {
          setRosterRequirement({
            required: rulesConfig.minimumPlayers,
            have: activePlayers.length,
            detail: `Your rules require at least ${rulesConfig.minimumPlayers} active players to generate a lineup.`,
          });
          setStatus("");
          return;
        }

        if (activePlayers.length < rulesConfig.playersOnField) {
          setRosterRequirement({
            required: rulesConfig.playersOnField,
            have: activePlayers.length,
            detail: `You need at least ${rulesConfig.playersOnField} active players so every ${rulesConfig.segmentLabel} can be filled on the field.`,
          });
          setStatus("");
          return;
        }

        await presentLineupInterstitial(hasProSubscription);

        const fallbackSport = rulesConfig.sport.toLowerCase();
        const canUseLocalFallback = fallbackSport === "softball";

        if (USE_LOCAL_LINEUP_GENERATOR) {
          if (!canUseLocalFallback) {
            setError(
              "Local lineup generator only supports softball. Set EXPO_PUBLIC_LINEUP_GENERATOR_MODE=openai to use AI generation.",
            );
            setStatus("");
            return;
          }

          const fallback = generateLineup(activePlayers);
          if (fallback.error) {
            setError(fallback.error);
            setLineup(null);
            setLineupInlineEditMode(false);
            setEditModalVisible(false);
            setHistoryEditRows(null);
            setLineupParentVersionId(null);
            setExpandedInnings(new Set());
            setStatus("");
            return;
          }

          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setLineup(fallback.lineup ?? null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("Lineup generated locally.");
          setSaveModalVisible(false);
          setSaveLineupName("");
          notifySuccess();
          return;
        }

        const payloadRoster = activePlayers.map((player) => ({
          id: player.id,
          name: player.name,
          gender: player.gender,
          desiredPositions: player.desiredPositions,
          fixedAllGame: false,
          lockInPosition: player.lockInPosition,
        }));

        const data = await backendClient.generateLineup({
          teamId: team,
          sport: rulesConfig.sport,
          roster: payloadRoster,
          gameId: effectiveGameId,
          gameTitle: (() => {
            const game = games.find((entry) => entry.id === effectiveGameId);
            if (!game) return null;
            const baseTitle = game.title.trim() || game.opponentName.trim();
            return baseTitle || formatGameLabel(game);
          })(),
          saveLineup: false,
          lineupName: null,
          rulesConfig,
        });

        const nextLineup = normalizeLineupRows(extractRowsFromResponse(data));
        if (nextLineup.length === 0) {
          throw new Error("AI returned an empty lineup");
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLineup(nextLineup);
        setLineupInlineEditMode(false);
        setEditModalVisible(false);
        setLineupParentVersionId(null);
        setExpandedInnings(new Set());
        setStatus("Lineup generated. Save it if you like it.");
        setSaveModalVisible(false);
        setSaveLineupName("");
        notifySuccess();
      } catch (invokeErr) {
        const { message, detail } = await describeInvokeError(invokeErr);
        const context =
          invokeErr && typeof invokeErr === "object"
            ? (invokeErr as { context?: unknown }).context
            : null;
        const httpStatus =
          context && typeof context === "object"
            ? (context as { status?: unknown }).status
            : null;

        if (__DEV__) {
          console.log(
            "[lineup invoke error]",
            message,
            detail ? `(${detail})` : "",
          );
        }

        if (typeof httpStatus === "number") {
          setError(message || "Unable to generate lineup.");
          setLineup(null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("");
          return;
        }

        const fallbackSport = rulesConfig?.sport.toLowerCase() ?? "";
        const canUseLocalFallback = fallbackSport === "softball";

        if (!canUseLocalFallback) {
          setError(message || "Unable to generate lineup right now.");
          setLineup(null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("");
          return;
        }

        const fallback = generateLineup(activePlayers);
        if (fallback.error) {
          setError(fallback.error);
          setLineup(null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("");
        } else {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setLineup(fallback.lineup ?? null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("Generated locally (AI unavailable).");
          notifySuccess();
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [
      activePlayers,
      ensureTeam,
      hasProSubscription,
      selectedGameId,
      games,
      rulesConfig,
      setEditModalVisible,
      setError,
      setExpandedInnings,
      setHistoryEditRows,
      setLineup,
      setLineupInlineEditMode,
      setLineupParentVersionId,
      setSaveLineupName,
      setSaveModalVisible,
      setStatus,
    ],
  );

  useEffect(() => {
    if (!pendingAutoGenerate) return;
    if (isGenerating) return;
    if (!rulesConfig) return;

    runLineupGeneration(pendingAutoGenerate.gameId).finally(() => {
      setPendingAutoGenerate((prev) =>
        prev && prev.requestId === pendingAutoGenerate.requestId ? null : prev,
      );
    });
  }, [isGenerating, pendingAutoGenerate, rulesConfig, runLineupGeneration]);

  return {
    isGenerating,
    rosterRequirement,
    setRosterRequirement,
    setPendingAutoGenerate,
    runLineupGeneration,
  };
};
