// Free, keyless US postal lookup. A 404 means the zip does not exist; any
// other failure means we could not check.
const ZIPPOPOTAM_US = "https://api.zippopotam.us/us";

export type ZipPlace = { city: string; state: string };

export const lookupZip = async (zip: string): Promise<ZipPlace | null> => {
  const response = await fetch(`${ZIPPOPOTAM_US}/${zip}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Zip lookup failed (${response.status})`);
  const body = (await response.json()) as {
    places?: Array<{ "place name"?: string; "state abbreviation"?: string }>;
  };
  const first = body.places?.[0];
  if (!first?.["place name"] || !first?.["state abbreviation"]) {
    throw new Error("Zip lookup returned no place");
  }
  return { city: first["place name"], state: first["state abbreviation"] };
};
