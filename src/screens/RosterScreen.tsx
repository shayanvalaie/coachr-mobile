import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as DocumentPicker from "expo-document-picker";
import * as XLSX from "xlsx";
import DraggablePlayerList from "../components/DraggablePlayerList";
import { backendClient } from "../lib/backend/client";
import { BackendSession } from "../lib/backend/types";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
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
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [lineupSlots, setLineupSlots] = useState<string[]>(
    defaultTeamRulesConfig.lineupSlots,
  );
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(
    new Set(),
  );
  const [isDraggingPlayers, setIsDraggingPlayers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;

    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;

    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadRoster = useCallback(async () => {
    try {
      setError(null);
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
      setError("Unable to load roster from server.");
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadRoster().catch(() => {
      setError("Unable to load roster from server.");
    });
  }, [loadRoster]);

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

  const removePlayer = useCallback((id: string) => {
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
  }, []);

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
        setError("Unable to ensure team for saving.");
        return;
      }

      const { id: idToUse } = await backendClient.saveTeamPlayer(team, player);
      if (idToUse === player.id) return;

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
        const next = new Set(prev);
        next.delete(player.id);
        next.add(idToUse);
        return next;
      });
    },
    [ensureTeam],
  );

  const handleSavePlayer = useCallback(
    async (id: string) => {
      const player = roster.find((p) => p.id === id);
      if (!player) return;

      setIsSaving(true);
      setStatus("");
      setError(null);
      try {
        await savePlayer(player);
        setStatus("Player saved.");
      } catch (_err) {
        setError("Failed to save player.");
      } finally {
        setIsSaving(false);
      }
    },
    [roster, savePlayer],
  );

  const handleSaveAll = useCallback(async () => {
    setIsSaving(true);
    setStatus("");
    setError(null);
    try {
      for (const player of roster) {
        // eslint-disable-next-line no-await-in-loop
        await savePlayer(player);
      }
      setStatus("Roster saved.");
    } catch (_err) {
      setError("Failed to save all players.");
    } finally {
      setIsSaving(false);
    }
  }, [roster, savePlayer]);

  const handleImportRoster = useCallback(async () => {
    setStatus("Importing roster...");
    setError(null);

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
      setError(
        "Unable to read the file. Make sure it is a valid Excel spreadsheet.",
      );
      setStatus("");
      return;
    }

    if (importedPlayers.length === 0) {
      setError("No players found in the uploaded file.");
      setStatus("");
      return;
    }

    const duplicateNames = findDuplicatePlayerNames(importedPlayers);
    if (duplicateNames.length > 0) {
      setError(
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
        setError("Unable to load your team.");
        setStatus("");
        return;
      }
      existingRoster = await backendClient.getTeamRoster(team);
    } catch (_err) {
      setError(
        "Unable to reach the server. Check your connection and try again.",
      );
      setStatus("");
      return;
    }

    const existingDuplicates = findDuplicatePlayerNames(existingRoster);
    if (existingDuplicates.length > 0) {
      setError(
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
      setStatus(summary);
      Alert.alert("Import complete", summary);
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
    setStatus(summary);
    if (failedNames.length > 0 && savedCount === 0) {
      setError(
        `Failed to save imported players. Check your connection and try again.`,
      );
      setStatus("");
    } else {
      Alert.alert("Import complete", summary);
    }
  }, [ensureTeam]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      scrollEnabled={!isDraggingPlayers}
    >
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onBack}
        >
          <Feather name="arrow-left" size={18} color={palette.text} />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow}>Roster Workspace</Text>
          <Text style={styles.headerTitle}>Roster Builder</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onOpenProfile}
        >
          <Feather name="user" size={18} color={palette.text} />
        </Pressable>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Roster</Text>
        <Text style={styles.heroSubtext}>
          Manage players and keep your game-day list ready.
        </Text>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Total Players</Text>
            <Text style={styles.metricValue}>{roster.length}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Active</Text>
            <Text style={styles.metricValue}>{activeCount}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsCard}>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            styles.actionButton,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => {
            if (!hasProSubscription) {
              onRequirePro("Roster import");
              return;
            }
            void handleImportRoster();
          }}
        >
          <Text style={styles.secondaryText}>Import</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            styles.actionButton,
            pressed && { opacity: 0.85 },
            isSaving && { opacity: 0.7 },
          ]}
          onPress={handleSaveAll}
          disabled={isSaving}
        >
          <Text style={styles.secondaryText}>
            {isSaving ? "Saving..." : "Save all"}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            styles.actionButton,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleAddPlayer}
        >
          <Text style={styles.secondaryText}>Add player</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            styles.actionButton,
            pressed && { opacity: 0.85 },
          ]}
          onPress={onOpenLineupPage}
        >
          <Text style={styles.primaryText}>Generate</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.listWrap}>
        <DraggablePlayerList
          players={roster}
          expandedPlayers={expandedPlayers}
          activeIds={activeIds}
          isSaving={isSaving}
          lineupSlots={lineupSlots}
          onDragStateChange={setIsDraggingPlayers}
          onReorderPlayers={handleReorderPlayers}
          onToggleExpand={togglePlayer}
          onToggleActive={handleToggleActive}
          onUpdatePlayer={updatePlayer}
          onRemovePlayer={removePlayer}
          onSavePlayer={handleSavePlayer}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    padding: 16,
    paddingBottom: 28,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  headerTextWrap: {
    alignItems: "center",
    gap: 2,
  },
  headerEyebrow: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 24,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cardAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroCard: {
    backgroundColor: palette.cardAlt,
    borderRadius: 20,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 22,
  },
  heroSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  metric: {
    flex: 1,
    minWidth: 120,
    backgroundColor: palette.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricLabel: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  metricValue: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 15,
    marginTop: 2,
  },
  actionsCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minWidth: 98,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: palette.cardAlt,
  },
  secondaryText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
    textAlign: "center",
  },
  primaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.6)",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: palette.accent,
  },
  primaryText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 13,
    textAlign: "center",
  },
  listWrap: {
    gap: 10,
  },
  error: {
    color: palette.danger,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  status: {
    color: palette.success,
    fontFamily: typeface.body,
    fontSize: 12,
  },
});

export default RosterScreen;
