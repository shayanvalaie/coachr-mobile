import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  EmptyState,
  Input,
  LoadTransition,
  ScreenContainer,
  ScreenHeader,
  SkeletonListRows,
  useToast,
} from "../../components/ui";
import { backendClient } from "../../lib/backend/client";
import { BackendSession } from "../../lib/backend/types";
import { getSimilarLeaguesError, toError } from "../../lib/backend/utils";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { LeagueSummary, RulesetStatus } from "../../types/rules";

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenLeague: (leagueId: string) => void;
};

const SEARCH_DEBOUNCE_MS = 250;

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const statusLabel: Record<RulesetStatus, string | null> = {
  active: null,
  baking: "Setting up",
  review: "In review",
  rejected: "Unavailable",
};

export const LeagueRow = ({
  league,
  onPress,
}: {
  league: LeagueSummary;
  onPress: () => void;
}) => {
  const badge = statusLabel[league.status];
  return (
    <Card
      onPress={onPress}
      style={styles.row}
      accessibilityLabel={`${league.name}. ${capitalize(league.sport)}${league.region ? `, ${league.region}` : ""}. ${league.teamCount} teams.`}
    >
      <View style={styles.rowText}>
        <AppText variant="bodyLg" family="heading">
          {league.name}
        </AppText>
        <AppText variant="caption" color="secondary">
          {[capitalize(league.sport), league.region, `${league.teamCount} ${league.teamCount === 1 ? "team" : "teams"}`]
            .filter(Boolean)
            .join(" · ")}
        </AppText>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="caption" family="heading" color="accent">
            {badge}
          </AppText>
        </View>
      ) : null}
      <Feather name="chevron-right" size={18} color={theme.text.secondary} />
    </Card>
  );
};

const LeaguesScreen = ({ session, onBack, onOpenLeague }: Props) => {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeagueSummary[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [region, setRegion] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LeagueSummary[] | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const latestSearch = useRef(0);

  const runSearch = useCallback(async (term: string) => {
    const requestId = ++latestSearch.current;
    setIsSearching(true);
    try {
      const leagues = await backendClient.searchLeagues(term.trim());
      if (requestId !== latestSearch.current) return;
      setResults(leagues);
    } catch (err) {
      if (requestId !== latestSearch.current) return;
      toast.show({ message: toError(err).message, type: "error" });
    } finally {
      if (requestId === latestSearch.current) {
        setIsSearching(false);
        setHasSearched(true);
      }
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query);
    }, hasSearched ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
    // Only the query should retrigger the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, runSearch]);

  const openCreate = useCallback(() => {
    setShowCreate(true);
    if (!name && query.trim()) setName(query.trim());
  }, [name, query]);

  const createLeague = useCallback(
    async (confirmDistinct: boolean) => {
      const trimmedName = name.trim();
      const trimmedSport = sport.trim();
      const trimmedRules = rulesText.trim();
      if (trimmedName.length < 2) {
        setCreateError("Give the league a name.");
        return;
      }
      if (trimmedSport.length < 2) {
        setCreateError("Which sport is this league for?");
        return;
      }
      if (trimmedRules.length < 10) {
        setCreateError("Describe the league rules in a few sentences.");
        return;
      }
      setCreateError(null);
      setIsCreating(true);
      try {
        const league = await backendClient.createLeague({
          name: trimmedName,
          sport: trimmedSport,
          region: region.trim() || undefined,
          rulesText: trimmedRules,
          confirmDistinct,
        });
        setSuggestions(null);

        // The creator's team joins right away; the detail screen offers Leave.
        const teamId = await backendClient.getOrCreateTeam(session.user.id);
        if (teamId) {
          await backendClient.setTeamLeague(teamId, league.id);
        }
        toast.show({
          message:
            league.status === "active"
              ? `${league.name} is live. Your team joined.`
              : `${league.name} created. We'll email you when its rules are ready.`,
          type: "success",
        });
        setShowCreate(false);
        setName("");
        setSport("");
        setRegion("");
        setRulesText("");
        onOpenLeague(league.id);
      } catch (err) {
        const similar = getSimilarLeaguesError(err);
        if (similar) {
          setSuggestions(similar);
          return;
        }
        setCreateError(toError(err).message);
      } finally {
        setIsCreating(false);
      }
    },
    [name, onOpenLeague, region, rulesText, session.user.id, sport, toast],
  );

  return (
    <ScreenContainer keyboard scroll contentStyle={styles.content}>
      <AppPressable
        onPress={onBack}
        style={styles.backLink}
        accessibilityRole="button"
        accessibilityLabel="Back to rules"
        pressScale={1}
      >
        <Feather name="chevron-left" size={18} color={theme.text.secondary} />
        <AppText variant="body" color="secondary">
          Rules
        </AppText>
      </AppPressable>

      <ScreenHeader
        title="Leagues"
        subtitle="Join a league to share its rules, or start one for your area."
        right={
          showCreate ? null : (
            <Button
              label="New league"
              size="sm"
              icon="plus"
              onPress={openCreate}
              accessibilityLabel="Create a new league"
            />
          )
        }
      />

      {showCreate ? (
        <Card variant="elevated">
          <View style={styles.cardInner}>
            <View style={styles.rowBetween}>
              <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
                New league
              </AppText>
              <Button
                label="Cancel"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setShowCreate(false);
                  setSuggestions(null);
                  setCreateError(null);
                }}
                accessibilityLabel="Cancel creating a league"
              />
            </View>
            <AppText variant="title" family="heading">
              Start a shared league
            </AppText>
            <AppText variant="body" color="secondary">
              Every team that joins plays by these rules. Rules can't be edited after
              creation — changes go through a request so nobody's lineups break.
            </AppText>
            <Input
              label="League name"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setSuggestions(null);
              }}
              placeholder="Austin Coed Softball"
              accessibilityLabel="League name"
            />
            <View style={styles.fieldRow}>
              <Input
                label="Sport"
                value={sport}
                onChangeText={setSport}
                placeholder="softball"
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={styles.field}
                accessibilityLabel="Sport"
              />
              <Input
                label="Region (optional)"
                value={region}
                onChangeText={setRegion}
                placeholder="Austin, TX"
                containerStyle={styles.field}
                accessibilityLabel="Region"
              />
            </View>
            <Input
              label="League rules"
              value={rulesText}
              onChangeText={setRulesText}
              placeholder="7 innings, 10 on the field, at least 3 women, nobody sits twice in a row…"
              multiline
              textAlignVertical="top"
              style={styles.textarea}
              error={createError}
              accessibilityLabel="League rules"
            />

            {suggestions ? (
              <View style={styles.suggestions}>
                <AppText variant="bodyLg" family="heading">
                  Did you mean one of these?
                </AppText>
                <AppText variant="caption" color="secondary">
                  A league with a similar name already exists. Join it instead, or
                  create yours anyway.
                </AppText>
                {suggestions.map((league) => (
                  <LeagueRow
                    key={league.id}
                    league={league}
                    onPress={() => onOpenLeague(league.id)}
                  />
                ))}
                <Button
                  label="Create anyway"
                  variant="secondary"
                  onPress={() => void createLeague(true)}
                  loading={isCreating}
                  fullWidth
                  accessibilityLabel="Create this league anyway"
                />
              </View>
            ) : (
              <Button
                label="Create league"
                icon="check"
                onPress={() => void createLeague(false)}
                loading={isCreating}
                fullWidth
                accessibilityLabel="Create league"
              />
            )}
          </View>
        </Card>
      ) : null}

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search by league name or region"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        left={<Feather name="search" size={16} color={theme.text.secondary} />}
        accessibilityLabel="Search leagues"
      />

      <LoadTransition
        loading={isSearching && !hasSearched}
        style={styles.results}
        skeleton={<SkeletonListRows count={4} />}
      >
        {results.length > 0 ? (
          results.map((league) => (
            <LeagueRow key={league.id} league={league} onPress={() => onOpenLeague(league.id)} />
          ))
        ) : (
          <Card variant="outline" padding="xxs">
            <EmptyState
              icon="users"
              title={query.trim() ? "No leagues match" : "No leagues yet"}
              body={
                query.trim()
                  ? "Try a shorter name, or be the first to create it."
                  : "Be the first to set up a league for your area."
              }
              action={showCreate ? undefined : { label: "Create a league", onPress: openCreate }}
            />
          </Card>
        )}
      </LoadTransition>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.sm,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xxs,
    minHeight: 32,
  },
  cardInner: {
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  field: {
    flex: 1,
  },
  textarea: {
    minHeight: 110,
  },
  suggestions: {
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
    paddingTop: space.sm,
  },
  results: {
    gap: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
    paddingHorizontal: space.xs,
    minHeight: 24,
    justifyContent: "center",
  },
});

export default LeaguesScreen;
