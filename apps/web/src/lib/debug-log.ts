const DEBUG_ENDPOINT = "http://127.0.0.1:7336/ingest/640973ff-4a0d-43e4-bf12-61fdcd37e420";
const DEBUG_SESSION = "c4c61d";

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix"
) {
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
