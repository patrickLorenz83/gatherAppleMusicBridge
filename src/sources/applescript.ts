import { runAppleScript } from "run-applescript";
import { log } from "../logger.js";
import type { AppleScriptResult } from "./types.js";
import type { PlayerState } from "../types.js";

/**
 * AppleScript-Adapter gegen Music.app (SRC-02, SRC-03, SRC-04, SRC-05).
 *
 * Outer-Guard (SRC-04, Pitfall 1):
 *   `tell application "System Events"` prüft `application process "Music" exists`,
 *   BEVOR `tell application "Music"` ausgeführt wird. Ohne diesen Guard würde
 *   `tell application "Music"` Music.app starten — der User schließt die App,
 *   der Daemon pollt 10s später, Music.app springt geisterhaft wieder auf.
 *
 * Authority-Pattern (SRC-03, Pitfall 10):
 *   Wenn Music.app pausiert/gestoppt ist, liefert dieser Adapter state="paused"/"stopped"
 *   plus np=null. In der Source-Chain (Plan 02-02) überschreibt das stale Last.fm-Data,
 *   wo NepTunes vergessen hat, den nowplaying-Status zu canceln.
 *
 * TCC-Permission (Pitfall 7 = Phase 4 DMN-03):
 *   Beim ersten Run unter launchd kann macOS einen Automation-Permission-Prompt
 *   zeigen, der im Hintergrund nicht erscheint. errno -1743 ("Not authorized to send
 *   Apple events") wird hier explizit erkannt und mit Hinweis auf System Settings
 *   geloggt. Phase 4's Install-Script triggert die Permission im Vordergrund (DMN-03).
 */

/**
 * Output-Format des Scripts:
 *   "" (leerer String):       Music.app läuft nicht (Outer-Guard greift)
 *   "STATE:<state>":          Music.app läuft, aber player state != playing
 *                             (z. B. "STATE:paused", "STATE:stopped", "STATE:fast forwarding")
 *   "PLAY:<artist>\t<track>": Music.app spielt einen Track ab
 *
 * Tab als Separator (Pitfall 15): in Track-Namen praktisch nie vorhanden.
 * Erste Zeile-Indikator (STATE:/PLAY:) als Disambiguator.
 */
const SCRIPT = `
tell application "System Events"
  if not (exists application process "Music") then return ""
end tell
tell application "Music"
  set s to player state as string
  if s is not "playing" then return "STATE:" & s
  try
    set a to artist of current track
    set t to name of current track
  on error
    return "STATE:" & s
  end try
  return "PLAY:" & a & tab & t
end tell
`;

/**
 * Wandelt einen Music.app-player-state-String in PlayerState um.
 *
 * Music.app kennt: playing | paused | stopped | fast forwarding | rewinding.
 * Für unsere Use-Case sind "fast forwarding" und "rewinding" wie "playing" zu
 * behandeln (User hört aktiv), aber Sicherheits-Default ist "paused" — Status
 * wird in der Chain auf null gesetzt, was korrekter ist als ein Track anzuzeigen,
 * der gerade übersprungen wird.
 *
 * Wir mappen also strikt nur die drei "stabilen" States; alles andere → "paused".
 */
function parsePlayerState(raw: string): PlayerState {
  switch (raw) {
    case "playing":
      return "playing";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    default:
      // fast forwarding, rewinding, oder unbekannt → vorsichtig "paused"
      return "paused";
  }
}

export async function getAppleScriptState(): Promise<AppleScriptResult> {
  let out: string;
  try {
    out = await runAppleScript(SCRIPT);
  } catch (err: unknown) {
    // SRC-05: jeder AppleScript-Error → log + Result mit state=null.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("-1743") || message.includes("Not authorized")) {
      log.warn(
        { err },
        "[applescript] TCC permission denied — open System Settings → Privacy → Automation → Node → Music",
      );
    } else {
      log.warn({ err }, "[applescript] script execution failed");
    }
    return { state: null, np: null };
  }

  const trimmed = out.trim();

  // Outer-Guard hat zugeschlagen: Music.app läuft nicht.
  if (trimmed === "") {
    return { state: null, np: null };
  }

  if (trimmed.startsWith("STATE:")) {
    const raw = trimmed.slice("STATE:".length);
    return { state: parsePlayerState(raw), np: null };
  }

  if (trimmed.startsWith("PLAY:")) {
    const payload = trimmed.slice("PLAY:".length);
    // Erstes Tab teilt Artist/Track. indexOf statt split für Robustheit:
    // wenn der Track-Name (extrem selten) ein Tab enthält, bleibt es im Track-Teil.
    const tabIdx = payload.indexOf("\t");
    if (tabIdx === -1) {
      log.warn({ out }, "[applescript] PLAY-line missing tab separator");
      return { state: null, np: null };
    }
    const artist = payload.slice(0, tabIdx).trim();
    const track = payload.slice(tabIdx + 1).trim();
    if (!artist || !track) {
      log.warn({ artist, track }, "[applescript] empty artist or track");
      return { state: null, np: null };
    }
    return { state: "playing", np: { artist, track } };
  }

  log.warn({ out }, "[applescript] unexpected output format");
  return { state: null, np: null };
}
