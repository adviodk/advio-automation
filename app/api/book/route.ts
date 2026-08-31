import { NextResponse } from "next/server";
import { getCalendarClient, CALENDAR_ID } from "@/lib/google";
import { appendBookingRow } from "@/lib/sheets";
import { sendTelegramMessage } from "@/lib/telegram";
import { SLOT_MINUTES, MIN_LEAD_HOURS, TIMEZONE, formatInZone } from "@/lib/time";
import { hasValidApiKey } from "@/lib/auth";
import { getClientIp, isRateLimited, rateLimitResponse } from "@/lib/rateLimit";

type BookPayload = {
  slot: string;
  navn: string;
  email: string;
  telefon?: string;
  firma?: string;
  branche?: string;
  harHjemmeside?: string;
  domaene?: string;
  harFacebook?: string;
  facebookUrl?: string;
  services?: string;
  usp?: string;
  billeder?: string;
};

export async function POST(request: Request) {
  if (!hasValidApiKey(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (isRateLimited(`book:${getClientIp(request)}`, 30, 10 * 60_000)) {
    return rateLimitResponse();
  }

  let payload: BookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { slot, navn, email } = payload;
  if (!slot || !navn || !email) {
    return NextResponse.json({ ok: false, error: "Navn, email og tid er påkrævet" }, { status: 400 });
  }
  for (const value of Object.values(payload)) {
    if (typeof value === "string" && value.length > 500) {
      return NextResponse.json({ ok: false, error: "Field too long" }, { status: 400 });
    }
  }

  const start = new Date(slot);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ ok: false, error: "Ugyldig tid" }, { status: 400 });
  }

  const earliestBookable = Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000;
  if (start.getTime() < earliestBookable) {
    return NextResponse.json(
      { ok: false, error: `Der skal bookes mindst ${MIN_LEAD_HOURS} timer i forvejen` },
      { status: 400 },
    );
  }

  const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);

  try {
    const calendar = getCalendarClient();

    // Re-check availability right before booking to avoid a race where two
    // people book the same slot seconds apart.
    const freebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: CALENDAR_ID }],
      },
    });
    const busy = freebusy.data.calendars?.[CALENDAR_ID]?.busy || [];
    if (busy.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Denne tid er desværre lige blevet booket. Vælg en anden tid." },
        { status: 409 },
      );
    }

    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: `Møde med ${payload.firma || navn}`,
        description: [
          `Hej ${navn}`,
          "",
          "Tak fordi du har booket et møde med Advio! Vi glæder os til at tale med dig.",
          "Mødet holdes over Google Meet — brug linket i denne invitation for at deltage.",
          "",
          "Vi ses snart!",
          "Advio",
        ].join("\n"),
        start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
        attendees: [{ email, displayName: navn }],
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const meetLink = event.data.hangoutLink || "";
    const { dateStr, timeStr } = formatInZone(start, TIMEZONE);

    // Best-effort side effects — a failure here shouldn't undo the booking,
    // which is already confirmed in Google Calendar at this point.
    // appendBookingRow runs first (and is allowed to fail silently) so the
    // Lead ID it assigns can be included in the notification/email below.
    const leadId = await appendBookingRow({
      dato: dateStr,
      tid: timeStr,
      navn,
      email,
      telefon: payload.telefon || "",
      firma: payload.firma || "",
      branche: payload.branche || "",
      harHjemmeside: payload.harHjemmeside || "",
      domaene: payload.domaene || "",
      harFacebook: payload.harFacebook || "",
      facebookUrl: payload.facebookUrl || "",
      services: payload.services || "",
      usp: payload.usp || "",
      billeder: payload.billeder || "",
      meetLink,
    }).catch(() => null);

    await Promise.allSettled([
      sendTelegramMessage(
        [
          "🚨 NYT LEAD (BOOKING)",
          leadId ? `Lead ID: ${leadId}` : null,
          `Navn: ${navn}`,
          `Kontakt: ${[payload.telefon, email].filter(Boolean).join(" / ")}`,
          payload.firma ? `Firma: ${payload.firma}` : null,
          `Tid: ${dateStr} kl. ${timeStr}`,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      fetch("https://formsubmit.co/ajax/simon@advio.dk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: "Ny booking fra advio.dk",
          _template: "table",
          "Lead ID": leadId || "",
          Navn: navn,
          Email: email,
          Telefon: payload.telefon || "",
          Firma: payload.firma || "",
          Branche: payload.branche || "",
          "Har hjemmeside": payload.harHjemmeside || "",
          Domæne: payload.domaene || "",
          "Har Facebook": payload.harFacebook || "",
          "Facebook link": payload.facebookUrl || "",
          Ydelser: payload.services || "",
          USP: payload.usp || "",
          Billeder: payload.billeder || "",
          Tid: `${dateStr} kl. ${timeStr}`,
          "Google Meet": meetLink,
        }),
      }),
    ]);

    return NextResponse.json({ ok: true, meetLink, start: start.toISOString(), end: end.toISOString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
