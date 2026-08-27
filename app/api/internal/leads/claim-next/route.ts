import { NextResponse } from "next/server";
import { hasValidOrchestratorKey } from "@/lib/auth";
import { claimNextApprovedLead } from "@/lib/leads";

// Called by the local orchestrator (Simon's Mac) — never by the public
// internet or by Advio side. See lib/leads.ts for the claim mechanism.
export async function POST(request: Request) {
  if (!hasValidOrchestratorKey(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const claimed = await claimNextApprovedLead();
    if (!claimed) {
      return NextResponse.json({ ok: true, lead: null });
    }
    return NextResponse.json({ ok: true, lead: claimed });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
