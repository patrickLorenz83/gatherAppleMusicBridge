---
phase: 02-now-playing-sources
plan: 01
subsystem: sources
tags: [typescript, esm, lastfm, applescript, sources, zod, run-applescript, fetch, nodenext]

requires:
  - phase: 01-foundation-und-gather-sink
    provides: "Config (LASTFM_API_KEY, LASTFM_USER), pino-Logger mit Redaction, NowPlaying-Type"
provides:
  - "PlayerState-Type (playing | paused | stopped | null) als Authority-Indikator"
  - "NowPlayingSource-Interface (() => Promise<NowPlaying>) als gemeinsamer Source-Vertrag"
  - "AppleScriptResult-Helper-Type ({state, np}) für Authority-Daten"
  - "getLastFmNowPlaying() — Last.fm-Adapter mit @attr.nowplaying-Filter"
  - "getAppleScriptState() — AppleScript-Adapter mit Outer-Guard und Player-State-Authority"
affects: [02-now-playing-sources/02-02 Source-Chain-Composer, 03-* Polling-Loop]

tech-stack:
  added:
    - "run-applescript@^7.1.0 (sindresorhus, ESM-only, 0 Runtime-Deps)"
  patterns:
    - "Source-Adapter-Vertrag: Errors zu null mappen + log.warn, niemals throw (SRC-05)"
    - "Defensives Zod-Schema für Drittpartei-APIs (Last.fm-Schluckauf-Toleranz)"
    - "AppleScript-Outer-Guard: System Events prüft Process-Existence vor tell-Block (Pitfall 1)"
    - "AppleScript-Output-Format mit Tab-Separator und STATE:/PLAY:-Disambiguator (Pitfall 15)"
    - "Native fetch + AbortSignal.timeout statt npm-Wrapper für Single-Endpoint-Use-Cases"

key-files:
  created:
    - "src/sources/types.ts — NowPlayingSource + AppleScriptResult"
    - "src/sources/lastfm.ts — Last.fm-Adapter"
    - "src/sources/applescript.ts — AppleScript-Adapter"
  modified:
    - "src/types.ts — PlayerState-Type ergänzt"
    - "package.json — run-applescript Dep ergänzt"
    - "package-lock.json — Lockfile aktualisiert"

key-decisions:
  - "Output-Format des AppleScript-Adapters: STATE:<state> bzw. PLAY:<artist>\\t<track> mit Tab-Separator. Track-Namen enthalten praktisch nie Tabs (Pitfall 15), und der STATE:/PLAY:-Prefix erlaubt eindeutige Branch-Logik im JS-Parser ohne Mehrzeilen-Ausgaben."
  - "runAppleScript (named import) statt execFile-osascript: weniger Code, sindresorhus' Wrapper kümmert sich um Escaping/Promise-API, ist ESM-only und damit ein clean fit für unser type=module."
  - "parsePlayerState mappt unbekannte States (fast forwarding/rewinding) auf 'paused' statt 'playing': Sicherheits-Default — die Source-Chain räumt damit den Status, statt potenziell falsche Track-Daten anzuzeigen."
  - "Last.fm: Roll-your-own statt npm-Paket (lastfm-ts-api): nur ein einziger Endpoint, native fetch reicht, keine zusätzliche Versions-Drift, defensives Zod-Schema deckt API-Schluckauf besser ab als ein Wrapper."
  - "Last.fm-Schema akzeptiert track als Array ODER Single-Object (Last.fm-Quirk bei einem Track) per z.union — verhindert ZodError beim ersten Run mit nur einem History-Track."
  - "TCC-Permission-Error (-1743) wird explizit erkannt und mit System-Settings-Hinweis geloggt — bereitet die professionelle Behandlung in Phase 4 (DMN-03 Install-Script) vor."

patterns-established:
  - "Source-Adapter-Pattern: Module unter src/sources/ exportieren named functions mit Promise<NowPlaying>-Vertrag. Imports nutzen .js-Extension (NodeNext)."
  - "Error-zu-null-Mapping mit pino log.warn als zentrale Stelle für Source-Failures"
  - "type-only-Imports (import type) für rein-typseitige Modul-Boundaries — vermeidet ungewollte Side-Effects beim Modul-Load"

requirements-completed: [SRC-01, SRC-02, SRC-03, SRC-04, SRC-05]

duration: 3min
completed: 2026-05-08
---

# Phase 02 Plan 01: Source-Adapter (Last.fm + AppleScript) Summary

**Last.fm- und AppleScript-Adapter implementiert; AppleScript ist Authority für Play/Pause/Stop, Last.fm liefert saubere Metadaten, beide mappen Errors stumm auf null.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-08T16:28:33Z
- **Completed:** 2026-05-08T16:31:10Z
- **Tasks:** 4 (5 atomic Commits)
- **Files modified:** 6 (3 neu, 3 verändert)

## Accomplishments

- run-applescript@^7.1.0 als Runtime-Dep installiert (ESM-only, 0 Runtime-Deps).
- PlayerState-Type in src/types.ts ergänzt (playing | paused | stopped | null), ohne den NowPlaying-Type zu verändern.
- Source-Interface NowPlayingSource und Helper-Type AppleScriptResult unter src/sources/types.ts angelegt.
- Last.fm-Adapter (src/sources/lastfm.ts) mit native fetch, AbortSignal.timeout(5000), defensivem Zod-Schema und @attr.nowplaying-Filter via tracks.find — Index-basiertes track[0] vermieden (Pitfall 3).
- AppleScript-Adapter (src/sources/applescript.ts) mit System-Events-Outer-Guard, Player-State-Check, Tab-Separator-Output, TCC-Error-Detection (-1743). Music.app wird nicht mehr gestartet, wenn sie geschlossen ist.
- Kein Throw nach oben in beiden Adaptern: jeder Fehler → log.warn + return null bzw. {state: null, np: null}.

## Task Commits

Jeder Task wurde atomar committet:

1. **Task 1: run-applescript installieren** — `6e6cbd4` (feat)
2. **Task 2a: PlayerState-Type ergänzt** — `2a7b842` (feat)
3. **Task 2b: NowPlayingSource + AppleScriptResult** — `d3d42e0` (feat)
4. **Task 3: Last.fm-Adapter** — `ea40810` (feat)
5. **Task 4: AppleScript-Adapter** — `16eab56` (feat)

## Files Created/Modified

**Created:**
- `src/sources/types.ts` — NowPlayingSource-Interface + AppleScriptResult
- `src/sources/lastfm.ts` — Last.fm-Adapter (native fetch + Zod)
- `src/sources/applescript.ts` — AppleScript-Adapter (Outer-Guard + Authority)

**Modified:**
- `src/types.ts` — PlayerState-Type ergänzt
- `package.json` — run-applescript@^7.1.0 als dependency
- `package-lock.json` — Lockfile aktualisiert

## Decisions Made

- **Output-Format STATE:/PLAY: mit Tab-Separator**: STATE:<s> wenn Music.app läuft aber nicht spielt, PLAY:<artist>\t<track> beim Abspielen, leerer String wenn Music.app nicht läuft. Tab-Separator ist robust (Track-Namen enthalten praktisch nie Tabs), und der STATE:/PLAY:-Prefix macht das JS-Parsing branch-eindeutig.
- **runAppleScript (named import) statt execFile-osascript**: kleinere Surface, sindresorhus' Wrapper bringt Promise-API + Escaping, kompatibel mit unserem ESM-Setup.
- **parsePlayerState mappt fast forwarding/rewinding auf "paused"**: Sicherheits-Default. Bei einem skip-and-seek-State will der User keinen Track-Status angezeigt bekommen. Lieber leerer Status als falscher Track.
- **Last.fm Roll-your-own statt npm-Paket**: nur ein Endpoint, native fetch reicht, defensives Zod-Schema fängt API-Quirks (Single-Object statt Array, fehlende @attr) zuverlässig ab.
- **TCC-Error (-1743) explizit erkannt**: Erste-Run-Reibung wird transparent geloggt mit Hinweis auf System Settings → Privacy → Automation. Die volle Permission-Behandlung kommt in Phase 4 (DMN-03 Install-Script).

## Deviations from Plan

None — plan executed exactly as written. Keine API-Abweichungen bei run-applescript@7 (Signatur `runAppleScript(script, options?): Promise<string>` matcht 1:1).

## Issues Encountered

- npm-Audit-Warnungen (3 high, 4 critical) bleiben aus Phase 1 (gather-game-client zieht alte axios und protobufjs). Erwartet, in Phase 1 dokumentiert, kein Blocker für Single-User-Tool ohne User-Inputs.

## User Setup Required

None — keine externe Service-Konfiguration in dieser Plan-Phase. TCC-Permission-Trigger erfolgt erst beim ersten Apple-Music-Run in Plan 02-02 (Smoke-Test) bzw. in Phase 4 via Install-Script.

## Next Phase Readiness

- **Plan 02-02 (Source-Chain-Composer)** kann jetzt:
  - `import { getLastFmNowPlaying } from "./lastfm.js"` in `src/sources/chain.ts`
  - `import { getAppleScriptState } from "./applescript.js"` in `src/sources/chain.ts`
  - Beide Adapter wirken nicht — Composer braucht keinen umfangreichen Error-Handling-Code, nur Belt-and-suspenders.
- **TCC-Permission**: Beim ersten Apple-Music-Run via `npm run test:sources` (Plan 02-02) erscheint einmalig der Automation-Permission-Prompt. User muss klicken — danach ist das Privileg dauerhaft.
- **SRC-01 bis SRC-05** sind durch die Adapter abgedeckt; vollständige Erfüllung des Phase-Goals erfolgt mit Plan 02-02.

## Self-Check: PASSED

- Files exist: src/sources/types.ts, src/sources/lastfm.ts, src/sources/applescript.ts, src/types.ts (modified) — all FOUND.
- Commits exist: 6e6cbd4, 2a7b842, d3d42e0, ea40810, 16eab56 — all FOUND.
- `npx tsc -p . --noEmit`: clean.
- Verification greps: alle pattern-Checks aus den Tasks matched.

---
*Phase: 02-now-playing-sources*
*Completed: 2026-05-08*
