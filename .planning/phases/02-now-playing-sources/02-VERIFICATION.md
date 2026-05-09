---
phase: 02-now-playing-sources
verified: 2026-05-08T16:39:41Z
status: human_needed
score: 5/5 must-haves verified (statisch); 1 Live-Verifikation offen
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Music.app komplett geschlossen lassen (Cmd+Q in Music.app), dann `npm run test:sources` ausführen"
    expected: "Output zeigt `[2/3] AppleScript result` mit `{state: null, np: null}`. Music.app springt NICHT auf — Outer-Guard hat geblockt (SRC-04)."
    why_human: "Auto-Start-Prevention ist ein Verhalten, das nur durch einen Live-Run mit geschlossener Music.app verifizierbar ist. Statische Code-Analyse bestätigt das Pattern (`if not (exists application process \"Music\") then return \"\"` vor `tell application \"Music\"`), aber ob macOS sich daran wirklich hält und Music.app nicht doch im Hintergrund startet, ist OS-Verhalten und braucht eine reale Beobachtung."
  - test: "Music.app spielen + Spotify-Song in Apple Music, NepTunes aktiv. `npm run test:sources` ausführen, danach Music.app pausieren und Script erneut ausführen."
    expected: "Lauf 1: Chain liefert `{artist, track}` (Last.fm bevorzugt). Lauf 2: Chain liefert `null`, obwohl `[1/3] Last.fm` evtl. noch einen nowplaying-Track liefert (NepTunes-Lag) — AppleScript-Authority überschreibt (SRC-03)."
    why_human: "Authority-Override gegen stale Last.fm-Daten verlangt einen echten Pause-Zeitfenster, in dem NepTunes noch nowplaying meldet. Das ist nicht synthetisch reproduzierbar — Code-Pfad `if (appleState.state !== \"playing\") return null;` ist aber statisch verifiziert."
  - test: "TCC-Permission-Erst-Run: Falls Node noch keine Automation-Permission für Music.app hat, `npm run test:sources` ausführen — macOS-Permission-Prompt erscheint."
    expected: "User akzeptiert Prompt, danach läuft AppleScript-Adapter ohne -1743-Fehler. Bei Ablehnung: log.warn mit System-Settings-Hinweis, `{state: null, np: null}`."
    why_human: "TCC-Prompt ist OS-Dialog, der nur unter realen Bedingungen erscheint. Statisch verifiziert: Pattern `message.includes(\"-1743\")` ist im Code vorhanden."
---

# Phase 2: Now-Playing-Sources Verification Report

**Phase Goal:** Bridge kann den aktuell laufenden Track aus Last.fm oder Music.app via AppleScript holen, mit AppleScript als Authority für Play/Pause/Stop und sauberem Fallback-Verhalten bei Source-Fehlern.

**Verified:** 2026-05-08T16:39:41Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (aus ROADMAP Success Criteria + Plan-Frontmatter)

| #   | Truth (SC aus ROADMAP)                                                                                                                                              | Status     | Evidence                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1 | Last.fm liefert `{artist, track}` filtered per `@attr.nowplaying === "true"` (nicht per Position)                                                                   | ✓ VERIFIED | `src/sources/lastfm.ts:74` — `tracks.find((t) => t["@attr"]?.nowplaying === "true")`. Kein `track[0]`. Zod-Schema akzeptiert Array oder Single-Object (Last.fm-Quirk) via `z.union(...)` Zeile 45.                                                                                                                                |
| SC2 | Bei Last.fm-Fail (HTTP-Error oder leer) fallt Chain auf AppleScript-Daten zurück                                                                                    | ✓ VERIFIED | `src/sources/chain.ts:49-53` — `const fromLastFm = await getLastFmNowPlaying(); if (fromLastFm) return fromLastFm; return appleState.np;`. Last.fm liefert `null` bei `!res.ok`, Timeout, Zod-Fehler (`lastfm.ts:62, 88-94`); AppleScript-`np` ist im playing-Branch verfügbar.                                                   |
| SC3 | Bei `paused`/`stopped` liefert Chain `null`, auch wenn Last.fm noch nowplaying meldet — AppleScript ist Authority                                                   | ✓ VERIFIED | `src/sources/chain.ts:39-45` — `if (appleState.state !== "playing") { return null; }` BEVOR `getLastFmNowPlaying()` überhaupt aufgerufen wird. AppleScript-Script Zeile 43: `if s is not "playing" then return "STATE:" & s` setzt state korrekt auf paused/stopped.                                                              |
| SC4 | AppleScript startet Music.app niemals: bei nicht laufender Music.app gibt Outer-Guard `null` zurück, OHNE `tell application "Music"` ohne Running-Check auszuführen | ✓ VERIFIED | `src/sources/applescript.ts:38-40` — `tell application "System Events"` / `if not (exists application process "Music") then return ""`. Der Outer-Guard sitzt ZUERST, bevor `tell application "Music"` (Zeile 41) ausgeführt wird. Live-Verifikation der Auto-Start-Prevention bleibt human_verification (siehe unten).          |
| SC5 | Einzelner Source-Fehler (Last.fm 503, AppleScript-Error) wird zu `null` gemappt + geloggt, ohne Caller zu crashen                                                   | ✓ VERIFIED | Drei Layer: (1) `lastfm.ts:88-94` try/catch um gesamten fetch+parse, log.warn + null. (2) `applescript.ts:81-95` try/catch um runAppleScript, TCC-Error-Branch (-1743), log.warn + `{state: null, np: null}`. (3) `chain.ts:54-61` Top-Level-Belt-and-suspenders try/catch mit log.error + null. Keine `throw`-Statements. |

**Score:** 5/5 Roadmap-Success-Criteria statisch verifiziert. Live-Smoke (3 Items) wartet auf Human.

### PLAN-Frontmatter Truths (zusätzliche Detail-Asserts)

| Plan        | Truth                                                                                                | Status     | Evidence                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02-01 T1    | Last.fm-Adapter liefert null bei HTTP-Fehler / Zod-Parse-Fehler / fehlendem nowplaying-Track         | ✓ VERIFIED | `lastfm.ts:62` (HTTP), `lastfm.ts:88-94` (Zod/JSON via catch), `lastfm.ts:75-79` (kein nowplaying)                                                                                |
| 02-01 T2    | AppleScript liefert null wenn Music.app nicht läuft — startet Music.app niemals                      | ✓ VERIFIED | Script Zeile 38-40, `applescript.ts:99-102` (trimmed === "" → state:null)                                                                                                         |
| 02-01 T3    | AppleScript liefert PlayerState `paused`/`stopped` wenn Music.app läuft, aber nicht spielt           | ✓ VERIFIED | Script Zeile 43, `parsePlayerState` Zeile 65-77, Branch `applescript.ts:104-107`                                                                                                  |
| 02-01 T4    | AppleScript liefert `{state: 'playing', np: {artist, track}}` wenn Music.app spielt                  | ✓ VERIFIED | Script Zeile 50, Parser `applescript.ts:109-124`                                                                                                                                  |
| 02-02 T1    | getNowPlaying() liefert null bei Apple state=null UND Last.fm null                                   | ✓ VERIFIED | `chain.ts:30-37` — `return await getLastFmNowPlaying()` (das `await` einer Funktion, die null returnt = null Composer-Output)                                                     |
| 02-02 T2    | getNowPlaying() bevorzugt Last.fm wenn state=playing UND Last.fm liefert Track                       | ✓ VERIFIED | `chain.ts:49-52` — Last.fm wird ZUERST gefragt im playing-Branch, AppleScript-np nur bei Null-Last.fm                                                                             |
| 02-02 T3    | getNowPlaying() fällt auf AppleScript-np zurück wenn state=playing aber Last.fm null                 | ✓ VERIFIED | `chain.ts:53` — `return appleState.np;`                                                                                                                                            |
| 02-02 T4    | scripts/test-sources.ts gibt JSON-Output für 3 separate Calls aus                                    | ✓ VERIFIED | `scripts/test-sources.ts:32, 37, 42` — drei pino-log.info-Calls mit `{result: ...}`                                                                                               |

### Required Artifacts

| Artifact                       | Expected                                                  | Status     | Details                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                 | run-applescript@^7.1.0 als Dep, test:sources-Script       | ✓ VERIFIED | `package.json:23` — `"run-applescript": "^7.1.0"`. `package.json:16` — `"test:sources": "tsx scripts/test-sources.ts"`. Modul installiert in node_modules. |
| `src/types.ts`                 | NowPlaying + PlayerState exportiert                       | ✓ VERIFIED | NowPlaying Zeile 10-13, PlayerState Zeile 27 (`"playing" \| "paused" \| "stopped" \| null`)                                                              |
| `src/sources/types.ts`         | NowPlayingSource + AppleScriptResult exportiert           | ✓ VERIFIED | NowPlayingSource Zeile 15, AppleScriptResult Zeile 34-37                                                                                                 |
| `src/sources/lastfm.ts`        | getLastFmNowPlaying mit native fetch + Zod                | ✓ VERIFIED | Export Zeile 49, native fetch Zeile 60, Zod Zeile 35-47, AbortSignal.timeout(5000)                                                                       |
| `src/sources/applescript.ts`   | getAppleScriptState mit Outer-Guard + Authority           | ✓ VERIFIED | Export Zeile 79, Outer-Guard Script Zeile 38-40, parsePlayerState Zeile 65-77, TCC -1743-Detection Zeile 86                                              |
| `src/sources/chain.ts`         | getNowPlaying-Composer mit Authority-Logic                | ✓ VERIFIED | Export Zeile 25, drei Branches (Zeile 30, 39, 49), Top-Level try/catch                                                                                   |
| `scripts/test-sources.ts`      | Smoke-Test mit drei separaten Calls                       | ✓ VERIFIED | Datei existiert, Imports Zeile 22-25, drei Calls Zeile 32/37/42                                                                                          |

### Key Link Verification

| From                       | To                                  | Via                                                | Status   | Details                                                                                                                          |
| -------------------------- | ----------------------------------- | -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/sources/lastfm.ts`    | ws.audioscrobbler.com/2.0           | native fetch mit AbortSignal.timeout(5000)         | ✓ WIRED  | `lastfm.ts:60` — `await fetch(url, { signal: AbortSignal.timeout(5000) })`                                                      |
| `src/sources/lastfm.ts`    | @attr.nowplaying-Filter             | tracks.find via Zod-validierte Tracks              | ✓ WIRED  | `lastfm.ts:74` — `tracks.find((t) => t["@attr"]?.nowplaying === "true")`                                                        |
| `src/sources/applescript.ts` | Music.app (via System Events)     | Outer-Guard im AppleScript-Inline-Script           | ✓ WIRED  | Script Zeile 38-40 — `tell application "System Events" / if not (exists application process "Music") then return ""`            |
| `src/sources/applescript.ts` | src/logger.ts                     | log.warn bei AppleScript-Errors                    | ✓ WIRED  | `applescript.ts:87, 92, 115, 121, 127` — fünf log.warn-Calls für verschiedene Fehlerpfade                                       |
| `src/sources/chain.ts`     | src/sources/applescript.ts          | getAppleScriptState() Authority-Check vor Last.fm  | ✓ WIRED  | `chain.ts:4` Import, `chain.ts:28` Aufruf — Authority-Sequenz im Composer                                                       |
| `src/sources/chain.ts`     | src/sources/lastfm.ts               | getLastFmNowPlaying() bei state=playing            | ✓ WIRED  | `chain.ts:3` Import, `chain.ts:36, 49` Aufrufe (Fallback-Branch + playing-Branch)                                                |
| `scripts/test-sources.ts`  | chain + lastfm + applescript        | drei separate Calls für Diff-Beobachtung           | ✓ WIRED  | Imports Zeile 23-25, alle drei Funktionen aufgerufen                                                                              |

### Data-Flow Trace (Level 4)

| Artifact                     | Data Variable                | Source                                                  | Produces Real Data | Status      |
| ---------------------------- | ---------------------------- | ------------------------------------------------------- | ------------------ | ----------- |
| `src/sources/lastfm.ts`      | `np` (gefilterter Track)     | Last.fm HTTP-API (echter Endpoint, kein Mock)           | Bedingt¹           | ✓ FLOWING   |
| `src/sources/applescript.ts` | `out` (AppleScript stdout)   | `runAppleScript(SCRIPT)` gegen Music.app + System Events | Bedingt²           | ✓ FLOWING   |
| `src/sources/chain.ts`       | `appleState`, `fromLastFm`   | Echte Aufrufe an die zwei Adapter (kein Mock)            | Bedingt¹²          | ✓ FLOWING   |

¹ Last.fm liefert echte Daten, sofern NepTunes scrobbelt — sonst gewollt `null`. Kein hardcoded Stub.
² AppleScript liefert echte Daten, sofern Music.app läuft — sonst gewollt `null`. Kein hardcoded Stub.

### Behavioral Spot-Checks

| Behavior                                                          | Command                                                                | Result                                                                                       | Status   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| TypeScript-Compile clean                                          | `npx tsc -p . --noEmit`                                                | exit 0, keine Errors                                                                         | ✓ PASS   |
| run-applescript@^7.1.0 als Runtime-Dep                            | `node -e ... package.json.dependencies['run-applescript']`             | `^7.1.0`                                                                                     | ✓ PASS   |
| test:sources-Script registriert                                   | `node -e ... package.json.scripts['test:sources']`                     | `tsx scripts/test-sources.ts`                                                                | ✓ PASS   |
| run-applescript installiert                                       | `ls node_modules/run-applescript/index.js`                             | Datei existiert                                                                              | ✓ PASS   |
| AppleScript-Outer-Guard-Syntax gültig                              | `osascript -e '...System Events / exists application process "Music"'` | Live-Test gibt "RUNNING" zurück (Music.app lief). Syntax ist gültig.                          | ✓ PASS   |
| Anti-Patterns (TODO/FIXME/PLACEHOLDER) in Sources                 | grep über src/sources/* + scripts/test-sources.ts + src/types.ts        | keine Treffer                                                                                | ✓ PASS   |
| Live Auto-Start-Prevention bei geschlossener Music.app             | `osascript -e ...` mit Music.app komplett beendet                       | nicht reproduzierbar — Music.app lief während Verifikation                                    | ? SKIP → human_verification |
| Live Authority-Override mit stale Last.fm-nowplaying               | `npm run test:sources` mit Pause + NepTunes-Lag                         | erfordert echte NepTunes-Lag-Beobachtung                                                      | ? SKIP → human_verification |
| Live TCC-Prompt-Verhalten                                          | erst-Run unter launchd                                                  | erfordert frischen Permission-State                                                          | ? SKIP → human_verification |

### Requirements Coverage

| Requirement | Source Plan       | Description                                                               | Status        | Evidence                                                                         |
| ----------- | ----------------- | ------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| SRC-01      | 02-01-PLAN        | Last.fm `user.getRecentTracks` + `@attr.nowplaying === "true"`-Filter     | ✓ SATISFIED   | `src/sources/lastfm.ts:74` (`tracks.find((t) => t["@attr"]?.nowplaying === "true")`) |
| SRC-02      | 02-01, 02-02-PLAN | AppleScript-Fallback wenn Last.fm nichts liefert                          | ✓ SATISFIED   | `src/sources/chain.ts:49-53` (Last.fm-bevorzugt mit AppleScript-Fallback)        |
| SRC-03      | 02-01, 02-02-PLAN | AppleScript ist Authority für Play/Pause/Stop (überschreibt stale Last.fm) | ✓ SATISFIED   | `src/sources/chain.ts:39-45` + `applescript.ts:43` (player-state-Branch)         |
| SRC-04      | 02-01-PLAN        | System Events Outer-Guard verhindert Music.app-Auto-Start                  | ✓ SATISFIED¹  | `src/sources/applescript.ts` Script Zeile 38-40                                  |
| SRC-05      | 02-01, 02-02-PLAN | NowPlayingSource-Interface + Error-zu-null-Mapping (kein Throw)            | ✓ SATISFIED   | `src/sources/types.ts:15` + try/catch in lastfm/applescript/chain                |

¹ Statisch verifiziert. Live-Auto-Start-Prevention siehe human_verification.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| —    | —    | —       | —        | Keine Anti-Patterns gefunden (kein TODO/FIXME/PLACEHOLDER, keine empty handlers, keine hardcoded `[]`/`{}` als Stub-Returns). |

### Human Verification Required

Drei Items, die nur durch Live-Beobachtung mit echtem Apple Music + NepTunes verifizierbar sind:

#### 1. Auto-Start-Prevention (SC4)

**Test:** Music.app komplett beenden (Cmd+Q), dann `npm run test:sources` ausführen.
**Erwartet:**
- `[2/3] AppleScript result` zeigt `{state: null, np: null}`
- Music.app springt **nicht** auf
- Activity Monitor bestätigt: kein Music-Prozess gestartet
**Warum Mensch:** Auto-Start-Prevention ist OS-Verhalten. Statisch ist das Pattern korrekt (`exists application process "Music"`-Check vor `tell application "Music"`), aber die endgültige Garantie liegt im macOS-AppleScript-Subsystem.

#### 2. Authority-Override gegen stale Last.fm (SC3)

**Test:** Music.app einen Track abspielen lassen mit aktivem NepTunes-Scrobbling. `npm run test:sources` (Lauf 1). Music.app pausieren. Innerhalb 30s erneut `npm run test:sources` (Lauf 2).
**Erwartet:**
- Lauf 1: `[3/3] Chain result` = `{artist, track}` (von Last.fm bevorzugt)
- Lauf 2: `[1/3] Last.fm result` evtl. noch `{artist, track}` (NepTunes-Lag, stale nowplaying), aber `[2/3] AppleScript result` = `{state: "paused", np: null}` und `[3/3] Chain result` = `null`
**Warum Mensch:** Stale-Override braucht ein Zeitfenster, in dem NepTunes noch nicht den nowplaying-Status gelöscht hat. Reproduzierbar nur live.

#### 3. TCC-Permission-Erst-Run

**Test:** Falls Node noch keine Automation-Permission für Music.app hat: `npm run test:sources` ausführen.
**Erwartet:** macOS-Dialog "node möchte Music steuern" erscheint. Nach Akzeptieren läuft AppleScript-Adapter ohne `-1743`-Fehler. Bei Ablehnen: `log.warn` mit System-Settings-Hinweis, `{state: null, np: null}`.
**Warum Mensch:** TCC-Prompt ist ein OS-Dialog, der nur bei realer Berechtigungs-Anforderung erscheint.

### Gaps Summary

Keine BLOCKER. Alle 5 Roadmap Success Criteria sind statisch in der Codebase verifiziert:
- Last.fm `@attr.nowplaying`-Filter (kein Index-basiertes `track[0]`)
- AppleScript-Fallback verdrahtet via Composer
- Authority-Pattern (`if state !== "playing" return null` BEVOR Last.fm gefragt wird)
- Outer-Guard via System Events vor `tell application "Music"`
- Try/catch in allen drei Modulen + Top-Level-Composer-Guard

Drei Items wandern zu **human_verification**, weil sie OS-Verhalten (Auto-Start-Prevention, TCC-Prompt) bzw. eine stale-Datenkonstellation (NepTunes-Lag bei Pause) erfordern, die nicht synthetisch reproduzierbar ist. Dies ist im Plan 02-02 explizit als optionale User-Verifikation markiert (`<output>`-Block) und Phase-konform.

**Empfehlung:** Phase 2 ist code-vollständig. Vor Übergabe in Phase 3 sollte der User die drei human_verification-Items einmal manuell durchlaufen — sie sind die einzigen Verifikationspfade, die Phase-2-Pitfalls (1, 7, 10) tatsächlich gegen Realität prüfen.

---

_Verified: 2026-05-08T16:39:41Z_
_Verifier: Claude (gsd-verifier)_
