---
phase: 02-now-playing-sources
plan: 02
subsystem: sources
tags: [typescript, esm, source-chain, composer, smoke-test, applescript-authority, neptunes]

requires:
  - phase: 02-now-playing-sources/02-01
    provides: "getLastFmNowPlaying, getAppleScriptState, NowPlayingSource-Interface, AppleScriptResult"
provides:
  - "getNowPlaying: NowPlayingSource — der einzige Entry-Point für die Polling-Loop in Phase 3"
  - "scripts/test-sources.ts — manuelles Smoke-Test-Script für die drei Source-Funktionen"
  - "npm-Script test:sources für tsx-Live-Run"
affects: [03-* Polling-Loop konsumiert getNowPlaying alle 10s]

tech-stack:
  added: []
  patterns:
    - "Composer-Pattern mit Authority-First: AppleScript zuerst, Last.fm nur wenn Authority spielt"
    - "Belt-and-suspenders Top-Level-try/catch im Composer trotz nicht-werfender Adapter (SRC-05 Layered Defense)"
    - "type-only NowPlayingSource-Annotation für Funktions-Signatur (statt nur als Interface)"

key-files:
  created:
    - "src/sources/chain.ts — getNowPlaying-Composer"
    - "scripts/test-sources.ts — Manueller Smoke-Test"
  modified:
    - "package.json — test:sources-Script ergänzt"

key-decisions:
  - "Pseudo-Code aus 02-CONTEXT.md 1:1 implementiert: keine Re-Orderings, keine parallele Promise.all-Optimierung. Die Authority-Logik braucht sequenzielle Ordnung — AppleScript-State entscheidet, ob Last.fm überhaupt relevant ist."
  - "Top-Level-try/catch im Composer als Belt-and-suspenders: beide Adapter werfen by contract NIE, aber 3 Zeilen Schutz gegen Modul-Load-Fehler oder Out-of-Memory sind günstig. SRC-05 ist damit auf Adapter- UND Composer-Ebene erfüllt."
  - "Separate Commits für scripts/test-sources.ts (feat) und package.json-Script-Eintrag (chore): einzeln revertierbar — falls ein User den npm-Script wieder rauswerfen will, bleibt das Script-File unangetastet."
  - "Kein parallelisiertes Promise.all([apple, lastfm]) im Composer: die Optimierung wäre maximal 100ms wert (Last.fm-Network vs AppleScript-Round-Trip), aber wenn AppleScript state===null oder !=='playing' meldet, ist der Last.fm-Call überflüssig oder sogar kontraproduktiv (NepTunes-Stale-Data, Pitfall 10)."
  - "scripts/test-sources.ts nutzt pino-Logger statt console.log: konsistent mit dem Phase-1-Pattern (test-sink.ts) und sorgt dafür, dass die Redaction-Strategy auch hier greift, falls jemand später einen Adapter um einen Key erweitert."

patterns-established:
  - "Source-Composer-Pattern: separate Module pro Source, ein zentrales chain.ts kombiniert sie. Phase-3 importiert nur getNowPlaying, kennt keine einzelnen Adapter."
  - "Smoke-Test-Pattern: scripts/<name>.ts mit pino-Logging, npm-Script-Eintrag test:<name>, main().catch(exit(1))."

requirements-completed: [SRC-02, SRC-03, SRC-05]

duration: 2min
completed: 2026-05-08
---

# Phase 02 Plan 02: Source-Chain-Composer Summary

**getNowPlaying-Composer kombiniert Last.fm- und AppleScript-Adapter zu einer Authority-First-Source-Chain — AppleScript entscheidet Play/Pause/Stop, Last.fm liefert die Metadaten, wenn Music.app läuft.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-08T16:31:10Z
- **Completed:** 2026-05-08T16:33:39Z
- **Tasks:** 2 (3 atomic Commits)
- **Files modified:** 3 (2 neu, 1 verändert)

## Accomplishments

- src/sources/chain.ts mit `getNowPlaying: NowPlayingSource` exportiert. Pseudo-Code aus 02-CONTEXT.md 1:1 umgesetzt: 1) AppleScript-State holen, 2) state===null → fallback Last.fm, 3) state!=='playing' → null (Authority überschreibt Last.fm-Stale), 4) Music.app spielt → Last.fm bevorzugen, AppleScript-np als Fallback.
- Top-Level-try/catch loggt unerwartete Errors via log.error und gibt null zurück — SRC-05 ist damit zweistufig (Adapter + Composer) abgesichert.
- scripts/test-sources.ts ruft alle drei Source-Funktionen einzeln auf und loggt strukturierte JSON-Ergebnisse via pino. Die Reihenfolge (Last.fm pur → AppleScript pur → Chain) macht das Diff zwischen Authority-Daten und Composer-Output direkt visuell vergleichbar.
- npm-Script `test:sources` ergänzt; `npm run test:sources` ist jetzt der manuelle Verifikations-Trigger.

## Task Commits

Jeder Task wurde atomar committet:

1. **Task 1: chain.ts Composer** — `40ae3e6` (feat)
2. **Task 2a: scripts/test-sources.ts** — `5131647` (feat)
3. **Task 2b: package.json test:sources-Script** — `06262f4` (chore)

## Files Created/Modified

**Created:**
- `src/sources/chain.ts` — Source-Chain-Composer mit Authority-Logic
- `scripts/test-sources.ts` — Manueller Smoke-Test für alle drei Source-Funktionen

**Modified:**
- `package.json` — test:sources-Script ergänzt

## Decisions Made

- **Pseudo-Code 1:1-Treue**: Keine Re-Orderings, keine parallele `Promise.all([apple, lastfm])`-Optimierung. Die Authority-Logik braucht sequenzielle Ordnung — wenn Music.app pausiert ist, ist Last.fm-Daten irrelevant (sogar schädlich, Pitfall 10).
- **Belt-and-suspenders Top-Level-try/catch**: 3 Zeilen Schutz gegen Modul-Load-Fehler oder unerwartete Throws. SRC-05 wird damit auf jeder Layer (Adapter + Composer) durchgesetzt.
- **Separate Commits feat/chore**: scripts/test-sources.ts und package.json-Script sind konzeptuell getrennt und einzeln revertierbar. Wenn der User später den npm-Script wieder rauswerfen will, bleibt der Script-Body unangetastet.
- **pino-Logger im Smoke-Test**: konsistent mit Phase-1 test-sink.ts. Redaction-Strategy greift auch hier, falls jemand später einen Adapter um einen Key erweitert.
- **Kein paralleles Promise.all**: 100ms Optimierung würde NepTunes-Stale-Data-Risiko erhöhen — wenn AppleScript pausiert meldet, wäre der parallele Last.fm-Call nicht nur überflüssig, sondern könnte stale Daten ins Spiel bringen, die wir explizit nicht haben wollen.

## Deviations from Plan

None — plan executed exactly as written. Pseudo-Code 1:1 umgesetzt, alle Verify-Greps matched.

## Issues Encountered

None. Smoke-Test-Live-Run nicht durchgeführt (optional laut Plan, würde TCC-Permission-Trigger und aktive Music.app-Session erfordern).

## User Setup Required

**Optional (kein Plan-Blocker):**

Beim ersten Lauf von `npm run test:sources` mit aktivem Apple Music erscheint einmalig ein macOS-TCC-Permission-Prompt:

> "Terminal" möchte "Music" steuern.

User klickt **OK** → danach ist die Berechtigung dauerhaft. Der AppleScript-Adapter erkennt den `-1743`-Error (Permission verweigert) explizit und loggt einen freundlichen Hinweis auf System Settings → Privacy → Automation → Node → Music. Die professionelle Behandlung dieses Erst-Run-Flows kommt in Phase 4 (DMN-03 Install-Script).

Wenn Apple Music nicht aktiv ist, läuft der Smoke-Test trotzdem ohne Crash und gibt erwartete `null`/`state: null`-Werte aus.

## Next Phase Readiness

- **Phase 3 (Polling-Loop)** kann jetzt:
  - `import { getNowPlaying } from "../sources/chain.js"` in z. B. `src/loop.ts`
  - Alle 10s `await getNowPlaying()` aufrufen
  - Ergebnis (`NowPlaying | null`) direkt in `sink.setStatus(np)` oder `sink.clearStatus()` durchreichen
  - Keine Source-Chain-Komplexität mehr im Loop-Code
- **SRC-01 bis SRC-05 vollständig erfüllt** nach Plan 02-02:
  - SRC-01 (Last.fm @attr.nowplaying): Plan 02-01 Task 3
  - SRC-02 (AppleScript als Source): Plan 02-01 Task 4 + Plan 02-02 Task 1 (Fallback-Branch)
  - SRC-03 (AppleScript-Authority): Plan 02-01 Task 4 (state-Feld) + Plan 02-02 Task 1 (`if (state !== "playing") return null`)
  - SRC-04 (Outer-Guard): Plan 02-01 Task 4 (`application process "Music" exists`)
  - SRC-05 (Error-zu-null + Source-Interface): Plan 02-01 Tasks 3+4 (Adapter-Level), Plan 02-02 Task 1 (Composer-Level Top-Guard)
- **Human Verification (vom Phase-Verifier zu prüfen)**: Drei manuelle Smoke-Test-Läufe mit Music.app spielen / pausiert / geschlossen. Erwartet bei Music.app geschlossen: AppleScript state=null UND Music.app springt NICHT geisterhaft auf (Outer-Guard-Test).

## Self-Check: PASSED

- Files exist: src/sources/chain.ts, scripts/test-sources.ts, package.json (modified) — all FOUND.
- Commits exist: 40ae3e6, 5131647, 06262f4 — all FOUND.
- `npx tsc -p . --noEmit`: clean.
- Verification greps (chain.ts und scripts/test-sources.ts): alle pattern-Checks matched.

---
*Phase: 02-now-playing-sources*
*Completed: 2026-05-08*
