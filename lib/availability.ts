import { getCalendarClient, CALENDAR_ID } from "@/lib/google";
import {
  SLOT_MINUTES,
  MIN_LEAD_HOURS,
  WINDOW_DAYS,
  TIMEZONE,
  slotsForDay,
  dateKey,
  getZonedDateParts,
  addDaysToParts,
} from "@/lib/time";

export type AvailabilityData = {
  timezone: string;
  slotMinutes: number;
  days: Record<string, string[]>;
};

export async function computeAvailability(): Promise<AvailabilityData> {
  const now = new Date();
  const earliestBookable = new Date(now.getTime() + MIN_LEAD_HOURS * 60 * 60 * 1000);
  const todayParts = getZonedDateParts(now, TIMEZONE);

  const windowStart = now;
  const windowEndParts = addDaysToParts(todayParts.year, todayParts.month, todayParts.day, WINDOW_DAYS);
  const windowEnd = slotsForDay(windowEndParts.year, windowEndParts.month, windowEndParts.day)[0];

  const calendar = getCalendarClient();
  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busy = (freebusy.data.calendars?.[CALENDAR_ID]?.busy || []).map((b) => ({
    start: new Date(b.start!).getTime(),
    end: new Date(b.end!).getTime(),
  }));

  function isFree(slotStart: Date) {
    const start = slotStart.getTime();
    const end = start + SLOT_MINUTES * 60 * 1000;
    return !busy.some((b) => start < b.end && end > b.start);
  }

  const days: Record<string, string[]> = {};

  for (let i = 0; i < WINDOW_DAYS; i++) {
    const { year, month, day } = addDaysToParts(todayParts.year, todayParts.month, todayParts.day, i);
    const slots = slotsForDay(year, month, day).filter(
      (slot) => slot.getTime() >= earliestBookable.getTime() && isFree(slot),
    );

    if (slots.length > 0) {
      days[dateKey(year, month, day)] = slots.map((s) => s.toISOString());
    }
  }

  return { timezone: TIMEZONE, slotMinutes: SLOT_MINUTES, days };
}
