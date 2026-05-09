import type { NowPlaying, PlayerState } from "../types.js";

/**
 * Now-Playing-Source-Funktion: liefert {artist, track} oder null.
 *
 * Wirft NICHT — alle Errors werden intern auf null gemappt + via pino geloggt.
 * Der Caller (Polling-Loop) darf sich darauf verlassen.
 */
export type NowPlayingSource = () => Promise<NowPlaying>;

/**
 * Result-Shape des AppleScript-Adapters.
 *
 * - state === null:        Music.app läuft nicht ODER AppleScript-Error. np = null.
 * - state === "playing":   Music.app spielt aktiv. np = {artist, track}.
 * - state === "paused"|"stopped": Music.app pausiert/gestoppt. np = null.
 */
export type AppleScriptResult = {
  state: PlayerState;
  np: NowPlaying;
};
