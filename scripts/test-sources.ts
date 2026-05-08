/**
 * Manuelles Smoke-Test-Script für Phase 2 Sources.
 *
 * Aufruf: `npm run test:sources`
 *
 * Output: drei JSON-Sektionen für Last.fm, AppleScript, Chain — strukturiert
 * für visuelle Verifikation gegen echtes Apple Music + NepTunes.
 *
 * Kein Crash, wenn:
 * - Music.app nicht läuft (AppleScript-Adapter liefert state=null)
 * - Last.fm-API-Key falsch (Adapter loggt + null)
 * - NepTunes nicht aktiv (Last.fm liefert null, AppleScript-Pfad greift)
 *
 * Verwendung für die Phase-2-Verifikation:
 * 1. Music.app pausieren → Chain muss null liefern (Authority-Test).
 * 2. Music.app spielen + NepTunes aktiv → Chain liefert Last.fm-Daten.
 * 3. Music.app spielen + NepTunes deaktiviert → Chain liefert AppleScript-Daten.
 * 4. Music.app komplett geschlossen → AppleScript state=null, Chain liefert
 *    Last.fm-Daten oder null. Music.app DARF NICHT durch das Script starten.
 */

import { log } from "../src/logger.js";
import { getLastFmNowPlaying } from "../src/sources/lastfm.js";
import { getAppleScriptState } from "../src/sources/applescript.js";
import { getNowPlaying } from "../src/sources/chain.js";

async function main(): Promise<void> {
  log.info("=== Phase 2 Source Smoke Test ===");

  // 1. Last.fm pur
  log.info("[1/3] Last.fm direkt …");
  const lastfm = await getLastFmNowPlaying();
  log.info({ result: lastfm }, "[1/3] Last.fm result");

  // 2. AppleScript pur
  log.info("[2/3] AppleScript direkt …");
  const apple = await getAppleScriptState();
  log.info({ result: apple }, "[2/3] AppleScript result");

  // 3. Chain (Composer)
  log.info("[3/3] Source-Chain (Composer) …");
  const chain = await getNowPlaying();
  log.info({ result: chain }, "[3/3] Chain result");

  log.info("=== Done ===");
}

main().catch((err: unknown) => {
  log.fatal({ err }, "Smoke-Test crashed unexpectedly");
  process.exit(1);
});
