/**
 * Now-Playing-Daten aus einer Source (Last.fm oder AppleScript).
 *
 * `null` bedeutet "gerade läuft nichts" oder "Source liefert keine Daten" —
 * der Sink interpretiert das als `clearStatus()`.
 *
 * Wird in Phase 2 von SRC-* Sources erzeugt und in Phase 3 vom Polling-Loop
 * konsumiert. In Phase 1 nur vom GatherSink genutzt (hardcoded im Smoke-Test).
 */
export type NowPlaying = {
  artist: string;
  track: string;
} | null;

/**
 * Player-State von Music.app, ermittelt via AppleScript (SRC-03).
 *
 * - "playing":  aktiv abspielend
 * - "paused":   pausiert (Authority sagt: Status leeren, auch wenn Last.fm noch nowplaying meldet)
 * - "stopped":  gestoppt
 * - null:       Music.app läuft nicht (Outer-Guard hat geblockt) ODER AppleScript-Fehler
 *
 * In Phase 2 (SRC-03 + SRC-04) ist AppleScript Authority für Play/Pause/Stop —
 * dieser State entscheidet in der Source-Chain (Plan 02-02), ob Last.fm-Daten
 * überhaupt verwendet werden dürfen oder das Ergebnis hart auf `null` gesetzt wird.
 */
export type PlayerState = "playing" | "paused" | "stopped" | null;
