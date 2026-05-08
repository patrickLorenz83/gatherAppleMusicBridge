import { log } from "../logger.js";
import type { NowPlayingSource } from "./types.js";
import { getLastFmNowPlaying } from "./lastfm.js";
import { getAppleScriptState } from "./applescript.js";

/**
 * Source-Chain-Composer (SRC-02, SRC-03, SRC-05).
 *
 * Reihenfolge der Auflösung:
 *
 * 1. AppleScript fragt zuerst nach Player-State (= Authority für Play/Pause/Stop, SRC-03).
 *    - state===null:      Music.app nicht installiert/läuft → fallback nur auf Last.fm.
 *    - state==="paused"/"stopped": → return null. Last.fm ist hier IRRELEVANT, weil
 *      NepTunes vergessen kann, den nowplaying-Status zu canceln (Pitfall 10).
 *
 * 2. Music.app spielt aktiv: Last.fm bevorzugen, weil NepTunes oft saubere Metadaten
 *    liefert (Künstler-Splits, Featured Artists). Fallback auf AppleScript-Daten,
 *    wenn Last.fm gerade null liefert (NepTunes-Lag von 5-15s nach Track-Wechsel,
 *    Pitfall 9).
 *
 * Vertrag (SRC-05): wirft NIE. Beide Adapter mappen Errors intern auf null/Result.
 * Zusätzlicher Top-Level-Guard nur als Belt-and-suspenders gegen unerwartete
 * Throws (z. B. Out-of-Memory, importfehler in Sub-Modulen).
 */
export const getNowPlaying: NowPlayingSource = async () => {
  try {
    // Step 1: AppleScript-Authority abfragen
    const appleState = await getAppleScriptState();

    if (appleState.state === null) {
      // Music.app läuft nicht (Outer-Guard) ODER AppleScript-Fehler.
      // → fallback nur auf Last.fm; wenn auch das null liefert, ist Status leer.
      // Begründung für Fallback: User könnte Music.app geschlossen haben, aber
      // Spotify/Browser-Audio läuft und NepTunes scrobbelt das. Sehr selten,
      // aber kein Schaden, weil AppleScript-Authority hier nicht verfügbar ist.
      return await getLastFmNowPlaying();
    }

    if (appleState.state !== "playing") {
      // Authority sagt: pausiert/gestoppt → Status leeren.
      // Last.fm wird BEWUSST nicht abgefragt — siehe Pitfall 10:
      // NepTunes löscht den nowplaying-Eintrag nicht aktiv, der bleibt für
      // bis zu 10min stale. AppleScript ist die Wahrheit.
      return null;
    }

    // appleState.state === "playing"
    // Step 2: Last.fm-Metadaten bevorzugen, AppleScript-np als Fallback.
    const fromLastFm = await getLastFmNowPlaying();
    if (fromLastFm) {
      return fromLastFm;
    }
    return appleState.np;
  } catch (err) {
    // Belt-and-suspenders: beide Adapter werfen by contract NIE.
    // Wenn wir hier landen, ist etwas Unerwartetes passiert (z. B. Modul-Load-Error
    // bei dynamischem Import, Out-of-Memory). Loggen + null zurückgeben statt
    // den Caller (Polling-Loop in Phase 3) crashen zu lassen.
    log.error({ err }, "[chain] unexpected error in getNowPlaying — returning null");
    return null;
  }
};
