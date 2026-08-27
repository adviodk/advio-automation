export const TIMEZONE = "Europe/Copenhagen";
export const SLOT_MINUTES = 45;
export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 21;
export const MIN_LEAD_HOURS = 48;
export const WINDOW_DAYS = 21;

/**
 * Converts a wall-clock date/time in `timeZone` to the correct UTC Date,
 * correctly handling that zone's DST offset for that specific date
 * (no date library available, this is the standard dependency-free trick).
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const asZoned = new Date(utcGuess).toLocaleString("en-US", { timeZone });
  const zonedAsUtc = new Date(`${asZoned} UTC`).getTime();
  const offset = zonedAsUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** Year/month/day of `date` as displayed in `timeZone` (wall-clock date). */
export function getZonedDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Adds `days` to a Y/M/D triple, returning the resulting Y/M/D. */
export function addDaysToParts(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  // Noon UTC avoids any DST-related date-shift edge cases here.
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Human-readable "YYYY-MM-DD" and "HH:MM" for `date`, as seen in `timeZone`. */
export function formatInZone(date: Date, timeZone: string): { dateStr: string; timeStr: string } {
  const { year, month, day } = getZonedDateParts(date, timeZone);
  const timeStr = new Intl.DateTimeFormat("da-DK", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { dateStr: dateKey(year, month, day), timeStr };
}

/** All valid 45-min slot start times (UTC Dates) for one calendar day in TIMEZONE. */
export function slotsForDay(year: number, month: number, day: number): Date[] {
  const slots: Date[] = [];
  const dayStartMinutes = BUSINESS_START_HOUR * 60;
  const dayEndMinutes = BUSINESS_END_HOUR * 60;

  for (
    let minutes = dayStartMinutes;
    minutes + SLOT_MINUTES <= dayEndMinutes;
    minutes += SLOT_MINUTES
  ) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push(zonedTimeToUtc(year, month, day, hour, minute, TIMEZONE));
  }

  return slots;
}
