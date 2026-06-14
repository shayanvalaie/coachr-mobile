import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import LineUp from "../components/LineUp";
import { backendClient } from "../lib/backend/client";
import {
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
  BackendSession,
} from "../lib/backend/types";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { InningAssignment } from "../types/lineup";
import { buildPlayerGenderByName } from "../utils/playerNames";

const FileSystem = require("expo-file-system/legacy") as {
  cacheDirectory?: string | null;
  documentDirectory?: string | null;
  writeAsStringAsync: (
    uri: string,
    data: string,
    options: {
      encoding: string;
    },
  ) => Promise<void>;
};

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenProfile: () => void;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeLineupRows = (
  rows: Record<string, unknown>[] | undefined,
): InningAssignment[] => {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row, index) => {
      const inningRaw = row?.inning;
      const inning =
        typeof inningRaw === "number" && Number.isFinite(inningRaw)
          ? inningRaw
          : index + 1;

      const positionsRaw =
        row && typeof row === "object" && typeof row.positions === "object" && row.positions
          ? (row.positions as Record<string, unknown>)
          : {};
      const positions = Object.entries(positionsRaw).reduce(
        (acc, [slot, player]) => {
          const slotName = String(slot).trim();
          if (!slotName) return acc;
          if (typeof player === "string" && player.trim()) {
            acc[slotName] = player.trim();
          } else if (player == null) {
            acc[slotName] = null;
          } else {
            acc[slotName] = String(player);
          }
          return acc;
        },
        {} as Record<string, string | null>,
      );

      const benchRaw =
        row && typeof row === "object" && Array.isArray(row.bench) ? row.bench : [];
      const bench = benchRaw
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim())
        .filter(Boolean);

      const droppedPosition =
        typeof row.droppedPosition === "string" ? row.droppedPosition : undefined;

      return { inning, positions, bench, droppedPosition };
    })
    .sort((a, b) => a.inning - b.inning);
};

const AllLineupsScreen = ({
  session,
  onBack,
  onOpenProfile,
  hasProSubscription,
  onRequirePro,
}: Props) => {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [lineups, setLineups] = useState<BackendLineupVersionSummary[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<BackendLineupVersionDetail | null>(null);
  const [playerGenderByName, setPlayerGenderByName] = useState<
    Record<string, "male" | "female">
  >({});
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [activeLineupId, setActiveLineupId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;
    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;
    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadLineups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setStatus("");
    try {
      const team = await ensureTeam();
      if (!team) return;
      const [versions, roster] = await Promise.all([
        backendClient.getLineupVersions(team),
        backendClient.getTeamRoster(team).catch(() => null),
      ]);
      setLineups(versions);
      setPlayerGenderByName(roster ? buildPlayerGenderByName(roster) : {});
    } catch (_err) {
      setError("Unable to load lineup history.");
    } finally {
      setIsLoading(false);
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadLineups().catch(() => {
      setError("Unable to load lineup history.");
      setIsLoading(false);
    });
  }, [loadLineups]);

  const filteredLineups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...lineups].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (!term) return sorted;

    return sorted.filter((lineup) => {
      const name = lineup.lineupName.toLowerCase();
      const game = lineup.gameTitle.toLowerCase();
      const version = `v${lineup.versionNumber}`;
      return (
        name.includes(term) ||
        game.includes(term) ||
        version.includes(term)
      );
    });
  }, [lineups, query]);

  const selectedRows = useMemo(
    () =>
      selectedDetail
        ? normalizeLineupRows(selectedDetail.rows as Record<string, unknown>[])
        : null,
    [selectedDetail],
  );

  const openLineupDetail = useCallback(
    async (lineupId: string) => {
      try {
        const team = await ensureTeam();
        if (!team) return;
        setActiveLineupId(lineupId);
        setIsDetailLoading(true);
        setError(null);
        const detail = await backendClient.getLineupVersion(team, lineupId);
        setSelectedDetail(detail);
      } catch (_err) {
        setError("Unable to open lineup.");
      } finally {
        setIsDetailLoading(false);
        setActiveLineupId(null);
      }
    },
    [ensureTeam],
  );

  const exportLineupVersion = useCallback(
    async (lineupId: string, format: "xlsx" | "pdf") => {
      try {
        const team = await ensureTeam();
        if (!team) return;
        setActiveLineupId(lineupId);
        setError(null);
        const exported = await backendClient.exportLineupVersion(team, lineupId, format);
        const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!baseDir) {
          throw new Error("No writable directory available for export.");
        }

        const uri = `${baseDir}${Date.now()}-${exported.fileName}`;
        await FileSystem.writeAsStringAsync(uri, exported.base64Data, {
          encoding: "base64",
        });
        await Share.share({
          title: exported.fileName,
          message: `Lineup export: ${exported.fileName}`,
          url: uri,
        });
        setStatus(`${format.toUpperCase()} exported.`);
      } catch (_err) {
        setError(`Unable to export ${format.toUpperCase()}.`);
      } finally {
        setActiveLineupId(null);
      }
    },
    [ensureTeam],
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          onPress={() => {
            if (selectedDetail) {
              setSelectedDetail(null);
              setStatus("");
              return;
            }
            onBack();
          }}
        >
          <Feather name="arrow-left" size={18} color={palette.text} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow}>
            {selectedDetail ? "Saved Lineup" : "Lineup History"}
          </Text>
          <Text style={styles.headerTitle}>
            {selectedDetail ? "Lineup Detail" : "All Lineups"}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          onPress={onOpenProfile}
        >
          <Feather name="user" size={18} color={palette.text} />
        </Pressable>
      </View>

      {selectedDetail ? (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>
              {selectedDetail.lineupName || `Lineup v${selectedDetail.versionNumber}`}
            </Text>
            <Text style={styles.heroSubtext}>
              v{selectedDetail.versionNumber} • {selectedDetail.gameTitle || "General"}
            </Text>
            <Text style={styles.heroSubtext}>{formatDateTime(selectedDetail.createdAt)}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actions</Text>
            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85 },
                  activeLineupId === selectedDetail.id && { opacity: 0.7 },
                ]}
                onPress={() => {
                  if (!hasProSubscription) {
                    onRequirePro("Lineup exports");
                    return;
                  }
                  void exportLineupVersion(selectedDetail.id, "xlsx");
                }}
                disabled={activeLineupId === selectedDetail.id}
              >
                <Text style={styles.secondaryText}>Export Excel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85 },
                  activeLineupId === selectedDetail.id && { opacity: 0.7 },
                ]}
                onPress={() => {
                  if (!hasProSubscription) {
                    onRequirePro("Lineup exports");
                    return;
                  }
                  void exportLineupVersion(selectedDetail.id, "pdf");
                }}
                disabled={activeLineupId === selectedDetail.id}
              >
                <Text style={styles.secondaryText}>Export PDF</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Complete Lineup</Text>
            <LineUp
              lineup={selectedRows}
              expandedInnings={new Set()}
              onToggleInning={() => {}}
              playerGenderByName={playerGenderByName}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Browse every saved lineup</Text>
            <Text style={styles.heroSubtext}>
              {isLoading ? "Loading..." : `${lineups.length} total saved versions`}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Find lineup</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, game, or version"
              placeholderTextColor={palette.subtext}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Saved Versions</Text>
              {isLoading ? <ActivityIndicator color={palette.accent} size="small" /> : null}
            </View>

            {isDetailLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={palette.accent} size="small" />
                <Text style={styles.subtleText}>Opening lineup...</Text>
              </View>
            ) : null}

            {!isLoading && filteredLineups.length === 0 ? (
              <Text style={styles.subtleText}>
                {query.trim().length > 0
                  ? "No lineups match this search."
                  : "No saved lineups yet."}
              </Text>
            ) : (
              <View style={styles.list}>
                {filteredLineups.map((version) => (
                  <Pressable
                    key={version.id}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { opacity: 0.85 },
                      activeLineupId === version.id && { opacity: 0.65 },
                    ]}
                    onPress={() => openLineupDetail(version.id)}
                    disabled={activeLineupId === version.id}
                  >
                    <View style={styles.rowContent}>
                      <View style={styles.rowMeta}>
                        <Text style={styles.rowTitle}>
                          {version.lineupName || `Lineup v${version.versionNumber}`}
                        </Text>
                        <Text style={styles.rowSubtext}>
                          v{version.versionNumber} • {version.gameTitle || "General"} •{" "}
                          {formatDateTime(version.createdAt)}
                        </Text>
                      </View>
                      {activeLineupId === version.id ? (
                        <ActivityIndicator color={palette.accent} size="small" />
                      ) : (
                        <Feather name="chevron-right" size={18} color={palette.subtext} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {status ? <Text style={styles.statusText}>{status}</Text> : null}
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
    gap: 12,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cardAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroCard: {
    backgroundColor: palette.cardAlt,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 22,
  },
  heroSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 15,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    color: palette.text,
    fontFamily: typeface.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: {
    gap: 8,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 14,
  },
  rowSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  subtleText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  errorText: {
    color: palette.danger,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  statusText: {
    color: palette.success,
    fontFamily: typeface.body,
    fontSize: 12,
  },
});

export default AllLineupsScreen;
