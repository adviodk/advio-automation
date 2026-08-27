import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { hasValidApiKey } from "@/lib/auth";

type LeadPayload = {
  type: "kontaktformular" | "spørgeskema";
  navn?: string;
  kontakt?: string;
  firma?: string;
  telefon?: string;
  email?: string;
};

const TITLES: Record<LeadPayload["type"], string> = {
  kontaktformular: "NYT LEAD (KONTAKTFORMULAR)",
  "spørgeskema": "NYT LEAD (SPØRGESKEMA)",
};

function buildMessage(payload: LeadPayload): string {
  const lines = [`🚨 ${TITLES[payload.type]}`];

  if (payload.type === "spørgeskema") {
    if (payload.firma) lines.push(`Firma: ${payload.firma}`);
    const kontakt = [payload.telefon, payload.email].filter(Boolean).join(" / ");
    if (kontakt) lines.push(`Kontakt: ${kontakt}`);
  } else {
    if (payload.navn) lines.push(`Navn: ${payload.navn}`);
    const kontakt = payload.kontakt || payload.telefon;
    if (kontakt) lines.push(`Kontakt: ${kontakt}`);
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  if (!hasValidApiKey(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: LeadPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.type || !(payload.type in TITLES)) {
    return NextResponse.json({ ok: false, error: "Invalid lead type" }, { status: 400 });
  }

  try {
    await sendTelegramMessage(buildMessage(payload));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
