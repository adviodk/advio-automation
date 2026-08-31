import { NextResponse } from "next/server";
import { hasValidOrchestratorKey } from "@/lib/auth";
import { STATUS_OPTIONS } from "@/lib/sheets";
import { updateLeadStatus } from "@/lib/leads";
import { getClientIp, isRateLimited, rateLimitResponse } from "@/lib/rateLimit";

type StatusPayload = {
  claimToken: string;
  status: string;
  demoUrl?: string;
  projektmappe?: string;
  fejl?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  if (!hasValidOrchestratorKey(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (isRateLimited(`status:${getClientIp(request)}`, 60, 60_000)) {
    return rateLimitResponse();
  }

  const { leadId } = await params;

  let payload: StatusPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.claimToken || !payload.status) {
    return NextResponse.json({ ok: false, error: "claimToken and status are required" }, { status: 400 });
  }
  if (!(STATUS_OPTIONS as readonly string[]).includes(payload.status)) {
    return NextResponse.json({ ok: false, error: "Invalid status value" }, { status: 400 });
  }

  try {
    await updateLeadStatus(leadId, payload.claimToken, {
      status: payload.status as (typeof STATUS_OPTIONS)[number],
      demoUrl: payload.demoUrl,
      projektmappe: payload.projektmappe,
      fejl: payload.fejl,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 409 },
    );
  }
}
