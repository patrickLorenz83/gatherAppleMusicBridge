---
phase: 2
phase_name: Now-Playing-Sources
gathered: 2026-05-08
status: ready_for_planning
mode: auto-generated (skip_discuss=true)
---

# Phase 2: Now-Playing-Sources — Context

<domain>
## Phase Boundary

**Goal:** Bridge kann den aktuell laufenden Track aus Last.fm oder Music.app via AppleScript holen, mit AppleScript als Authority für Play/Pause/Stop und sauberem Fallback-Verhalten bei Source-Fehlern.

**Requirements (5):** SRC-01, SRC-02, SRC-03, SRC-04, SRC-05

**Success Criteria:**
1. Wenn Music.app spielt und NepTunes scrobbelt, liefert die Source-Chain `{artist, track}` aus Last.fm filtered per `@attr.nowplaying === "true"` (nicht per Position).
2. Wenn Last.fm `nowplaying`-leer oder per HTTP-Error fehlschlägt, fallt die Chain auf AppleScript zurück und liefert die Daten aus Music.app.
3. Wenn Music.app pausiert oder gestoppt ist, liefert die Source-Chain `null` (auch wenn Last.fm noch ein stale `nowplaying=true` zurückgibt) — AppleScript ist Authority für Play/Pause/Stop.
4. AppleScript startet Music.app niemals ungewollt: bei nicht laufender Music.app gibt der Outer-Guard `null` zurück, ohne `tell application "Music"` ohne Running-Check auszuführen.
5. Einzelner Source-Fehler (Last.fm 503, AppleScript-Error) wird in der Chain zu `null` gemappt und geloggt, ohne den Caller zu crashen.
</domain>

<decisions>
## Implementation Decisions (Locked)

Aus CLAUDE.md (Tech-Stack-Recherche), PROJECT.md, REQUIREMENTS.md:

- **Last.fm-Client:** Roll-your-own native `fetch` (kein npm-Paket — siehe STACK.md Begründung). 30 Zeilen Code, 0 zusätzliche Deps.
- **AppleScript:** `run-applescript@7.x` von sindresorhus (ESM-only, schon `"type": "module"` aktiv).
- **AppleScript-Outer-Guard:** `System Events` prüft `application process "Music" exists` BEVOR `tell application "Music"` ausgeführt wird. Verhindert Auto-Start.
- **Source-Chain-Pattern:** Async-Function `getNowPlaying(): Promise<NowPlaying>`, intern: Last.fm versuchen → bei null oder error AppleScript versuchen → AppleScript als Pause-Authority überschreibt Last.fm-`nowplaying=true` bei `paused/stopped` State.
- **Error-zu-null-Mapping:** Try/Catch um jeden Source-Aufruf, Fehler wird mit Log + return `null` aufgefangen. Kein Throw nach oben.
- **Zod-Validation für Last.fm-Response:** Schema-Parse für `recenttracks.track[0]` — schützt gegen API-Schluckauf (PITFALLS.md).

### Module-Layout

- `src/sources/types.ts` — `NowPlayingSource`-Interface
- `src/sources/lastfm.ts` — Last.fm-Adapter (`getRecentTracks`, Filter `@attr.nowplaying`)
- `src/sources/applescript.ts` — AppleScript-Adapter mit Running-Check, Player-State, Track-Info
- `src/sources/chain.ts` — Source-Chain mit AppleScript-as-Authority-Logic
- Optional: erweitere `src/types.ts` um `PlayerState = "playing" | "paused" | "stopped" | null`

### Last.fm-API

- Endpoint: `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&user=${LASTFM_USER}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
- Rate-Limit: 5 Calls/Sek/IP. 10s-Polling = 0.1 Calls/Sek, weit drunter.
- Filter: `data.recenttracks.track[0]['@attr']?.nowplaying === "true"`
- Bei null/Error → return null

### AppleScript-Quellen

```applescript
-- Outer-Guard: nur wenn Music.app läuft
tell application "System Events"
  if not (exists application process "Music") then return ""
end tell
tell application "Music"
  if player state is not playing then return ""
  return (get artist of current track) & "|||" & (get name of current track)
end tell
```

Output-Parsing: `result.split("|||")` → `{artist, track}`.

`player state` Values: `playing | paused | stopped | fast forwarding | rewinding`. Nur `playing` → setzt Status. Sonst null.
</decisions>

<code_context>
## Existing Code (aus Phase 1)

- `src/types.ts` — `NowPlaying = { artist, track } | null` (kann erweitert werden)
- `src/config.ts` — exposed `config.LASTFM_API_KEY`, `config.LASTFM_USER`
- `src/logger.ts` — pino mit Redaction
- `src/setup-ws.ts`, `src/sink/gather.ts`, `scripts/test-sink.ts`
- `package.json` — ESM, NodeNext, native fetch verfügbar
- `tsconfig.json` — strict, NodeNext
</code_context>

<specifics>
## Specific Notes (PITFALLS-Recherche)

- **Last.fm `nowplaying`-Stale (Pitfall 1):** Wenn der User pausiert, schickt NepTunes kein "stopped"-Event an Last.fm — der `nowplaying=true`-Track bleibt für Minuten stehen. Lösung: AppleScript ist Pause-Authority. Wenn AppleScript sagt "paused" oder "stopped", überschreibt das den Last.fm-Status mit `null`.
- **AppleScript Auto-Start (Pitfall 6):** `tell application "Music" to player state` STARTET Music.app, wenn sie nicht läuft. Pflicht-Pattern: erst `System Events → application process "Music" exists` prüfen.
- **AppleScript-Permission (Pitfall 13):** macOS TCC fragt beim ersten `osascript`-Run nach Automation-Permission. In Phase 2 ist das beim ersten `npm run` der Source-Tests sichtbar; in Phase 4 wird der Permission-Trigger im Foreground (Install-Script) durchgeführt.
- **Last.fm-Response-Schluckauf:** Empty `track`-Array, fehlende `@attr`, missing fields. Zod-Schema mit `optional()` für die kritischen Pfade.

### Source-Chain-Logic (Pseudo-Code)

```
async getNowPlaying() {
  // Step 1: AppleScript checkt Player-State (Authority)
  const appleState = await getAppleScriptState();
  // {state: "playing"|"paused"|"stopped"|null, np: NowPlaying|null}
  
  if (appleState === null) {
    // Music.app nicht installiert oder läuft nicht — fallback auf Last.fm
    return await getLastFmNowPlaying() || null;
  }
  
  if (appleState.state !== "playing") {
    // Pause/Stop → Authority sagt: nichts spielt
    return null;
  }
  
  // Step 2: Last.fm bevorzugen wenn verfügbar (genauere Metadaten via NepTunes)
  const lastfm = await getLastFmNowPlaying();
  if (lastfm) return lastfm;
  
  // Fallback auf AppleScript-Daten
  return appleState.np;
}
```

Begründung: Last.fm bevorzugen, weil NepTunes-Scrobbles oft sauberer formatiert sind (Künstler-Splits, Featured Artists). AppleScript als Authority NUR für Play/Pause/Stop.

### Status-Format

`{artist, track}` aus beiden Sources, KEIN Format-Wrapping hier. Format-Composing macht der Sink in Phase 1 (`♫ ${artist} – ${track}`).
</specifics>

<deferred>
## Deferred to Later Phases

- Polling-Loop, Track-Diff, SIGTERM → Phase 3
- launchd → Phase 4
- Source-Labels in Logs (`[lastfm]` vs `[applescript]`) → v2 (QOL-03), aber wir nutzen sie schon im pino-Log-Prefix
- Status-Längen-Cap → v2 (QOL-01)
</deferred>
