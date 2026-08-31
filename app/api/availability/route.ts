import { NextResponse } from "next/server";
import { computeAvailability } from "@/lib/availability";
import { hasValidApiKey } from "@/lib/auth";
import { getClientIp, isRateLimited, rateLimitResponse } from "@/lib/rateLimit";

export async function GET(request: Request) {
  if (!hasValidApiKey(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (isRateLimited(`availability:${getClientIp(request)}`, 60, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const data = await computeAvailability();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
