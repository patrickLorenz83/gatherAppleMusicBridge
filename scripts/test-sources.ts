/**
 * Manuelles Smoke-Test-Script für die Now-Playing-Source.
 *
 * Aufruf: `npm run test:sources`
 *
 * Ablauf: ruft `getAppleScriptState()` und `getNowPlaying()` und druckt
 * beide Ergebnisse als JSON. Crasht nicht, wenn Music.app nicht läuft
 * (state=null, np=null).
 *
 * Verifikation:
 * 1. Music.app spielt → result zeigt {state:"playing", np:{artist,track}}
 * 2. Music.app pausiert → result zeigt {state:"paused", np:null}, chain liefert null
 * 3. Music.app komplett geschlossen → state=null, chain liefert null,
 *    Music.app DARF NICHT durch das Script starten (Outer-Guard)
 */

import { log } from "../src/logger.js";
import { getAppleScriptState } from "../src/sources/applescript.js";
import { getNowPlaying } from "../src/sources/chain.js";

async function main(): Promise<void> {
  log.info("=== Source Smoke Test ===");

  log.info("[1/2] AppleScript direkt …");
  const apple = await getAppleScriptState();
  log.info({ result: apple }, "[1/2] AppleScript result");

  log.info("[2/2] getNowPlaying (chain) …");
  const chain = await getNowPlaying();
  log.info({ result: chain }, "[2/2] Chain result");

  log.info("=== Done ===");
}

main().catch((err: unknown) => {
  log.fatal({ err }, "Smoke-Test crashed unexpectedly");
  process.exit(1);
});
