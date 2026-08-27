import { getSheetsClient } from "@/lib/google";
import { getFirstSheetTitle, requireSheetId, STATUS_OPTIONS } from "@/lib/sheets";

// Column positions (0-indexed) matching the HEADERS array in lib/sheets.ts.
const COL = {
  leadId: 0,
  status: 1,
  navn: 5,
  email: 6,
  telefon: 7,
  firma: 8,
  branche: 9,
  harHjemmeside: 10,
  domaene: 11,
  harFacebook: 12,
  facebookUrl: 13,
  meetLink: 14,
  services: 15,
  usp: 16,
  billeder: 17,
  demoUrl: 18,
  projektmappe: 19,
  fejl: 20,
  claimToken: 21,
  claimedAt: 22,
} as const;

/** 0-indexed column number -> spreadsheet column letter (A, B, ..., Z, AA, ...). */
function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export type ClaimedLead = {
  leadId: string;
  claimToken: string;
  lead: {
    navn: string;
    email: string;
    telefon: string;
    firma: string;
    branche: string;
    harHjemmeside: string;
    domaene: string;
    harFacebook: string;
    facebookUrl: string;
    meetLink: string;
    services: string;
    usp: string;
    billeder: string;
  };
};

/**
 * Atomically claims the next GODKENDT lead for the local orchestrator.
 *
 * Google Sheets has no compare-and-swap, so exclusivity is emulated with an
 * optimistic-lock pattern: write a fresh random token into the row's Claim
 * Token cell, then immediately read that same cell back. Because Sheets
 * serializes writes to a given cell, only one writer's token can be the
 * value present when it's read back — that writer (and only that writer)
 * sees a match and may proceed to flip Status away from GODKENDT. Anyone
 * who reads back a token that isn't their own has lost the race and moves
 * on to the next candidate row, without ever touching Status.
 *
 * Once Status leaves GODKENDT, the row can never be claimed again by this
 * function (the candidate filter requires Status === "GODKENDT"), so a
 * crash after a successful claim leaves the row safely stuck rather than
 * risking double-processing — recovery is a deliberate manual step (reset
 * the Status dropdown back to GODKENDT in the sheet).
 */
export async function claimNextApprovedLead(): Promise<ClaimedLead | null> {
  const spreadsheetId = requireSheetId();
  const sheets = getSheetsClient();
  const sheetTitle = await getFirstSheetTitle(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:${columnLetter(COL.claimedAt)}1000`,
  });
  const rows = res.data.values || [];

  const MAX_ATTEMPTS = 5;
  let attempts = 0;

  for (let i = 0; i < rows.length && attempts < MAX_ATTEMPTS; i++) {
    const row = rows[i];
    const status = row[COL.status] || "";
    const existingClaimToken = row[COL.claimToken] || "";
    if (status !== "GODKENDT" || existingClaimToken) continue;

    attempts++;
    const sheetRow = i + 2; // 1-indexed, +1 to skip the header row
    const claimToken = crypto.randomUUID();
    const claimedAt = new Date().toISOString();
    const tokenRange = `${sheetTitle}!${columnLetter(COL.claimToken)}${sheetRow}:${columnLetter(COL.claimedAt)}${sheetRow}`;

    // Write our claim first — Status is not touched yet.
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: tokenRange,
      valueInputOption: "RAW",
      requestBody: { values: [[claimToken, claimedAt]] },
    });

    // Read the same cell back to see who actually won the race.
    const verify = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!${columnLetter(COL.claimToken)}${sheetRow}`,
    });
    const wonToken = verify.data.values?.[0]?.[0];
    if (wonToken !== claimToken) {
      // Someone else's write landed last — we lost this row, try the next.
      continue;
    }

    // We own this row's claim. Flip Status so it's never offered again.
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!${columnLetter(COL.status)}${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [["OPRETTER PROJEKT"]] },
    });

    return {
      leadId: row[COL.leadId] || "",
      claimToken,
      lead: {
        navn: row[COL.navn] || "",
        email: row[COL.email] || "",
        telefon: row[COL.telefon] || "",
        firma: row[COL.firma] || "",
        branche: row[COL.branche] || "",
        harHjemmeside: row[COL.harHjemmeside] || "",
        domaene: row[COL.domaene] || "",
        harFacebook: row[COL.harFacebook] || "",
        facebookUrl: row[COL.facebookUrl] || "",
        meetLink: row[COL.meetLink] || "",
        services: row[COL.services] || "",
        usp: row[COL.usp] || "",
        billeder: row[COL.billeder] || "",
      },
    };
  }

  return null;
}

export type LeadStatusUpdate = {
  status: (typeof STATUS_OPTIONS)[number];
  demoUrl?: string;
  projektmappe?: string;
  fejl?: string;
};

/**
 * Updates a claimed lead's Status (and optionally Demo URL/Projektmappe/Fejl).
 * Requires the exact claim token issued by claimNextApprovedLead — this
 * rejects reports from a stale/crashed orchestrator run whose lead has since
 * been manually reset and re-claimed with a new token.
 */
export async function updateLeadStatus(leadId: string, claimToken: string, update: LeadStatusUpdate) {
  const spreadsheetId = requireSheetId();
  const sheets = getSheetsClient();
  const sheetTitle = await getFirstSheetTitle(sheets, spreadsheetId);

  const idRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:A1000`,
  });
  const ids = (idRes.data.values || []).flat();
  const idx = ids.findIndex((v) => String(v).trim() === leadId);
  if (idx === -1) {
    throw new Error(`Lead ID ${leadId} not found`);
  }
  const sheetRow = idx + 2;

  const tokenRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!${columnLetter(COL.claimToken)}${sheetRow}`,
  });
  const storedToken = tokenRes.data.values?.[0]?.[0];
  if (!storedToken || storedToken !== claimToken) {
    throw new Error("Claim token mismatch — this lead may have been reset and re-claimed");
  }

  const data: { range: string; values: string[][] }[] = [
    { range: `${sheetTitle}!${columnLetter(COL.status)}${sheetRow}`, values: [[update.status]] },
  ];
  if (update.demoUrl !== undefined) {
    data.push({ range: `${sheetTitle}!${columnLetter(COL.demoUrl)}${sheetRow}`, values: [[update.demoUrl]] });
  }
  if (update.projektmappe !== undefined) {
    data.push({
      range: `${sheetTitle}!${columnLetter(COL.projektmappe)}${sheetRow}`,
      values: [[update.projektmappe]],
    });
  }
  if (update.fejl !== undefined) {
    data.push({ range: `${sheetTitle}!${columnLetter(COL.fejl)}${sheetRow}`, values: [[update.fejl]] });
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data },
  });
}
