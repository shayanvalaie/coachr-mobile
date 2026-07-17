import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "../icons";
import LineUp from "../components/lineup/LineupGrid";
import { backendClient } from "../lib/backend/client";
import {
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
  BackendSession,
} from "../lib/backend/types";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  EmptyState,
  Input,
  ScreenContainer,
  ScreenHeader,
  SkeletonListRows,
} from "../components/ui";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
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
  onGenerateLineup: () => void;
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
  onGenerateLineup,
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

  const handleBack = useCallback(() => {
    if (selectedDetail) {
      setSelectedDetail(null);
      setStatus("");
      return;
    }
    onBack();
  }, [onBack, selectedDetail]);

  const profileButton = (
    <AppPressable
      onPress={onOpenProfile}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={styles.iconButton}
      hitSlop={8}
    >
      <Feather name="user" size={18} color={theme.text.primary} />
    </AppPressable>
  );

  const renderVersionRow = useCallback(
    ({ item: version }: { item: BackendLineupVersionSummary }) => {
      const isOpening = activeLineupId === version.id;
      const title = version.lineupName || `Lineup v${version.versionNumber}`;

      return (
        <AppPressable
          style={styles.row}
          onPress={() => openLineupDetail(version.id)}
          disabled={isOpening}
          pressScale={0.98}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          accessibilityState={{ disabled: isOpening, busy: isOpening }}
        >
          <View style={styles.rowMeta}>
            <AppText variant="body" family="heading">
              {title}
            </AppText>
            <AppText variant="caption" color="secondary">
              v{version.versionNumber} • {version.gameTitle || "General"} •{" "}
              {formatDateTime(version.createdAt)}
            </AppText>
          </View>
          {isOpening ? (
            <ActivityIndicator color={theme.accent.base} size="small" />
          ) : (
            <Feather name="chevron-right" size={18} color={theme.text.secondary} />
          )}
        </AppPressable>
      );
    },
    [activeLineupId, openLineupDetail],
  );

  if (selectedDetail) {
    return (
      <ScreenContainer scroll contentStyle={styles.content}>
        <ScreenHeader
          title="Lineup Detail"
          subtitle="Saved Lineup"
          onBack={handleBack}
          right={profileButton}
        />

        <Card variant="elevated">
          <View style={styles.cardInner}>
            <AppText variant="title" family="display">
              {selectedDetail.lineupName || `Lineup v${selectedDetail.versionNumber}`}
            </AppText>
            <AppText variant="caption" color="secondary">
              v{selectedDetail.versionNumber} • {selectedDetail.gameTitle || "General"}
            </AppText>
            <AppText variant="caption" color="secondary">
              {formatDateTime(selectedDetail.createdAt)}
            </AppText>
          </View>
        </Card>

        <Card>
          <View style={styles.cardInner}>
            <AppText variant="bodyLg" family="heading">
              Actions
            </AppText>
            <View style={styles.actionsRow}>
              <Button
                label="Export Excel"
                variant="secondary"
                size="sm"
                icon="download"
                onPress={() => {
                  if (!hasProSubscription) {
                    onRequirePro("Lineup exports");
                    return;
                  }
                  void exportLineupVersion(selectedDetail.id, "xlsx");
                }}
                disabled={activeLineupId === selectedDetail.id}
                accessibilityLabel="Export lineup to Excel"
              />
              <Button
                label="Export PDF"
                variant="secondary"
                size="sm"
                icon="file-text"
                onPress={() => {
                  if (!hasProSubscription) {
                    onRequirePro("Lineup exports");
                    return;
                  }
                  void exportLineupVersion(selectedDetail.id, "pdf");
                }}
                disabled={activeLineupId === selectedDetail.id}
                accessibilityLabel="Export lineup to PDF"
              />
            </View>
          </View>
        </Card>

        <Card>
          <View style={styles.cardInner}>
            <AppText variant="bodyLg" family="heading">
              Complete Lineup
            </AppText>
            <LineUp
              lineup={selectedRows}
              expandedInnings={new Set()}
              onToggleInning={() => {}}
              playerGenderByName={playerGenderByName}
            />
          </View>
        </Card>

        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}
        {status ? (
          <AppText variant="caption" color="success">
            {status}
          </AppText>
        ) : null}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <FlatList
        data={isLoading ? [] : filteredLineups}
        keyExtractor={(item) => item.id}
        renderItem={renderVersionRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ScreenHeader
              title="All Lineups"
              subtitle="Lineup History"
              onBack={handleBack}
              right={profileButton}
            />

            <Card variant="elevated">
              <View style={styles.cardInner}>
                <AppText variant="title" family="display">
                  Browse every saved lineup
                </AppText>
                <AppText variant="caption" color="secondary">
                  {isLoading ? "Loading..." : `${lineups.length} total saved versions`}
                </AppText>
              </View>
            </Card>

            <Button
              label="Generate"
              icon="zap"
              onPress={onGenerateLineup}
              accessibilityLabel="Generate a new lineup"
            />

            <Input
              label="Find lineup"
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, game, or version"
              autoCapitalize="none"
              accessibilityLabel="Search lineups"
            />

            <View style={styles.sectionRow}>
              <AppText variant="bodyLg" family="heading">
                Saved Versions
              </AppText>
              {isDetailLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={theme.accent.base} size="small" />
                  <AppText variant="caption" color="secondary">
                    Opening lineup...
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonListRows count={5} />
          ) : (
            <EmptyState
              icon={query.trim().length > 0 ? "search" : "layers"}
              title={
                query.trim().length > 0
                  ? "No lineups match this search"
                  : "No saved lineups yet"
              }
              body={
                query.trim().length > 0
                  ? "Try a different name, game, or version number."
                  : "Saved lineup versions will show up here."
              }
            />
          )
        }
        ListFooterComponent={
          <View style={styles.listFooter}>
            {error ? (
              <AppText variant="caption" color="danger">
                {error}
              </AppText>
            ) : null}
            {status ? (
              <AppText variant="caption" color="success">
                {status}
              </AppText>
            ) : null}
          </View>
        }
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.sm,
  },
  listContent: {
    gap: space.xs,
    paddingBottom: space.lg,
  },
  listHeader: {
    gap: space.sm,
    marginBottom: space.xxs,
  },
  listFooter: {
    gap: space.xxs,
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
  cardInner: {
    gap: space.xxs,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    padding: space.sm,
  },
  rowMeta: {
    flex: 1,
    gap: space.xxs,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
});

export default AllLineupsScreen;
