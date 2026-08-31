/**
 * Coarse, secondary rate limiter — defense-in-depth for Advio Automation
 * itself. The primary, per-visitor limiter lives in Advio side (it sees the
 * real client IP; requests proxied here mostly share Vercel's own outbound
 * IP, so a per-IP limit here can't distinguish individual visitors as
 * precisely). This still catches: the SSR availability fetch in
 * app/formular/book/page.tsx (which bypasses Advio side's own rate limiter
 * since it calls Automation directly), a leaked AUTOMATION_API_KEY, or any
 * other direct caller. In-memory, per-instance — see Advio side's
 * lib/rateLimit.ts for the full reasoning on why that's an intentional,
 * proportionate choice rather than added infrastructure.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
let requestsSinceSweep = 0;

function sweep(maxAgeMs: number) {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > maxAgeMs) buckets.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  requestsSinceSweep++;
  if (requestsSinceSweep > 200) {
    requestsSinceSweep = 0;
    sweep(windowMs);
  }

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }

  bucket.count++;
  return bucket.count > limit;
}

export function rateLimitResponse() {
  return new Response(JSON.stringify({ ok: false, error: "Too many requests" }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}
