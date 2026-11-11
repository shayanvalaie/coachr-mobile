import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
} from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import DraggablePlayerList from "../components/DraggablePlayerList";
import {
  AppText,
  Button,
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
import { findDuplicatePlayerNames } from "../utils/playerNames";
import { clearPendingRosterImport, ImportPreview, loadPendingRosterImport, pickRosterImportPreview, savePendingRosterImport } from "../utils/rosterImport";
import { assertPaidAccess, capturePaidAccess, requirePaidAccess } from "../lib/access/paidAccess";

type Props = {
  session: BackendSession;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
};

const RosterScreen = ({ session, hasProSubscription, onRequirePro }: Props) => {
  const toast = useToast();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roster, setRosterState] = useState<Player[]>([]);
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
  const [rulesContext, setRulesContext] = useState<string | undefined>();
  const importBusyRef = useRef(false);
  const importAbortRef = useRef<AbortController | null>(null);
  const accountRef = useRef(session.user.id);
  accountRef.current = session.user.id;
  useEffect(() => {
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    importBusyRef.current = false;
    setStatus("");
    return () => { importAbortRef.current?.abort(); };
  }, [session.user.id]);
  // Per-player handlers read the roster through this ref so their identity
  // does not change on every keystroke, which would re-render every card.
  useEffect(() => {
    if (!hasProSubscription) importAbortRef.current?.abort();
  }, [hasProSubscription]);
  const rosterRef = useRef(roster);
  const setRoster = useCallback((update: Player[] | ((players: Player[]) => Player[])) => {
    const next = typeof update === "function" ? update(rosterRef.current) : update;
    rosterRef.current = next;
    setRosterState(next);
  }, []);

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
      const config = rulesConfigFromTeamRules(teamRules);
      setLineupSlots(config.lineupSlots);
      setRulesContext(config.rulesContext ?? undefined);
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
    const newPlayer = createPlayer({ rulesContext });
    setRoster((prev) => [newPlayer, ...prev]);
    setActiveIds((prev) => new Set(prev).add(newPlayer.id));
    setExpandedPlayers((prev) => new Set(prev).add(newPlayer.id));
  }, [rulesContext]);

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

      const { id: idToUse } = await backendClient.saveTeamPlayer(team, player, { rulesContext: player.rulesContext ?? rulesContext });
      if (idToUse === player.id) return idToUse;

      setRoster((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, id: idToUse } : p)),
      );
      setActiveIds((prev) => {
        const next = new Set(prev);
        if (next.delete(player.id)) next.add(idToUse);
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
    [ensureTeam, rulesContext],
  );

  const updatePlayer = useCallback((id: string, patch: Partial<Player>) => {
    const player = rosterRef.current.find((entry) => entry.id === id);
    if (!player) return;
    const updated: Player = {
      ...player,
      ...patch,
      lockInPosition:
        (patch.lockInPosition ?? player.lockInPosition) &&
        (patch.desiredPositions ?? player.desiredPositions).length === 1,
    };
    setRoster((prev) => prev.map((entry) => entry.id === id ? updated : entry));
    // Text is saved on blur. Discrete selections save immediately once named.
    if (patch.name === undefined && updated.name.trim()) {
      void persistPlayer(updated).catch(() => {
        showError("Player changes weren't saved. Check your connection and tap Save player to retry.");
      });
    }
  }, [persistPlayer, setRoster, showError]);

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
      if (!updated.name.trim()) return;
      try {
        await persistPlayer(updated);
      } catch (_err) {
        showError("Failed to update bench status.");
      }
    },
    [persistPlayer, showError],
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

  // Pick, parse and commit in one step. A pending import left by a lost
  // response is retried with its original operation ID, so it cannot duplicate.
  const handleImportRoster = useCallback(async () => {
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    const accountId = session.user.id;
    const epoch = backendClient.auth.getSessionEpoch();
    const access = capturePaidAccess();
    const controller = new AbortController();
    importAbortRef.current = controller;
    const current = () => accountRef.current === accountId && backendClient.auth.getSessionEpoch() === epoch && !controller.signal.aborted;
    let rowIssues: ImportPreview["issues"] = [];
    setStatus("Checking import...");
    try {
      requirePaidAccess();
      const team = await ensureTeam();
      if (!current()) return;
      assertPaidAccess(access);
      if (!team) throw new Error("Unable to load your team.");
      let pending = await loadPendingRosterImport(accountId);
      if (!current()) return;
      if (pending && pending.teamId !== team) throw new Error("A pending import belongs to another team. Open that team to reconcile it.");
      if (!pending) {
        const preview = await pickRosterImportPreview(team, backendClient.previewRosterImport, controller.signal);
        if (!current() || preview === null) return;
        assertPaidAccess(access);
        rowIssues = preview.issues;
        if (preview.rows.length === 0) {
          const firstIssue = preview.issues[0];
          throw new Error(firstIssue ? `No players imported. Row ${firstIssue.sourceRow}: ${firstIssue.message}` : "No players found in that file.");
        }
        pending = { accountId, teamId: team, operationId: createPlayer().id, rows: preview.rows, rulesContext: preview.rulesContext ?? rulesContext, attempted: false };
      }
      setStatus(`Importing ${pending.rows.length} players...`);
      // Persist before dispatch. A lost response is reconciled using this same ID.
      await savePendingRosterImport({ ...pending, attempted: true });
      if (!current()) return;
      assertPaidAccess(access);
      const result = await backendClient.commitRosterImport(pending.teamId, { operationId: pending.operationId, rows: pending.rows, rulesContext: pending.rulesContext }, { signal: controller.signal });
      await clearPendingRosterImport(accountId);
      if (!current()) return;
      const nextRoster = await backendClient.getTeamRoster(pending.teamId);
      if (!current()) return;
      setRoster(nextRoster);
      setActiveIds(new Set(nextRoster.filter(player => !player.benched).map(player => player.id)));
      setExpandedPlayers(new Set());
      const skipped = [
        result.skippedSourceRows.length > 0 ? `${result.skippedSourceRows.length} already on this team` : null,
        rowIssues.length > 0 ? `${rowIssues.length} rows with errors` : null,
      ].filter(Boolean).join(", ");
      toast.show({ message: `Imported ${result.createdCount} players.${skipped ? ` Skipped ${skipped}.` : ""}`, type: "success" });
    } catch (error) {
      const response = error as { context?: { body?: { detail?: { committed?: boolean } } } };
      if (response.context?.body?.detail?.committed === false) {
        try {
          await clearPendingRosterImport(accountId);
        } catch (storageError) {
          if (current()) showError(`No import was saved, but the saved import could not be cleared. ${storageError instanceof Error ? storageError.message : "Try again."}`);
          return;
        }
        if (current()) showError(`${error instanceof Error ? error.message : "Import was rejected."} No import was saved. Choose the file again.`);
      } else if (current()) {
        showError(error instanceof Error ? error.message : "Unable to import the roster.");
      }
    } finally {
      if (importAbortRef.current === controller) importBusyRef.current = false;
      if (accountRef.current === accountId && backendClient.auth.getSessionEpoch() === epoch) setStatus("");
    }
  }, [ensureTeam, rulesContext, session.user.id, setRoster, showError, toast]);

  const handleImportPress = useCallback(() => {
    if (!hasProSubscription) { onRequirePro("Roster import"); return; }
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
              <Button
                label="Import"
                icon="upload"
                variant="secondary"
                size="sm"
                onPress={handleImportPress}
                disabled={Boolean(status)}
                accessibilityLabel="Import roster from a spreadsheet"
                style={styles.importButton}
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
  importButton: {
    minHeight: 40,
  },
  content: {
    paddingHorizontal: space.md,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: space.sm,
  },
});

export default RosterScreen;
