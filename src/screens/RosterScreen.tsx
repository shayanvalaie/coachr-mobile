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
import * as DocumentPicker from "expo-document-picker";
import * as XLSX from "xlsx";
import DraggablePlayerList from "../components/DraggablePlayerList";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  EmptyState,
  LoadTransition,
  MetricTile,
  ScreenContainer,
  ScreenHeader,
  SkeletonListRows,
  SkeletonMetricRow,
  useToast,
} from "../components/ui";
import { Feather } from "../icons";
import { backendClient } from "../lib/backend/client";
import { BackendSession } from "../lib/backend/types";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { Player } from "../types/lineup";
import { defaultTeamRulesConfig, parseTeamRulesConfig } from "../types/rules";
import { buildPlayersFromRows, createPlayer } from "../utils/lineupGenerator";
import {
  findDuplicatePlayerNames,
  normalizePlayerName,
} from "../utils/playerNames";

const FileSystem = require("expo-file-system/legacy") as {
  readAsStringAsync: (
    uri: string,
    options: {
      encoding: string;
    },
  ) => Promise<string>;
};

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenLineupPage: () => void;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
};

const RosterScreen = ({
  session,
  onBack,
  onOpenProfile,
  onOpenLineupPage,
  hasProSubscription,
  onRequirePro,
}: Props) => {
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

      const [nextRoster, rawRules] = await Promise.all([
        backendClient.getTeamRoster(team),
        backendClient.getTeamRules(team),
      ]);
      setRoster(nextRoster);
      setLineupSlots(parseTeamRulesConfig(rawRules).lineupSlots);
      setActiveIds(new Set(nextRoster.map((p) => p.id)));
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

  const activeCount = useMemo(
    () => roster.filter((player) => activeIds.has(player.id)).length,
    [roster, activeIds],
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

  const handleToggleActive = useCallback((id: string, checked: boolean) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleReorderPlayers = useCallback((nextPlayers: Player[]) => {
    setRoster(nextPlayers);
  }, []);

  const savePlayer = useCallback(
    async (player: Player) => {
      const team = await ensureTeam();
      if (!team) {
        showError("Unable to ensure team for saving.");
        return;
      }

      const { id: idToUse } = await backendClient.saveTeamPlayer(team, player);

      if (idToUse !== player.id) {
        setRoster((prev) =>
          prev.map((p) =>
            p.id === player.id ? { ...player, id: idToUse } : p,
          ),
        );
        setActiveIds((prev) => {
          const next = new Set(prev);
          next.delete(player.id);
          next.add(idToUse);
          return next;
        });
      }

      // Collapse the card once the player is saved.
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedPlayers((prev) => {
        if (!prev.has(player.id) && !prev.has(idToUse)) return prev;
        const next = new Set(prev);
        next.delete(player.id);
        next.delete(idToUse);
        return next;
      });
    },
    [ensureTeam, showError],
  );

  const handleSavePlayer = useCallback(
    async (id: string) => {
      const player = roster.find((p) => p.id === id);
      if (!player) return;

      setIsSaving(true);
      setStatus("");
      try {
        await savePlayer(player);
        toast.show({ message: "Player saved.", type: "success" });
      } catch (_err) {
        showError("Failed to save player.");
      } finally {
        setIsSaving(false);
      }
    },
    [roster, savePlayer, showError, toast],
  );

  const handleSaveAll = useCallback(async () => {
    setIsSaving(true);
    setStatus("");
    try {
      for (const player of roster) {
        // eslint-disable-next-line no-await-in-loop
        await savePlayer(player);
      }
      toast.show({ message: "Roster saved.", type: "success" });
    } catch (_err) {
      showError("Failed to save all players.");
    } finally {
      setIsSaving(false);
    }
  }, [roster, savePlayer, showError, toast]);

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

  const handleImportRoster = useCallback(async () => {
    setStatus("Importing roster...");

    // --- Parse phase ---
    let importedPlayers;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/octet-stream",
        ],
      });
      if (result.canceled || !result.assets?.length) {
        setStatus("");
        return;
      }

      const asset = result.assets[0];
      const fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: "base64",
      });
      const workbook = XLSX.read(fileBase64, { type: "base64" });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];
      importedPlayers = buildPlayersFromRows(rows);
    } catch (_err) {
      showError(
        "Unable to read the file. Make sure it is a valid Excel spreadsheet.",
      );
      setStatus("");
      return;
    }

    if (importedPlayers.length === 0) {
      showError("No players found in the uploaded file.");
      setStatus("");
      return;
    }

    const duplicateNames = findDuplicatePlayerNames(importedPlayers);
    if (duplicateNames.length > 0) {
      showError(
        `Duplicate player names found in sheet: ${duplicateNames.join(", ")}.`,
      );
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
      setActiveIds(new Set(nextRoster.map((p) => p.id)));
      setExpandedPlayers(new Set());
      const summary = `No new players imported. ${duplicateExistingNames.length} already exist for this team.`;
      setStatus("");
      toast.show({ message: summary, type: "info" });
      return;
    }

    setStatus(`Saving ${playersToCreate.length} players...`);
    const savedIds = new Set<string>();
    const failedNames: string[] = [];
    for (const player of playersToCreate) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const saved = await backendClient.saveTeamPlayer(team, player);
        savedIds.add(saved.id);
      } catch (_err) {
        failedNames.push(player.name);
      }
    }

    const nextRoster = await backendClient.getTeamRoster(team);
    setRoster(nextRoster);
    setActiveIds(new Set(nextRoster.map((p) => p.id)));
    // Only expand the newly saved players so users can review them.
    // Pre-existing players stay collapsed and the "Save player" buttons
    // on new cards are not shown until the user explicitly expands them.
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
        <ScreenHeader
          title="Roster Builder"
          subtitle="Manage players and keep your game-day list ready."
          onBack={onBack}
          right={
            <AppPressable
              onPress={onOpenProfile}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={styles.iconButton}
              hitSlop={8}
            >
              <Feather name="user" size={18} color={theme.text.primary} />
            </AppPressable>
          }
        />

        <LoadTransition
          loading={isLoading}
          skeleton={<SkeletonMetricRow count={2} height={67} />}
        >
          <View style={styles.metricsRow}>
            <MetricTile label="Total players" value={roster.length} small />
            <MetricTile label="Active" value={activeCount} small />
          </View>
        </LoadTransition>

        <Card padding="sm" style={styles.actionsCard}>
          <View style={styles.actionsRow}>
            <View style={styles.actionItem}>
              <Button
                label="Import"
                variant="secondary"
                size="sm"
                icon="upload"
                onPress={handleImportPress}
              />
            </View>
            <View style={styles.actionItem}>
              <Button
                label="Save all"
                variant="secondary"
                size="sm"
                icon="save"
                onPress={handleSaveAll}
                loading={isSaving}
              />
            </View>
            <View style={styles.actionItem}>
              <Button
                label="Add player"
                variant="secondary"
                size="sm"
                icon="plus"
                onPress={handleAddPlayer}
              />
            </View>
          </View>
          <View style={styles.actionsRow}>
            <View style={styles.actionItem}>
              <Button
                label="Delete all"
                variant="danger"
                icon="trash-2"
                onPress={handleRemoveAll}
                disabled={roster.length === 0}
              />
            </View>
            <View style={styles.actionItemWide}>
              <Button
                label="Generate"
                variant="primary"
                icon="zap"
                onPress={onOpenLineupPage}
              />
            </View>
          </View>
        </Card>

        {status ? (
          <AppText variant="caption" color="secondary">
            {status}
          </AppText>
        ) : null}

        <LoadTransition
          loading={isLoading}
          skeleton={<SkeletonListRows count={5} />}
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
    paddingBottom: space.lg,
    gap: space.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  metricsRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  actionsCard: {
    gap: space.xs,
  },
  actionsRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  actionItem: {
    flex: 1,
  },
  actionItemWide: {
    flex: 2,
  },
});

export default RosterScreen;
