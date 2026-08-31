import { NextResponse } from "next/server";
import { hasValidOrchestratorKey } from "@/lib/auth";
import { claimNextApprovedLead } from "@/lib/leads";
import { getClientIp, isRateLimited, rateLimitResponse } from "@/lib/rateLimit";

// Called by the local orchestrator (Simon's Mac) — never by the public
// internet or by Advio side. See lib/leads.ts for the claim mechanism.
export async function POST(request: Request) {
  if (!hasValidOrchestratorKey(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // A polling orchestrator legitimately calls this every few minutes — this
  // limit is only a backstop against a leaked key being hammered.
  if (isRateLimited(`claim-next:${getClientIp(request)}`, 30, 60_000)) {
    return rateLimitResponse();
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
