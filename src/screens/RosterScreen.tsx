import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import DraggablePlayerList from "../components/DraggablePlayerList";
import {
  AppText,
  EmptyState,
  IconButton,
  LoadTransition,
  PageHeader,
  ScreenContainer,
  SkeletonListRows,
  useToast,
} from "../components/ui";
import { backendClient } from "../lib/backend/client";
import { BackendSession } from "../lib/backend/types";
import { space, TAB_BAR_CLEARANCE } from "../theme/tokens";
import { Player } from "../types/lineup";
import { defaultTeamRulesConfig, rulesConfigFromTeamRules } from "../types/rules";
import { createPlayer } from "../utils/lineupGenerator";
import {
  findDuplicatePlayerNames,
  normalizePlayerName,
} from "../utils/playerNames";
import { pickRosterFromSpreadsheet } from "../utils/rosterImport";

// Imported players are saved a few at a time: parallel enough to be quick,
// bounded so a 30-player sheet does not open 30 connections at once.
const IMPORT_BATCH_SIZE = 5;

type Props = {
  session: BackendSession;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
};

const RosterScreen = ({ session, hasProSubscription, onRequirePro }: Props) => {
  const toast = useToast();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [lineupSlots, setLineupSlots] = useState<string[]>(
    defaultTeamRulesConfig.lineupSlots,
  );
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(
    new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  // Transient progress copy only (importing/saving); outcomes go to toasts.
  const [status, setStatus] = useState("");
  // Per-player handlers read the roster through this ref so their identity
  // does not change on every keystroke, which would re-render every card.
  const rosterRef = useRef(roster);
  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const showError = useCallback(
    (message: string) => toast.show({ message, type: "error" }),
    [toast],
  );

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;

    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;

    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadRoster = useCallback(async () => {
    // Skeletons are for the first paint only; re-syncs after a failed delete
    // keep the current list on screen instead of flashing placeholders.
    if (!hasLoadedRef.current) setIsLoading(true);
    try {
      const team = await ensureTeam();
      if (!team) return;

      const [nextRoster, teamRules] = await Promise.all([
        backendClient.getTeamRoster(team),
        backendClient.getTeamRules(team),
      ]);
      setRoster(nextRoster);
      setLineupSlots(rulesConfigFromTeamRules(teamRules).lineupSlots);
      setActiveIds(
        new Set(nextRoster.filter((p) => !p.benched).map((p) => p.id)),
      );
      setExpandedPlayers(new Set());
    } catch (_err) {
      showError("Unable to load roster from server.");
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
    }
  }, [ensureTeam, showError]);

  useEffect(() => {
    loadRoster().catch(() => {
      showError("Unable to load roster from server.");
    });
  }, [loadRoster, showError]);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const playerCountLabel = useMemo(
    () => `${roster.length} ${roster.length === 1 ? "player" : "players"}`,
    [roster.length],
  );

  const handleAddPlayer = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newPlayer = createPlayer({});
    setRoster((prev) => [newPlayer, ...prev]);
    setActiveIds((prev) => new Set(prev).add(newPlayer.id));
    setExpandedPlayers((prev) => new Set(prev).add(newPlayer.id));
  }, []);

  const updatePlayer = useCallback((id: string, patch: Partial<Player>) => {
    setRoster((prev) =>
      prev.map((player) =>
        player.id === id
          ? {
              ...player,
              ...patch,
              lockInPosition:
                (patch.lockInPosition ?? player.lockInPosition) &&
                (patch.desiredPositions ?? player.desiredPositions).length ===
                  1,
            }
          : player,
      ),
    );
  }, []);

  const removePlayer = useCallback(
    async (id: string) => {
      // Optimistically remove from local state for a responsive UI.
      setRoster((prev) => prev.filter((p) => p.id !== id));
      setActiveIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setExpandedPlayers((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      // Persist the deletion so it survives a reload.
      try {
        const team = await ensureTeam();
        if (!team) return;
        await backendClient.deleteTeamPlayer(team, id);
      } catch (_err) {
        showError("Failed to remove player.");
        // Re-sync from the server so local state matches persisted state.
        loadRoster().catch(() => {
          showError("Unable to load roster from server.");
        });
      }
    },
    [ensureTeam, loadRoster, showError],
  );

  const togglePlayer = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleActive = useCallback(
    async (id: string, checked: boolean) => {
      const target = rosterRef.current.find((p) => p.id === id);
      if (!target) return;
      const updated: Player = { ...target, benched: !checked };

      // Optimistic local update for a responsive UI.
      setActiveIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
      setRoster((prev) => prev.map((p) => (p.id === id ? updated : p)));

      // Persist so the bench choice survives reloads and is honored by
      // lineup generation (the Lineup screen loads its active set from here).
      try {
        const team = await ensureTeam();
        if (!team) return;
        await backendClient.saveTeamPlayer(team, updated);
      } catch (_err) {
        showError("Failed to update bench status.");
      }
    },
    [ensureTeam, showError],
  );

  const handleReorderPlayers = useCallback((nextPlayers: Player[]) => {
    setRoster(nextPlayers);
  }, []);

  // Persists one player and reconciles a server-assigned id for new rows.
  const persistPlayer = useCallback(
    async (player: Player) => {
      const team = await ensureTeam();
      if (!team) {
        throw new Error("Unable to ensure team for saving.");
      }

      const { id: idToUse } = await backendClient.saveTeamPlayer(team, player);
      if (idToUse === player.id) return idToUse;

      setRoster((prev) =>
        prev.map((p) => (p.id === player.id ? { ...player, id: idToUse } : p)),
      );
      setActiveIds((prev) => {
        const next = new Set(prev);
        next.delete(player.id);
        next.add(idToUse);
        return next;
      });
      setExpandedPlayers((prev) => {
        if (!prev.has(player.id)) return prev;
        const next = new Set(prev);
        next.delete(player.id);
        next.add(idToUse);
        return next;
      });
      return idToUse;
    },
    [ensureTeam],
  );

  const handleSavePlayer = useCallback(
    async (id: string) => {
      const player = rosterRef.current.find((p) => p.id === id);
      if (!player) return;

      setIsSaving(true);
      setStatus("");
      try {
        const savedId = await persistPlayer(player);
        // Collapse the card once the player is saved.
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedPlayers((prev) => {
          const next = new Set(prev);
          next.delete(id);
          next.delete(savedId);
          return next;
        });
        toast.show({ message: "Player saved.", type: "success" });
      } catch (_err) {
        showError("Failed to save player.");
      } finally {
        setIsSaving(false);
      }
    },
    [persistPlayer, showError, toast],
  );

  // Name edits persist when the field blurs, without collapsing the card.
  const handleAutoSavePlayer = useCallback(
    async (id: string) => {
      const player = rosterRef.current.find((p) => p.id === id);
      if (!player || !player.name.trim()) return;
      try {
        await persistPlayer(player);
      } catch (_err) {
        showError("Failed to save player.");
      }
    },
    [persistPlayer, showError],
  );

  const handleRemoveAll = useCallback(() => {
    if (roster.length === 0) return;

    Alert.alert(
      "Delete all players?",
      "This removes every player from your roster. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            const idsToDelete = roster.map((p) => p.id);

            // Optimistically clear local state for a responsive UI.
            setRoster([]);
            setActiveIds(new Set());
            setExpandedPlayers(new Set());
            setStatus("");

            // Persist the deletions so they survive a reload.
            try {
              const team = await ensureTeam();
              if (!team) return;
              await Promise.all(
                idsToDelete.map((id) =>
                  backendClient.deleteTeamPlayer(team, id),
                ),
              );
              toast.show({ message: "All players removed.", type: "success" });
            } catch (_err) {
              showError("Failed to remove all players.");
              // Re-sync from the server so local state matches persisted state.
              loadRoster().catch(() => {
                showError("Unable to load roster from server.");
              });
            }
          },
        },
      ],
    );
  }, [roster, ensureTeam, loadRoster, showError, toast]);

  // Bulk actions hide behind a long-press on the add button; the header
  // keeps one visible amber action.
  const handleRosterActions = useCallback(() => {
    Alert.alert("Roster", undefined, [
      {
        text: "Delete all players",
        style: "destructive",
        onPress: handleRemoveAll,
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [handleRemoveAll]);

  const handleImportRoster = useCallback(async () => {
    setStatus("Importing roster...");

    let importedPlayers: Player[] | null;
    try {
      importedPlayers = await pickRosterFromSpreadsheet();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Unable to read the file.");
      setStatus("");
      return;
    }
    if (!importedPlayers) {
      setStatus("");
      return;
    }

    // --- Save phase ---
    let team: string | null;
    let existingRoster;
    try {
      team = await ensureTeam();
      if (!team) {
        showError("Unable to load your team.");
        setStatus("");
        return;
      }
      existingRoster = await backendClient.getTeamRoster(team);
    } catch (_err) {
      showError(
        "Unable to reach the server. Check your connection and try again.",
      );
      setStatus("");
      return;
    }

    const existingDuplicates = findDuplicatePlayerNames(existingRoster);
    if (existingDuplicates.length > 0) {
      showError(
        `Team roster already has duplicate names: ${existingDuplicates.join(", ")}. Resolve those first.`,
      );
      setStatus("");
      return;
    }

    const existingNameMap = new Map(
      existingRoster
        .map((player) => [normalizePlayerName(player.name), player.id] as const)
        .filter(([normalized]) => normalized.length > 0),
    );

    const duplicateExistingNames = Array.from(
      new Set(
        importedPlayers
          .filter((player) =>
            existingNameMap.has(normalizePlayerName(player.name)),
          )
          .map((player) => player.name.trim())
          .filter(Boolean),
      ),
    );
    const playersToCreate = importedPlayers.filter(
      (player) => !existingNameMap.has(normalizePlayerName(player.name)),
    );

    if (playersToCreate.length === 0) {
      const nextRoster = await backendClient.getTeamRoster(team);
      setRoster(nextRoster);
      setActiveIds(
        new Set(nextRoster.filter((p) => !p.benched).map((p) => p.id)),
      );
      setExpandedPlayers(new Set());
      const summary = `No new players imported. ${duplicateExistingNames.length} already exist for this team.`;
      setStatus("");
      toast.show({ message: summary, type: "info" });
      return;
    }

    setStatus(`Saving ${playersToCreate.length} players...`);
    const failedNames: string[] = [];
    for (let start = 0; start < playersToCreate.length; start += IMPORT_BATCH_SIZE) {
      const batch = playersToCreate.slice(start, start + IMPORT_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.allSettled(
        batch.map((player) => backendClient.saveTeamPlayer(team, player)),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") failedNames.push(batch[index].name);
      });
    }

    const nextRoster = await backendClient.getTeamRoster(team);
    setRoster(nextRoster);
    setActiveIds(
      new Set(nextRoster.filter((p) => !p.benched).map((p) => p.id)),
    );
    setExpandedPlayers(new Set());

    const savedCount = playersToCreate.length - failedNames.length;
    const parts: string[] = [];
    if (savedCount > 0)
      parts.push(
        `Imported ${savedCount} new player${savedCount !== 1 ? "s" : ""}.`,
      );
    if (duplicateExistingNames.length > 0)
      parts.push(
        `Skipped ${duplicateExistingNames.length} already on this team.`,
      );
    if (failedNames.length > 0)
      parts.push(`Failed to save: ${failedNames.join(", ")}.`);

    const summary = parts.join(" ");
    setStatus("");
    if (failedNames.length > 0 && savedCount === 0) {
      showError(
        `Failed to save imported players. Check your connection and try again.`,
      );
    } else {
      toast.show({ message: summary, type: "success" });
    }
  }, [ensureTeam, showError, toast]);

  const handleImportPress = useCallback(() => {
    if (!hasProSubscription) {
      onRequirePro("Roster import");
      return;
    }
    void handleImportRoster();
  }, [hasProSubscription, onRequirePro, handleImportRoster]);

  return (
    <ScreenContainer keyboard padded={false}>
      {/* Single scroll container. Must be a Reanimated ScrollView: the
          sortable roster list holds its animated ref and auto-scrolls it
          when a dragged card nears the viewport edge. */}
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          eyebrow="Roster"
          title={playerCountLabel}
          right={
            <>
              <IconButton
                icon="upload"
                onPress={handleImportPress}
                accessibilityLabel="Import roster from a spreadsheet"
              />
              <IconButton
                icon="plus"
                variant="accent"
                onPress={handleAddPlayer}
                onLongPress={handleRosterActions}
                accessibilityLabel="Add player"
                accessibilityHint="Press and hold for more roster actions"
              />
            </>
          }
        />
        <AppText variant="caption" color="secondary">
          Tap a chip to bench a player for the next lineup. Tap a name for positions.
        </AppText>

        {status ? (
          <AppText variant="caption" color="secondary">
            {status}
          </AppText>
        ) : null}

        <LoadTransition
          loading={isLoading}
          skeleton={<SkeletonListRows count={6} height={66} />}
        >
          {roster.length === 0 ? (
            <EmptyState
              icon="users"
              title="No players yet"
              body="Add players by hand or import an Excel roster."
              action={{ label: "Add player", onPress: handleAddPlayer }}
            />
          ) : (
            <DraggablePlayerList
              players={roster}
              expandedPlayers={expandedPlayers}
              activeIds={activeIds}
              isSaving={isSaving}
              lineupSlots={lineupSlots}
              scrollableRef={scrollRef}
              onReorderPlayers={handleReorderPlayers}
              onToggleExpand={togglePlayer}
              onToggleActive={handleToggleActive}
              onUpdatePlayer={updatePlayer}
              onRemovePlayer={removePlayer}
              onSavePlayer={handleSavePlayer}
              onAutoSavePlayer={handleAutoSavePlayer}
            />
          )}
        </LoadTransition>
      </Animated.ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.md,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: space.sm,
  },
});

export default RosterScreen;
