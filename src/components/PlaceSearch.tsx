import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Feather } from "../icons";
import {
  CityChoice,
  cityLabel,
  listCityZips,
  placeLabel,
  PlaceValue,
  useCitySearch,
} from "../lib/placeSearch";
import { theme } from "../theme/colors";
import { space } from "../theme/tokens";
import { AppText, Input, ListGroup, ListRow } from "./ui";

type Props = {
  value: PlaceValue | null;
  onChange: (place: PlaceValue | null) => void;
};

const MAX_ZIP_ROWS = 8;

type ZipListing =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; zips: string[] }
  | { status: "unavailable" };

// The league's one address field. Typing a city suggests cities; picking one
// lists that city's zips (narrowed by any digits typed after it); picking a zip
// resolves the field to "City, ST 12345". Typing five digits resolves directly.
const PlaceSearch = ({ value, onChange }: Props) => {
  const [text, setText] = useState(value ? placeLabel(value) : "");
  const [cityChoice, setCityChoice] = useState<CityChoice | null>(null);
  const [zipListing, setZipListing] = useState<ZipListing>({ status: "idle" });

  const chosenPrefix = cityChoice ? `${cityLabel(cityChoice)} ` : null;
  const typedAfterCity =
    chosenPrefix && text.startsWith(chosenPrefix) ? text.slice(chosenPrefix.length).trim() : null;
  const stillChoosingZip = cityChoice !== null && typedAfterCity !== null;

  const search = useCitySearch(text, value === null && !stillChoosingZip);

  useEffect(() => {
    if (!cityChoice) {
      setZipListing({ status: "idle" });
      return;
    }
    let cancelled = false;
    setZipListing({ status: "loading" });
    listCityZips(cityChoice)
      .then((zips) => {
        if (cancelled) return;
        if (zips.length === 1) {
          resolve({ ...cityChoice, zip: zips[0] });
          return;
        }
        setZipListing({ status: "ready", zips });
      })
      .catch(() => {
        if (!cancelled) setZipListing({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
    // resolve is stable for a given onChange; the listing depends only on the city.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityChoice]);

  const resolve = (place: PlaceValue) => {
    setText(placeLabel(place));
    setCityChoice(null);
    onChange(place);
  };

  const chooseCity = (choice: CityChoice) => {
    setText(`${cityLabel(choice)} `);
    setCityChoice(choice);
  };

  const edit = (next: string) => {
    setText(next);
    if (value) onChange(null);
    // Editing back into the city part abandons the city choice.
    if (cityChoice && !next.startsWith(`${cityLabel(cityChoice)} `)) setCityChoice(null);
  };

  const zipRows =
    stillChoosingZip && zipListing.status === "ready"
      ? zipListing.zips.filter((zip) => zip.startsWith(typedAfterCity ?? "")).slice(0, MAX_ZIP_ROWS)
      : [];

  let hint = "Start typing a city, or a five-digit zip.";
  if (value) hint = "Leagues in the same zip playing the same sport are probably yours.";
  else if (stillChoosingZip && zipListing.status === "ready" && zipListing.zips.length === 0)
    hint = `We have no zips filed under ${cityLabel(cityChoice!)}. Try the five-digit zip instead.`;
  else if (stillChoosingZip) hint = "Now the zip. Pick one below or keep typing it.";
  else if (search.status === "unavailable" || zipListing.status === "unavailable")
    hint = "Couldn't reach the address service. Try again in a moment.";
  else if (search.status === "ready" && search.cities.length === 0 && !search.zipPlace)
    hint = `No US city or zip matches "${text.trim()}".`;

  const busy = search.status === "loading" || zipListing.status === "loading";

  return (
    <View style={styles.container}>
      <Input
        label="Where do you play?"
        value={text}
        onChangeText={edit}
        placeholder="City or zip"
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="done"
        highlighted={text.trim().length > 0}
        hint={hint}
        left={<Feather name="map-pin" size={16} color={theme.accent.base} />}
        right={
          busy ? (
            <ActivityIndicator size="small" color={theme.accent.base} />
          ) : value ? (
            <Feather name="check" size={16} color={theme.success.base} />
          ) : undefined
        }
        accessibilityLabel="Where do you play, city or zip"
      />

      {!value && !stillChoosingZip && search.status === "ready" && search.zipPlace ? (
        <ListGroup>
          <ListRow
            title={placeLabel(search.zipPlace)}
            icon="map-pin"
            chevron={false}
            onPress={() => resolve(search.zipPlace!)}
            accessibilityLabel={`Use ${placeLabel(search.zipPlace)}`}
          />
        </ListGroup>
      ) : null}

      {!value && !stillChoosingZip && search.status === "ready" && search.cities.length > 0 ? (
        <ListGroup>
          {search.cities.map((choice) => (
            <ListRow
              key={cityLabel(choice)}
              title={cityLabel(choice)}
              icon="map-pin"
              onPress={() => chooseCity(choice)}
              accessibilityLabel={`${cityLabel(choice)}, then pick a zip`}
            />
          ))}
        </ListGroup>
      ) : null}

      {zipRows.length > 0 && cityChoice ? (
        <ListGroup>
          {zipRows.map((zip) => (
            <ListRow
              key={zip}
              title={`${cityLabel(cityChoice)} ${zip}`}
              icon="map-pin"
              chevron={false}
              onPress={() => resolve({ ...cityChoice, zip })}
              accessibilityLabel={`Use ${cityLabel(cityChoice)} ${zip}`}
            />
          ))}
        </ListGroup>
      ) : null}
      {stillChoosingZip && zipListing.status === "ready" && zipListing.zips.length > MAX_ZIP_ROWS ? (
        <AppText variant="caption" color="muted">
          {zipRows.length === MAX_ZIP_ROWS
            ? `Showing ${MAX_ZIP_ROWS} of ${zipListing.zips.length} zips. Keep typing to narrow it.`
            : `${zipListing.zips.length} zips in ${cityLabel(cityChoice!)}.`}
        </AppText>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
});

export default PlaceSearch;
