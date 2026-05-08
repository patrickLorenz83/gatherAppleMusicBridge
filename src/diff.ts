import type { NowPlaying } from "./types.js";

/**
 * Composite-Key für Track-Diff (LOOP-02).
 *
 * - `null` (= nichts spielt, Pause/Stop/Music-not-running) → `null`
 * - sonst: `"${artist.trim().toLowerCase()}|${track.trim().toLowerCase()}"`
 *
 * Lowercase + trim verhindert false-positive Track-Wechsel bei Schreibweisen-
 * Schwankungen zwischen Last.fm und AppleScript (z.B. "Daft Punk" vs "DAFT PUNK"
 * oder Trailing-Whitespace aus AppleScript-Output, Pitfall 15).
 *
 * Vergleich `===` gegen `lastKey` deckt alle vier Übergänge ab:
 *   null  → null:  kein Action
 *   null  → key:   setStatus
 *   key   → null:  clearStatus
 *   key1  → key2:  setStatus
 *   key   → key:   kein Action (idempotent, LOOP-02)
 */
export function nowPlayingKey(np: NowPlaying): string | null {
  if (np === null) return null;
  return `${np.artist.trim().toLowerCase()}|${np.track.trim().toLowerCase()}`;
}
