import "dotenv/config";

/**
 * Daemon-Config: optionale Overrides für den CDP-Pfad zur GatherV2-App.
 *
 * Beide Felder haben sinnvolle Defaults und müssen nur gesetzt werden, wenn
 * Port 9222 belegt ist oder eine alternative Gather-URL genutzt wird.
 *
 * `dotenv/config` als Side-Effect-Import lädt `.env` in `process.env`.
 */
export type Config = {
  GATHER_CDP_PORT: string;
  GATHER_PAGE_URL_FILTER: string;
};

export const config: Config = {
  GATHER_CDP_PORT: process.env.GATHER_CDP_PORT ?? "9222",
  GATHER_PAGE_URL_FILTER:
    process.env.GATHER_PAGE_URL_FILTER ?? "app.v2.gather.town",
};
