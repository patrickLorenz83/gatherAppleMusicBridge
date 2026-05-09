import { log } from "../logger.js";
import type { NowPlayingSource } from "./types.js";
import { getAppleScriptState } from "./applescript.js";

/**
 * Now-Playing-Source: Music.app via AppleScript.
 *
 * Authority für Play/Pause/Stop:
 * - state === null oder !== "playing"   → null
 * - state === "playing"                 → {artist, track} aus Music.app
 *
 * Last.fm-Pfad wurde mit dem Cleanup nach Phase 5 entfernt (User nutzt
 * nicht NepTunes, AppleScript reicht). Die Funktion wirft NIE — alle
 * Adapter-Errors werden intern in null + log.warn gemappt.
 */
export const getNowPlaying: NowPlayingSource = async () => {
  try {
    const apple = await getAppleScriptState();
    if (apple.state === "playing") {
      return apple.np;
    }
    return null;
  } catch (err) {
    log.error({ err }, "[chain] unexpected error in getNowPlaying — returning null");
    return null;
  }
};
