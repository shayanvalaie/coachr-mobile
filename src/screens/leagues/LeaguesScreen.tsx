import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  ListGroup,
  LoadTransition,
  PageHeader,
  ScreenContainer,
  SkeletonListRows,
  SportPicker,
  useToast,
} from "../../components/ui";
import { backendClient } from "../../lib/backend/client";
import { trace } from "../../lib/backend/trace";
import { BackendSession } from "../../lib/backend/types";
import { getSimilarLeaguesError, toError } from "../../lib/backend/utils";
import PlaceSearch from "../../components/PlaceSearch";
import { PlaceValue } from "../../lib/placeSearch";
import { useRulesetStatus } from "../../lib/rulesetStatus/RulesetStatusProvider";
import { theme } from "../../theme/colors";
import { space } from "../../theme/tokens";
import { LeagueSuggestion, LeagueSummary } from "../../types/rules";
import { digitsOnly, parseCount } from "../../utils/formNumbers";
import LeagueRow, { describeMatchReasons } from "./LeagueRow";

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenLeague: (leagueId: string) => void;
};

const SEARCH_DEBOUNCE_MS = 250;

const LeaguesScreen = ({ session, onBack, onOpenLeague }: Props) => {
  const toast = useToast();
  const rulesetStatus = useRulesetStatus();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeagueSummary[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [sport, setSport] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceValue | null>(null);
  const [segmentCount, setSegmentCount] = useState("");
  const [playersOnField, setPlayersOnField] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LeagueSuggestion[] | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Mirrors the server's validation so the button only enables for a payload
  // that will pass it.
  const parsedSegmentCount = parseCount(segmentCount);
  const parsedPlayersOnField = parseCount(playersOnField);
  const formValid =
    name.trim().length >= 2 &&
    sport !== null &&
    place !== null &&
    parsedSegmentCount !== null &&
    parsedPlayersOnField !== null &&
    rulesText.trim().length >= 10;

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

  const closeCreate = useCallback(() => {
    setShowCreate(false);
    setSuggestions(null);
    setCreateError(null);
  }, []);

  const createLeague = useCallback(
    async (confirmDistinct: boolean) => {
      if (
        !formValid ||
        sport === null ||
        place === null ||
        parsedSegmentCount === null ||
        parsedPlayersOnField === null
      ) {
        return;
      }
      setCreateError(null);
      setIsCreating(true);
      trace("leagues screen create submit", { name, sport, place, segmentCount, playersOnField, confirmDistinct });
      try {
        const league = await backendClient.createLeague({
          name: name.trim(),
          sport,
          city: place.city,
          state: place.state,
          zip: place.zip,
          segmentCount: parsedSegmentCount,
          playersOnField: parsedPlayersOnField,
          rulesText: rulesText.trim(),
          confirmDistinct,
        });
        setSuggestions(null);

        // The creator's team joins right away; the detail screen offers Leave.
        const teamId = await backendClient.getOrCreateTeam(session.user.id);
        if (teamId) {
          await backendClient.setTeamLeague(teamId, league.id);
          void rulesetStatus.refresh();
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
        setSport(null);
        setPlace(null);
        setSegmentCount("");
        setPlayersOnField("");
        setRulesText("");
        onOpenLeague(league.id);
      } catch (err) {
        const similar = getSimilarLeaguesError(err);
        trace("leagues screen create failed", {
          similar: similar?.map((league) => ({ id: league.id, name: league.name, matchReasons: league.matchReasons })) ?? null,
          error: similar ? null : toError(err).message,
        });
        if (similar) {
          setSuggestions(similar);
          return;
        }
        setCreateError(toError(err).message);
      } finally {
        setIsCreating(false);
      }
    },
    [
      formValid,
      name,
      onOpenLeague,
      parsedPlayersOnField,
      parsedSegmentCount,
      place,
      rulesText,
      rulesetStatus,
      session.user.id,
      sport,
      toast,
    ],
  );

  if (showCreate) {
    return (
      <ScreenContainer keyboard scroll contentStyle={styles.content}>
        <PageHeader
          back={{ label: "Leagues", onPress: closeCreate }}
          eyebrow="New league"
          title="Start a shared league"
          subtitle="Every team that joins plays by these rules. Changes go through a request so nobody's lineups break."
        />

        <Card>
          <View style={styles.cardInner}>
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
            <SportPicker
              value={sport}
              onChange={(code) => {
                setSport(code);
                setSuggestions(null);
              }}
            />
            <PlaceSearch
              value={place}
              onChange={(next) => {
                setPlace(next);
                setSuggestions(null);
              }}
            />
            <View style={styles.fieldRow}>
              <Input
                label="Innings or periods"
                value={segmentCount}
                onChangeText={(value) => setSegmentCount(digitsOnly(value, 2))}
                placeholder="7"
                keyboardType="number-pad"
                maxLength={2}
                containerStyle={styles.field}
                accessibilityLabel="Innings or periods"
              />
              <Input
                label="Players on field"
                value={playersOnField}
                onChangeText={(value) => setPlayersOnField(digitsOnly(value, 2))}
                placeholder="10"
                keyboardType="number-pad"
                maxLength={2}
                containerStyle={styles.field}
                accessibilityLabel="Players on the field"
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
              hint="Simple rules go live instantly. Unusual ones get a custom engine built in a few minutes."
              accessibilityLabel="League rules"
            />

            {suggestions ? (
              <View style={styles.suggestions}>
                <AppText variant="bodyLg" family="heading">
                  Is your league one of these?
                </AppText>
                <AppText variant="caption" color="secondary">
                  Same sport in your zip, or a similar name. Join it, or confirm yours
                  is different.
                </AppText>
                <ListGroup>
                  {suggestions.map((league) => (
                    <LeagueRow
                      key={league.id}
                      league={league}
                      tags={describeMatchReasons(league.matchReasons)}
                      onPress={() => onOpenLeague(league.id)}
                    />
                  ))}
                </ListGroup>
                <Button
                  label="Create anyway"
                  variant="secondary"
                  onPress={() => void createLeague(true)}
                  loading={isCreating}
                  disabled={!formValid}
                  fullWidth
                  accessibilityLabel="Create this league anyway"
                />
              </View>
            ) : (
              <Button
                label="Create league"
                size="lg"
                onPress={() => void createLeague(false)}
                loading={isCreating}
                disabled={!formValid}
                fullWidth
                accessibilityLabel="Create league"
              />
            )}
          </View>
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboard scroll contentStyle={styles.content}>
      <PageHeader
        back={{ label: "Rules", onPress: onBack }}
        eyebrow="Leagues"
        title="Find yours"
        right={
          <IconButton
            icon="plus"
            variant="accent"
            onPress={openCreate}
            accessibilityLabel="Create a new league"
          />
        }
      />

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, city, or zip"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        highlighted={query.trim().length > 0}
        left={<Feather name="search" size={16} color={theme.accent.base} />}
        accessibilityLabel="Search leagues"
      />

      <LoadTransition
        loading={isSearching && !hasSearched}
        skeleton={<SkeletonListRows count={4} height={60} />}
      >
        {results.length > 0 ? (
          <ListGroup>
            {results.map((league) => (
              <LeagueRow
                key={league.id}
                league={league}
                onPress={() => onOpenLeague(league.id)}
              />
            ))}
          </ListGroup>
        ) : (
          <Card padding="xxs">
            <EmptyState
              icon="users"
              title={query.trim() ? "No leagues match" : "No leagues yet"}
              body={
                query.trim()
                  ? "Try a shorter name, or be the first to create it."
                  : "Be the first to set up a league for your area."
              }
              action={{ label: "Create a league", onPress: openCreate }}
            />
          </Card>
        )}
      </LoadTransition>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.md,
  },
  cardInner: {
    gap: space.sm,
  },
  fieldRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  field: {
    flex: 1,
  },
  textarea: {
    minHeight: 120,
  },
  suggestions: {
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
    paddingTop: space.sm,
  },
});

export default LeaguesScreen;
