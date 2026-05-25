const DEBUG_ENDPOINT = process.env.NEXT_PUBLIC_DEBUG_LOG_ENDPOINT;
const DEBUG_SESSION = process.env.NEXT_PUBLIC_DEBUG_SESSION_ID || "local";

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix"
) {
  if (!DEBUG_ENDPOINT) return;

  const payload = {
    sessionId: DEBUG_SESSION,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now()
  };

  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION
    },
    body: JSON.stringify(payload)
  }).catch(() => {});
  // #endregion
}
