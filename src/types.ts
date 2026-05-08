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
