import "dotenv/config";

/**
 * Daemon config: optional overrides for the CDP path to the GatherV2 app.
 *
 * All fields have sane defaults and only need to be set when the defaults
 * conflict (port 9222 already in use, alternative Gather URL, opt-out of
 * the auto-heal feature).
 *
 * `dotenv/config` is imported for its side effect — it loads `.env` into
 * `process.env` before this module's exports are evaluated.
 */
export type Config = {
  GATHER_CDP_PORT: number;
  GATHER_PAGE_URL_FILTER: string;
  GATHER_APP_PATH: string;
  GATHER_AUTO_HEAL: boolean;
};

/**
 * Parse a port string into a valid TCP port number (1-65535).
 * Throws on invalid input so daemon startup fails loudly with a clear
 * error message instead of producing NaN/0/negative ports later.
 */
function parsePort(raw: string | undefined, defaultPort: number): number {
  if (raw === undefined || raw === "") return defaultPort;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(
      `Invalid GATHER_CDP_PORT="${raw}". Must be an integer between 1 and 65535.`,
    );
  }
  return n;
}

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  const v = raw.toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  throw new Error(
    `Invalid boolean env value "${raw}". Use one of: 1/0, true/false, yes/no, on/off.`,
  );
}

export const config: Config = {
  GATHER_CDP_PORT: parsePort(process.env.GATHER_CDP_PORT, 9222),
  GATHER_PAGE_URL_FILTER:
    process.env.GATHER_PAGE_URL_FILTER ?? "app.v2.gather.town",
  GATHER_APP_PATH:
    process.env.GATHER_APP_PATH ?? "/Applications/GatherV2.app",
  GATHER_AUTO_HEAL: parseBool(process.env.GATHER_AUTO_HEAL, true),
};
