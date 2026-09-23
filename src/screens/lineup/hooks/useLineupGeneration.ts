import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LayoutAnimation } from "react-native";
import { presentLineupInterstitial } from "../../../lib/ads/lineupInterstitial";
import { backendClient } from "../../../lib/backend/client";
import { BackendGame } from "../../../lib/backend/types";
import { notifySuccess } from "../../../lib/haptics";
import { InningAssignment, Player } from "../../../types/lineup";
import {
  rulesConfigFromTeamRules,
  RulesetStatus,
  TeamRulesState,
} from "../../../types/rules";
import {
  describeInvokeError,
  extractRowsFromResponse,
  formatGameLabel,
  normalizeLineupRows,
} from "../../../utils/lineupTransforms";

// Minimum time the generating state (skeleton loaders) stays on screen. Server
// generation is fast enough that without this floor the skeletons would flash
// for a frame and the lineup would snap in.
const MIN_GENERATING_MS = 300;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Pad out the remaining time so the generating state lasts at least
// MIN_GENERATING_MS from when generation started.
const holdMinGeneratingDuration = async (startedAt: number) => {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_GENERATING_MS) {
    await wait(MIN_GENERATING_MS - elapsed);
  }
};

const INACTIVE_RULESET_MESSAGES: Record<Exclude<RulesetStatus, "active">, string> = {
  baking: "Your rules are still being set up. We'll let you know here when they're ready.",
  review: "Your rules are in review. We'll email you when they're approved.",
  rejected: "These rules could not be supported. Update your rules or request a change.",
};

export type RosterRequirement = {
  required: number;
  have: number;
  detail: string;
};

type Params = {
  ensureTeam: () => Promise<string | null>;
  teamRules: TeamRulesState | null;
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

// Lineup generation flow, including the interstitial ad gate (the ad shows
// while the server generates, never while a sheet is open) and the
// auto-generate handoff from launch requests. The server engine is the only
// generator; there is no offline fallback.
export const useLineupGeneration = ({
  ensureTeam,
  teamRules,
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

  const rulesConfig = useMemo(
    () => (teamRules ? rulesConfigFromTeamRules(teamRules) : null),
    [teamRules],
  );

  const clearLineupState = useCallback(() => {
    setLineup(null);
    setLineupInlineEditMode(false);
    setEditModalVisible(false);
    setHistoryEditRows(null);
    setLineupParentVersionId(null);
    setExpandedInnings(new Set());
    setStatus("");
  }, [
    setEditModalVisible,
    setExpandedInnings,
    setHistoryEditRows,
    setLineup,
    setLineupInlineEditMode,
    setLineupParentVersionId,
    setStatus,
  ]);

  const applyGeneratedLineup = useCallback(
    (rows: InningAssignment[], statusMessage: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLineup(rows);
      setLineupInlineEditMode(false);
      setEditModalVisible(false);
      setHistoryEditRows(null);
      setLineupParentVersionId(null);
      setExpandedInnings(new Set());
      setStatus(statusMessage);
      setSaveModalVisible(false);
      setSaveLineupName("");
      notifySuccess();
    },
    [
      setEditModalVisible,
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

  const runLineupGeneration = useCallback(
    async (overrideGameId?: string | null) => {
      const effectiveGameId =
        overrideGameId === undefined ? selectedGameId : overrideGameId;

      setIsGenerating(true);
      setStatus("Generating...");
      setError(null);

      const startedAt = Date.now();

      try {
        const team = await ensureTeam();
        if (!team) {
          setError("Unable to load your team.");
          setStatus("");
          return;
        }
        if (!teamRules || !rulesConfig) {
          setError("No rules configuration found.");
          setStatus("");
          return;
        }
        if (!teamRules.ruleset) {
          setError("Set up your team rules or join a league before generating.");
          setStatus("");
          return;
        }
        if (teamRules.ruleset.status !== "active") {
          setError(INACTIVE_RULESET_MESSAGES[teamRules.ruleset.status]);
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

        const payloadRoster = activePlayers.map((player) => ({
          id: player.id,
          name: player.name,
          gender: player.gender,
          desiredPositions: player.desiredPositions,
          fixedAllGame: player.fixedAllGame,
          lockInPosition: player.lockInPosition,
        }));

        // The ad and the server request run together so free users wait for
        // whichever is longer, not the sum of both.
        const [, data] = await Promise.all([
          presentLineupInterstitial(hasProSubscription),
          backendClient.generateLineup({
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
          }),
        ]);

        const nextLineup = normalizeLineupRows(extractRowsFromResponse(data));
        if (nextLineup.length === 0) {
          throw new Error("The server returned an empty lineup");
        }

        await holdMinGeneratingDuration(startedAt);
        applyGeneratedLineup(nextLineup, "Lineup generated. Save it if you like it.");
      } catch (invokeErr) {
        const { message, detail } = await describeInvokeError(invokeErr);

        if (__DEV__) {
          console.log(
            "[lineup invoke error]",
            message,
            detail ? `(${detail})` : "",
          );
        }

        setError(message || "Unable to generate lineup.");
        clearLineupState();
      } finally {
        // The skeleton -> grid cross-fade is handled in GameSetup via
        // reanimated; no classic LayoutAnimation here (it fought the sortable
        // grid's own row animations and caused a staggered, one-by-one reveal).
        setIsGenerating(false);
      }
    },
    [
      activePlayers,
      applyGeneratedLineup,
      clearLineupState,
      ensureTeam,
      hasProSubscription,
      selectedGameId,
      games,
      rulesConfig,
      setError,
      setStatus,
      teamRules,
    ],
  );

  useEffect(() => {
    if (!pendingAutoGenerate) return;
    if (isGenerating) return;
    if (!teamRules) return;

    runLineupGeneration(pendingAutoGenerate.gameId).finally(() => {
      setPendingAutoGenerate((prev) =>
        prev && prev.requestId === pendingAutoGenerate.requestId ? null : prev,
      );
    });
  }, [isGenerating, pendingAutoGenerate, teamRules, runLineupGeneration]);

  return {
    isGenerating,
    rosterRequirement,
    setRosterRequirement,
    setPendingAutoGenerate,
    runLineupGeneration,
  };
};
