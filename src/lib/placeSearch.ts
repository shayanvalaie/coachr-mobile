import { useEffect, useRef, useState } from "react";
import { isZip } from "../utils/formNumbers";
import { US_STATES } from "./usStates";
import { lookupZip } from "./zipLookup";

// Type-ahead for the league's single address field. City names come from
// Photon (OpenStreetMap, free, no key, fair use); a city's zips and a typed
// zip's city come from Zippopotam (free, no key). Photon's own zip results
// carry no city, so digits never go to Photon.
const PHOTON_URL = "https://photon.komoot.io/api/";
const ZIPPOPOTAM_US = "https://api.zippopotam.us/us";
// Suburbs are included because USPS city names (Woodland Hills, Brooklyn) are
// often OSM suburbs of a larger city.
const CITY_TAGS = ["place:city", "place:town", "place:village", "place:suburb"];
const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

// A resolved address: what the form submits. The zip is the dedup key.
export type PlaceValue = { city: string; state: string; zip: string };

// A city the coach picked that still needs a zip.
export type CityChoice = { city: string; state: string };

export const placeLabel = (place: PlaceValue): string => `${place.city}, ${place.state} ${place.zip}`;
export const cityLabel = (choice: CityChoice): string => `${choice.city}, ${choice.state}`;

const stateCodeByName = new Map(US_STATES.map((state) => [state.name.toLowerCase(), state.code]));

type PhotonFeature = {
  properties: {
    name?: string;
    state?: string;
    countrycode?: string;
  };
};

export const searchCities = async (query: string): Promise<CityChoice[]> => {
  // Photon has no country filter; ask for extra rows so the US-only pass still fills the list.
  const params = new URLSearchParams({ q: query, limit: "15", lang: "en" });
  CITY_TAGS.forEach((tag) => params.append("osm_tag", tag));
  const response = await fetch(`${PHOTON_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  const body = (await response.json()) as { features?: PhotonFeature[] };

  const seen = new Set<string>();
  const choices: CityChoice[] = [];
  (body.features ?? []).forEach(({ properties }) => {
    if (properties.countrycode !== "US" || !properties.name || !properties.state) return;
    const state = stateCodeByName.get(properties.state.toLowerCase());
    if (!state) return;
    const key = `${properties.name.toLowerCase()}|${state}`;
    if (seen.has(key)) return;
    seen.add(key);
    choices.push({ city: properties.name, state });
  });
  return choices;
};

// Every zip USPS files under this city name. Empty when the city is unknown
// to the postal data (a neighbourhood that is not a USPS city, for example).
export const listCityZips = async (choice: CityChoice): Promise<string[]> => {
  const response = await fetch(
    `${ZIPPOPOTAM_US}/${choice.state.toLowerCase()}/${encodeURIComponent(choice.city.toLowerCase())}`,
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Zip listing failed (${response.status})`);
  const body = (await response.json()) as { places?: Array<{ "post code"?: string }> };
  return (body.places ?? [])
    .map((place) => place["post code"])
    .filter((zip): zip is string => typeof zip === "string" && isZip(zip))
    .sort();
};

export type CitySearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; cities: CityChoice[]; zipPlace: PlaceValue | null }
  | { status: "unavailable" };

// Debounced search over the bar's text. Five digits resolve straight to a
// place; letters suggest cities; a partial zip has nothing to suggest yet.
export const useCitySearch = (query: string, enabled: boolean): CitySearchState => {
  const [state, setState] = useState<CitySearchState>({ status: "idle" });
  const latest = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++latest.current;
    if (!enabled || trimmed.length < MIN_QUERY || (/^\d+$/.test(trimmed) && !isZip(trimmed))) {
      setState({ status: "idle" });
      return;
    }
    const timer = setTimeout(() => {
      setState({ status: "loading" });
      const search = isZip(trimmed)
        ? lookupZip(trimmed).then((place) => ({
            cities: [],
            zipPlace: place ? { ...place, zip: trimmed } : null,
          }))
        : searchCities(trimmed).then((cities) => ({ cities, zipPlace: null }));
      search
        .then((result) => {
          if (requestId === latest.current) setState({ status: "ready", ...result });
        })
        .catch(() => {
          if (requestId === latest.current) setState({ status: "unavailable" });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, query]);

  return state;
};
