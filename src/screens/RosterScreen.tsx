import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
  View,
  ScrollView,
} from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import DraggablePlayerList from "../components/DraggablePlayerList";
import {
  AppText,
  Button,
  Sheet,
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
import { clearPendingRosterImport, ImportPreview, loadPendingRosterImport, PendingRosterImport, pickRosterImportPreview, savePendingRosterImport } from "../utils/rosterImport";
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
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingRosterImport | null>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [isImportSaving, setIsImportSaving] = useState(false);
  const importBusyRef = useRef(false);
  const importAbortRef = useRef<AbortController | null>(null);
  const importAttemptedRef = useRef(false);
  const accountRef = useRef(session.user.id);
  accountRef.current = session.user.id;
  useEffect(() => {
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    importBusyRef.current = false;
    setImportVisible(false);
    setPendingImport(null);
    setImportPreview(null);
    setIsImportSaving(false);
    setStatus("");
    return () => { importAbortRef.current?.abort(); };
  }, [session.user.id]);
  // Per-player handlers read the roster through this ref so their identity
  // does not change on every keystroke, which would re-render every card.
  useEffect(() => {
    if (!hasProSubscription) {
      importAbortRef.current?.abort();
      setImportVisible(false);
      setImportPreview(null);
      setPendingImport(null);
    }
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

  const handleImportRoster = useCallback(async () => {
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    const accountId = session.user.id;
    const epoch = backendClient.auth.getSessionEpoch();
    const access = capturePaidAccess();
    const controller = new AbortController();
    importAbortRef.current = controller;
    const current = () => accountRef.current === accountId && backendClient.auth.getSessionEpoch() === epoch && !controller.signal.aborted;
    setStatus("Checking import...");
    try {
      requirePaidAccess();
      const team = await ensureTeam();
      if (!current()) return;
      assertPaidAccess(access);
      if (!team) throw new Error("Unable to load your team.");
      const saved = await loadPendingRosterImport(accountId);
      if (!current()) return;
      if (saved) {
        if (saved.teamId !== team) throw new Error("A pending import belongs to another team. Open that team to reconcile it.");
        setPendingImport(saved);
        setImportPreview({ worksheet: "Saved import", rows: saved.rows, issues: [], emptySourceRows: [] });
        importAttemptedRef.current = saved.attempted;
        setImportVisible(true);
        return;
      }
      const preview = await pickRosterImportPreview(team, backendClient.previewRosterImport, controller.signal);
      if (!current() || preview === null) return;
      assertPaidAccess(access);
      const pending: PendingRosterImport = { accountId, teamId: team, operationId: createPlayer().id, rows: preview.rows, rulesContext, attempted: false };
      if (preview.issues.length === 0 && preview.rows.length > 0) {
        await savePendingRosterImport(pending);
        if (!current()) return;
      }
      setPendingImport(pending);
      setImportPreview(preview);
      importAttemptedRef.current = false;
      setImportVisible(true);
    } catch (error) {
      if (current()) showError(error instanceof Error ? error.message : "Unable to prepare the import.");
    } finally {
      if (importAbortRef.current === controller) importBusyRef.current = false;
      if (accountRef.current === accountId && backendClient.auth.getSessionEpoch() === epoch) setStatus("");
    }
  }, [ensureTeam, rulesContext, session.user.id, showError]);

  const confirmImport = useCallback(async () => {
    if (!pendingImport || !importPreview || importPreview.issues.length > 0 || importPreview.rows.length === 0 || importBusyRef.current) return;
    if (!hasProSubscription) { onRequirePro("Roster import"); return; }
    const access = capturePaidAccess();
    const accountId = pendingImport.accountId;
    const epoch = backendClient.auth.getSessionEpoch();
    if (accountId !== session.user.id) return;
    importBusyRef.current = true;
    importAttemptedRef.current = true;
    const controller = new AbortController();
    importAbortRef.current = controller;
    const current = () => accountRef.current === accountId && backendClient.auth.getSessionEpoch() === epoch;
    setIsImportSaving(true);
    setStatus("Saving import...");
    try {
      requirePaidAccess();
      // Persist before dispatch. A lost response is reconciled using this same ID.
      const dispatched = { ...pendingImport, attempted: true };
      setPendingImport(dispatched);
      await savePendingRosterImport(dispatched);
      if (!current() || controller.signal.aborted) return;
      assertPaidAccess(access);
      const result = await backendClient.commitRosterImport(pendingImport.teamId, { operationId: pendingImport.operationId, rows: pendingImport.rows, rulesContext: pendingImport.rulesContext }, { signal: controller.signal });
      await clearPendingRosterImport(accountId);
      if (!current()) return;
      setPendingImport(null);
      setImportPreview(null);
      setImportVisible(false);
      assertPaidAccess(access);
      const nextRoster = await backendClient.getTeamRoster(pendingImport.teamId);
      if (!current()) return;
      setRoster(nextRoster);
      setActiveIds(new Set(nextRoster.filter(player => !player.benched).map(player => player.id)));
      setExpandedPlayers(new Set());
      toast.show({ message: `Imported ${result.createdCount} players. Skipped ${result.skippedSourceRows.length} already on this team.`, type: "success" });
    } catch (error) {
      const response = error as { context?: { body?: { detail?: { committed?: boolean } } } };
      if (response.context?.body?.detail?.committed === false) {
        try {
          await clearPendingRosterImport(accountId);
        } catch (storageError) {
          if (current()) showError(`No import was saved, but the saved preview could not be cleared. ${storageError instanceof Error ? storageError.message : "Try again."}`);
          return;
        }
        if (current()) {
          setPendingImport(null);
          setImportPreview(null);
          setImportVisible(false);
          importAttemptedRef.current = false;
          await loadRoster();
          if (current()) showError(`${error instanceof Error ? error.message : "Import was rejected."} No import was saved. Choose the file again.`);
        }
      } else if (current()) {
        showError(`${error instanceof Error ? error.message : "The save could not be confirmed."} Tap Import to retry this same operation; it will not add duplicates.`);
      }
    } finally {
      if (importAbortRef.current === controller) importBusyRef.current = false;
      if (current()) { setIsImportSaving(false); setStatus(""); }
    }
  }, [pendingImport, importPreview, hasProSubscription, onRequirePro, session.user.id, setRoster, showError, toast, loadRoster]);

  const closeImport = useCallback(() => {
    importAbortRef.current?.abort();
    setImportVisible(false);
    // An attempted save can already have committed. Preserve its durable receipt request.
    if (!importAttemptedRef.current && pendingImport) {
      void clearPendingRosterImport(pendingImport.accountId).catch(() => showError("The pending import could not be cleared. Try again."));
      setPendingImport(null);
      setImportPreview(null);
    }
  }, [pendingImport, showError]);

  const handleImportPress = useCallback(() => {
    if (!hasProSubscription) { onRequirePro("Roster import"); return; }
    void handleImportRoster();
  }, [hasProSubscription, onRequirePro, handleImportRoster]);

  const existingImportSkips = importPreview?.rows.filter(row => roster.some(player => normalizePlayerName(player.name) === normalizePlayerName(row.player.name))).length ?? 0;

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
                disabled={Boolean(status)}
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
      <Sheet visible={importVisible} onClose={closeImport} title="Review roster import">
        <View style={{ gap: space.md }}>
          <AppText variant="caption" color="secondary">{importPreview?.worksheet}</AppText>
          <AppText>{(importPreview?.rows.length ?? 0) - existingImportSkips} new players · {existingImportSkips} already on this team</AppText>
          {importPreview && importPreview.emptySourceRows.length > 0 ? <AppText variant="caption" color="secondary">{importPreview.emptySourceRows.length} empty rows skipped.</AppText> : null}
          {importAttemptedRef.current ? <AppText variant="caption" color="secondary">This operation may already have saved. Retry checks its result without adding duplicates.</AppText> : null}
          {importPreview && importPreview.issues.length > 0 ? (
            <ScrollView style={{ maxHeight: 180 }}>
              <AppText color="danger">Fix {importPreview.issues.length} row errors before importing.</AppText>
              {importPreview.issues.map(issue => <AppText key={`${issue.sourceRow}:${issue.column}:${issue.code}`} variant="caption">Row {issue.sourceRow}, {issue.column}: {issue.message}</AppText>)}
            </ScrollView>
          ) : null}
          <Button label={importAttemptedRef.current ? "Confirm saved import" : "Import players"} loading={isImportSaving} disabled={!importPreview || importPreview.rows.length === 0 || importPreview.issues.length > 0} onPress={() => { void confirmImport(); }} />
          <Button label={importAttemptedRef.current ? "Close" : "Cancel"} variant="ghost" onPress={closeImport} />
        </View>
      </Sheet>
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
