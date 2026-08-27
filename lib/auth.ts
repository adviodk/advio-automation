/**
 * Advio side (the public frontend) is the only caller allowed to hit the
 * regular /api/* routes — this checks the shared secret it sends.
 */
export function hasValidApiKey(request: Request): boolean {
  const key = request.headers.get("x-automation-key");
  const expected = process.env.AUTOMATION_API_KEY;
  return Boolean(expected) && key === expected;
}

/**
 * The local orchestrator (running on Simon's Mac) is the only caller allowed
 * to hit the /api/internal/* routes — a separate secret from the one above,
 * so a leaked orchestrator key can't be used to impersonate Advio side.
 */
export function hasValidOrchestratorKey(request: Request): boolean {
  const key = request.headers.get("x-orchestrator-key");
  const expected = process.env.AUTOMATION_ORCHESTRATOR_KEY;
  return Boolean(expected) && key === expected;
}
