import type { NowPlaying, PlayerState } from "../types.js";

/**
 * Gemeinsames Interface für Now-Playing-Sources (SRC-05).
 *
 * Eine Source-Funktion liefert immer ein `Promise<NowPlaying>`, also entweder
 * {artist, track} oder null. Sie wirft NICHT — alle Source-Errors werden intern
 * zu null gemappt + via pino geloggt. Der Caller (Source-Chain in Plan 02-02)
 * darf sich darauf verlassen, dass eine Source-Funktion nie crasht.
 *
 * Beispiel-Implementationen:
 * - getLastFmNowPlaying() in src/sources/lastfm.ts
 * - Helper-Wrapper im Composer (Plan 02-02), der getAppleScriptState auf NowPlaying reduziert
 */
export type NowPlayingSource = () => Promise<NowPlaying>;

/**
 * Result-Shape des AppleScript-Adapters (Task 4).
 *
 * Trägt zusätzlich zum Track-Info den Player-State, weil dieser Authority für
 * Play/Pause/Stop ist (SRC-03) und in der Source-Chain (Plan 02-02) gegen den
 * Last.fm-Wert priorisiert wird.
 *
 * Vertrag:
 * - state === null:        Music.app läuft nicht ODER AppleScript hat gefailed.
 *                          np ist immer null.
 * - state === "playing":   Music.app spielt aktiv. np ist {artist, track}
 *                          aus Music.app (kann von Last.fm-Daten in der Chain
 *                          überschrieben werden, weil NepTunes oft saubere Metadaten liefert).
 * - state === "paused"|"stopped": Music.app läuft, aber spielt nicht.
 *                          np ist immer null. Authority überschreibt
 *                          stale Last.fm-nowplaying in der Chain.
 */
export type AppleScriptResult = {
  state: PlayerState;
  np: NowPlaying;
};
