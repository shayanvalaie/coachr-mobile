// Pure calendar date helpers shared by the calendar screens. No React imports —
// everything here is a plain function of its inputs.
//
// The "datetime input" format used throughout is the datetime-local string
// `YYYY-MM-DDTHH:mm` interpreted in the device's local timezone. Games are
// submitted to the backend as full UTC ISO strings via toIsoFromDateTimeInput,
// exactly as the pre-decomposition CalendarScreen did.

export type MonthCell = {
  day: number;
  dayKey: string;
  inMonth: boolean;
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

export const pad2 = (value: number) => String(value).padStart(2, "0");

export const toDayKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const toDayKeyFromIso = (iso: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return toDayKeyFromDate(date);
};

export const mergeDayAndTime = (dayKey: string, currentInput: string) => {
  const match = /T(\d{2}:\d{2})/.exec(currentInput);
  const timePart = match?.[1] ?? "18:00";
  return `${dayKey}T${timePart}`;
};

export const dayKeyToReadable = (dayKey: string) => {
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// "March 15" — used for day-cell accessibility labels.
export const dayKeyToMonthDayLabel = (dayKey: string) => {
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
};

// ISO (any timezone) -> local datetime-local input string `YYYY-MM-DDTHH:mm`.
export const toDateTimeLocalInput = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

// Datetime-local input string -> UTC ISO string for the backend.
export const toIsoFromDateTimeInput = (value: string): string | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

// Date -> local datetime-local input string. Same output as
// toDateTimeLocalInput(date.toISOString()), without the round trip.
export const dateToDateTimeInput = (date: Date) =>
  `${toDayKeyFromDate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

// Datetime-local input string -> Date (local timezone), or null if invalid.
export const dateTimeInputToDate = (value: string): Date | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

// Human-readable form of the datetime input for the picker field.
export const dateTimeInputToReadable = (value: string): string | null => {
  const date = dateTimeInputToDate(value);
  if (!date) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const buildMonthCells = (year: number, monthIndex: number): MonthCell[] => {
  const firstDay = new Date(year, monthIndex, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const cellDate = new Date(year, monthIndex, 1 - firstWeekday + index);
    return {
      day: cellDate.getDate(),
      dayKey: toDayKeyFromDate(cellDate),
      inMonth: cellDate.getMonth() === monthIndex,
    };
  });
};

// Parse a day key into the first-of-month Date used as the month cursor.
export const dayKeyToMonthDate = (dayKey: string): Date => {
  const [yearRaw, monthRaw] = dayKey.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) ? month : new Date().getMonth() + 1;
  return new Date(safeYear, safeMonth - 1, 1);
};

// Shift a day key by whole months, clamping via Date rollover (verbatim
// behavior from the original moveMonth).
export const shiftDayKeyByMonths = (dayKey: string, offset: number): string => {
  const [year, month, day] = dayKey.split("-");
  const yearNum = Number.parseInt(year ?? "", 10) || new Date().getFullYear();
  const monthNum = Number.parseInt(month ?? "", 10) || 1;
  const dayNum = Number.parseInt(day ?? "", 10) || 1;
  return toDayKeyFromDate(new Date(yearNum, monthNum - 1 + offset, dayNum));
};
