import { getSheetsClient } from "@/lib/google";

const HEADERS = [
  "Lead ID",
  "Status",
  "Tidspunkt booket",
  "Dato",
  "Tid",
  "Navn",
  "Email",
  "Telefon",
  "Firma",
  "Branche",
  "Har hjemmeside",
  "Domæne",
  "Har Facebook",
  "Facebook link",
  "Google Meet link",
  "Ydelser",
  "USP",
  "Billeder",
  "Demo URL",
  "Projektmappe",
  "Fejl",
  // Internal bookkeeping for the local-orchestrator claim mechanism — not
  // part of the business schema, never shown/edited by hand.
  "Claim Token",
  "Claimed At",
];

export const STATUS_OPTIONS = [
  "AFVENTER",
  "GODKENDT",
  "AFVIST",
  "OPRETTER PROJEKT",
  "HENTER ASSETS",
  "GENERERER",
  "QA",
  "DEMO KLAR",
  "FEJL",
] as const;

const DEFAULT_STATUS: (typeof STATUS_OPTIONS)[number] = "AFVENTER";

export async function getFirstSheetTitle(sheets: ReturnType<typeof getSheetsClient>, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const title = meta.data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("Spreadsheet has no sheets");
  return title;
}

export function requireSheetId() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID is not configured");
  return spreadsheetId;
}

/** Scans the Lead ID column for the highest existing ADV-<year>-### and returns the next one, resetting per year. */
async function getNextLeadId(
  sheets: ReturnType<typeof getSheetsClient>,
  spreadsheetId: string,
  sheetTitle: string,
) {
  const year = new Date().getFullYear();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:A`,
  });
  const existing = (res.data.values || []).flat();
  const maxNumber = existing.reduce((max, value) => {
    const match = new RegExp(`^ADV-${year}-(\\d+)$`).exec(String(value).trim());
    if (!match) return max;
    return Math.max(max, parseInt(match[1], 10));
  }, 0);
  return `ADV-${year}-${String(maxNumber + 1).padStart(3, "0")}`;
}

export async function appendBookingRow(row: {
  dato: string;
  tid: string;
  navn: string;
  email: string;
  telefon: string;
  firma: string;
  branche: string;
  harHjemmeside: string;
  domaene: string;
  harFacebook: string;
  facebookUrl: string;
  services: string;
  usp: string;
  billeder: string;
  meetLink: string;
}) {
  const spreadsheetId = requireSheetId();

  const sheets = getSheetsClient();
  const sheetTitle = await getFirstSheetTitle(sheets, spreadsheetId);

  // Cheap and idempotent — keeps the header in sync if the schema changes.
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1:W1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });

  const leadId = await getNextLeadId(sheets, spreadsheetId, sheetTitle);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:U`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          leadId,
          DEFAULT_STATUS,
          new Date().toISOString(),
          row.dato,
          row.tid,
          row.navn,
          row.email,
          row.telefon,
          row.firma,
          row.branche,
          row.harHjemmeside,
          row.domaene,
          row.harFacebook,
          row.facebookUrl,
          row.meetLink,
          row.services,
          row.usp,
          row.billeder,
          "",
          "",
          "",
        ],
      ],
    },
  });

  return leadId;
}
