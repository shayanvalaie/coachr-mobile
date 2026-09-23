// Small-number fields (innings, players on the field, zip) are typed on a
// number pad; keep only digits so the draft is always what the server parses.
export const digitsOnly = (raw: string, maxLength: number): string =>
  raw.replace(/\D/g, "").slice(0, maxLength);

// Mirrors the server bounds (1–30) for innings/periods and players on field.
export const parseCount = (raw: string): number | null => {
  if (!/^\d{1,2}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= 30 ? value : null;
};

export const isZip = (raw: string): boolean => /^\d{5}$/.test(raw);
