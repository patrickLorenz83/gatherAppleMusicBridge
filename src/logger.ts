import pino from "pino";

/**
 * Pino-Logger mit defensiver Redaction für API-Keys.
 *
 * Redaction-Strategie (CFG-04 + Pitfall 5):
 * - Konkrete Pfade (`env.GATHER_API_KEY`) für den Fall, dass jemand
 *   `log.info({ env: process.env }, "...")` schreibt.
 * - Wildcard-Pfade (`*.GATHER_API_KEY`) für jede beliebige Verschachtelung,
 *   z. B. `log.error({ details: { env: { GATHER_API_KEY: ... } } })`.
 * - `apiKey` und `api_key` als generische camel-/snake-case-Varianten —
 *   wenn z. B. ein Last.fm-Response-Body geloggt würde.
 * - `censor: "[REDACTED]"` macht den Eintrag im JSON sichtbar
 *   (statt komplett zu entfernen via `remove: true`) — beim Debugging
 *   ist das hilfreicher: man sieht, dass das Feld da war.
 *
 * Default-Level `info`, in Phase 4 ggf. via `LOG_LEVEL` env (QOL-02 v2).
 *
 * Destination: stdout (pino-Default). launchd routet beide Streams in
 * dieselbe Datei (siehe Phase 4 / Pitfall 11).
 */
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "env.GATHER_API_KEY",
      "env.LASTFM_API_KEY",
      "*.GATHER_API_KEY",
      "*.LASTFM_API_KEY",
      "*.apiKey",
      "*.api_key",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
