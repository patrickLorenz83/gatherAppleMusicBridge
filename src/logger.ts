import pino from "pino";

/**
 * Pino-Logger.
 *
 * Generische Redaction für versehentlich geloggte Credentials (camelCase
 * oder snake_case `apiKey`/`api_key`). Seit Phase 5 nutzt die Bridge keine
 * persistierten API-Keys mehr (CDP-Pfad gegen lokale GatherV2-App), aber die
 * Redact-Pfade sind defensiv falls in Logs irgendwann wieder Tokens auftauchen.
 *
 * Default-Level `info`, override via `LOG_LEVEL` env.
 * Destination: stdout (pino-Default). launchd routet zu Datei.
 */
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["*.apiKey", "*.api_key", "*.token", "*.password"],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
