---
phase: 01-foundation-und-gather-sink
plan: 01
subsystem: infra
tags: [typescript, esm, node22, dotenv, zod, pino, gather, lastfm, configuration, logger]

# Dependency graph
requires: []
provides:
  - "ESM-Toolchain (Node 22+, TS 5.7, NodeNext, strict)"
  - "Secrets-Schutz: .gitignore vor erstem Commit, .env.example committed"
  - "Validierte Config (Zod-Schema, exit(0) bei Fehlern)"
  - "Redact-fähiger Logger (pino mit Wildcard-Pfaden für GATHER_API_KEY/LASTFM_API_KEY)"
  - "Shared NowPlaying-Type für Source/Sink-Module"
affects: [01-02, 02-*, 03-*, 04-*]

# Tech tracking
tech-stack:
  added:
    - "Node.js 22+ (engines), tatsächlich genutzt: v24.15.0"
    - "TypeScript 5.7.x"
    - "tsx 4.21 (Dev-Runner)"
    - "@gathertown/gather-game-client 43.0.1"
    - "isomorphic-ws 5, ws 8 (WebSocket-Polyfill)"
    - "dotenv 17"
    - "pino 10"
    - "zod 4"
  patterns:
    - "ESM-First (package.json type=module)"
    - "Module-Load-Time-Validation (config.ts top-level loadConfig())"
    - "Boot-Pfad logger-frei (config schreibt direkt auf stderr)"
    - "exit(0) bei Validation-Fehler statt exit(1) (launchd KeepAlive-Strategie)"
    - "Redact mit Wildcard-Paths (`*.GATHER_API_KEY`) statt nur konkreten"

key-files:
  created:
    - ".gitignore"
    - ".env.example"
    - "package.json"
    - "package-lock.json"
    - "tsconfig.json"
    - "src/types.ts"
    - "src/config.ts"
    - "src/logger.ts"
  modified: []

key-decisions:
  - "TypeScript 5.7 statt 6.0 — TS 6 ist zu frisch (Q1 2026), Tool-Ökosystem holt erst auf"
  - "module/moduleResolution: NodeNext statt Node16 — zukunftssicher in TS 5.7"
  - "process.exit(0) bei Config-Fehler — Phase 4 KeepAlive-Strategie hängt davon ab"
  - "Pino mit `censor: \"[REDACTED]\"` statt `remove: true` — sichtbar beim Debugging"
  - "Wildcard-Redact-Paths (`*.GATHER_API_KEY`) — fängt jede Verschachtelungstiefe"
  - "Boot-Pfad logger-frei: config.ts nutzt stderr direkt, kein Logger-Import"
  - "Keine pino-pretty Dependency — User kann ad hoc via `npx pino-pretty` rendern"

patterns-established:
  - "Pattern: .gitignore als allerersten Commit (vor jedem git add)"
  - "Pattern: .env.example mit leeren Keys (KEY=) als committable Template"
  - "Pattern: Zod-Validation bei Module-Load-Time (`export const config = loadConfig()`)"
  - "Pattern: Defensive Redact-Strategie mit konkreten + Wildcard-Pfaden"
  - "Pattern: Type-Imports mit .js-Extension (NodeNext-Pflicht für relative TS-Imports)"

requirements-completed:
  - CFG-01
  - CFG-02
  - CFG-03
  - CFG-04

# Metrics
duration: 3min
completed: 2026-05-08
---

# Phase 01 Plan 01: Foundation, Config, Logger Summary

**ESM-Toolchain (Node 22, TS 5.7, NodeNext) mit Zod-validierter Config (exit(0) Mode) und Pino-Logger (Wildcard-Redact für GATHER/LASTFM-Keys)**

## Performance

- **Duration:** 2m 53s
- **Started:** 2026-05-08T15:59:25Z
- **Completed:** 2026-05-08T16:02:18Z
- **Tasks:** 7/7
- **Files modified:** 8 (alle neu erstellt)

## Accomplishments
- `.gitignore` als allererster Commit angelegt (Secrets-Schutz vor erstem `git add`)
- `.env.example` mit allen 4 Pflicht-Keys committet, echte `.env` ignoriert
- `package.json` als ESM-Projekt initialisiert, alle 6 Runtime-Deps + 4 Dev-Deps installiert
- `tsconfig.json` mit NodeNext + ES2022 + strict konfiguriert (typecheckt `src/` UND `scripts/`)
- `src/types.ts` mit `NowPlaying` Shared-Type
- `src/config.ts` mit Zod-Schema, Module-Load-Time-Validation und `process.exit(0)` (NICHT 1) bei Fehlern
- `src/logger.ts` mit Pino-Instance und defensiver Redact-Strategie (konkrete + Wildcard-Pfade)
- `npx tsc -p . --noEmit` läuft am Ende clean ohne Type-Fehler

## Task Commits

Each task was committed atomically:

1. **Task 1: `.gitignore` als allererste Datei** — `e445ad2` (feat)
2. **Task 2: `.env.example` mit 4 Keys** — `cf86ec0` (feat)
3. **Task 3: `package.json` + `npm install`** — `951d116` (feat)
4. **Task 4: `tsconfig.json` (NodeNext)** — `9cd5712` (feat)
5. **Task 5: `src/types.ts` NowPlaying-Type** — `1cad0e7` (feat)
6. **Task 6: `src/config.ts` Zod + exit(0)** — `06f54e9` (feat)
7. **Task 7: `src/logger.ts` Pino + Redact** — `4de8662` (feat)

## Files Created/Modified
- `.gitignore` — Secrets/Build/Deps/Logs/Editor-Artefakte ausschließen, vor allem `.env`
- `.env.example` — Template für lokale `.env` mit den 4 Pflicht-Keys (LASTFM_API_KEY, LASTFM_USER, GATHER_API_KEY, GATHER_SPACE_ID), Werte leer
- `package.json` — ESM-Projekt, Node 22+, Scripts (dev/build/start/typecheck/test:sink), 6 Runtime + 4 Dev-Deps
- `package-lock.json` — npm-Lockfile für reproduzierbare Installs
- `tsconfig.json` — NodeNext + ES2022 + strict, include `src/**/*` und `scripts/**/*`
- `src/types.ts` — `NowPlaying = { artist, track } | null`
- `src/config.ts` — Zod-validierte Env-Config, exit(0) bei Fehlern, stderr-Ausgabe
- `src/logger.ts` — Pino-Instance mit Redact-Paths für API-Keys

## Decisions Made

- **TypeScript 5.7 statt 6.0** — TS 6 ist zu jung (Q1 2026 Release), Type-Definitions und Tools (esbuild-Plugins) sind teilweise noch nicht synchronisiert. STACK.md bestätigt 5.7 als risikoärmere Wahl für Single-User-Tool ohne Tests.
- **`module: "NodeNext"` statt `"Node16"`** — `NodeNext` folgt automatisch der aktiven Node-Version, in TS 5.7 die zukunftssichere Variante. Implikation: relative TS-Imports brauchen `.js`-Extension (Pitfall 21).
- **`process.exit(0)` bei Config-Fehler (NICHT 1)** — Phase 4 wird launchd mit `KeepAlive: { SuccessfulExit: false, Crashed: true }` betreiben. Bei `exit(1)` würde launchd das als Crash interpretieren und endlos restarten. Bei `exit(0)` bleibt der Daemon gestoppt, bis User die `.env` repariert.
- **`censor: "[REDACTED]"` statt `remove: true`** — Beim Debugging hilfreicher zu sehen, dass das Feld VORHANDEN war, aber redacted wurde, statt es spurlos verschwinden zu lassen.
- **Wildcard-Redact-Pfade (`*.GATHER_API_KEY`)** — Konkrete Pfade (`env.GATHER_API_KEY`) reichen nicht, weil verschachtelte Logs wie `log.error({ details: { env: { GATHER_API_KEY } } })` sonst durchrutschen. Beide Varianten kombiniert → defensiv.
- **Boot-Pfad logger-frei halten** — `config.ts` nutzt `process.stderr.write` statt `log.error`. Verhindert Circular-Dep-Risiko und macht Boot-Reihenfolge deterministisch (config wird vor allem anderen geladen).
- **Keine `run-applescript` Dep in Phase 1** — Plan 01 baut nur Foundation + Config + Logger, AppleScript-Source kommt erst in Phase 2 (Plan beschlossen).

## Deviations from Plan

None — der Plan wurde exakt wie spezifiziert ausgeführt.

Anmerkung: Auf der Maschine ist Node v24.15.0 statt 22 LTS aktiv. `engines: ">=22.0.0"` ist erfüllt (24 ≥ 22), keine Anpassung nötig. STACK.md erwähnt explizit, dass Node 24 ebenfalls funktioniert, nur 22 LTS für Daemons empfohlen ist. Bei Bedarf kann der User später via nvm auf 22 wechseln.

## Issues Encountered

- **`npm install` Audit-Warnings** — 7 Vulnerabilities (3 high, 4 critical) in transitiven Deps des `@gathertown/gather-game-client@43.0.1`, primär `axios@~0.26.0` und `protobufjs`. Erwartet und akzeptiert (Pitfall 18 + STACK.md): Lokales Single-User-Tool, keine User-Inputs, keine User-kontrollierten URLs/Bodies. Nicht blockierend.
- **Deprecation-Warning `uuid@9.0.1`** — Transitiv über `@gathertown/gather-game-client`. Same Begründung wie oben: nicht direkt von uns verwendet, kann ignoriert werden.
- **`npm warn Unknown user config "python"`** — User-globale npm-Config-Reste, irrelevant fürs Projekt. Kein Eingriff.

## User Setup Required

**BEVOR Plan 02 (Gather-Sink Smoke-Test) ausgeführt werden kann**, muss der User die `.env` lokal erstellen:

```bash
cp .env.example .env
# dann .env mit echten Werten füllen:
# - LASTFM_API_KEY:    https://www.last.fm/api/account/create
# - LASTFM_USER:       Last.fm-Username (für /user.getRecentTracks in Phase 2)
# - GATHER_API_KEY:    https://app.gather.town/apikeys
# - GATHER_SPACE_ID:   Format wxyz1234abcd/space-name aus der Gather-URL
```

`.env` ist via `.gitignore` geschützt — das versehentliche `git add .env` wird stillschweigend gefiltert.

## Coverage Statement

- **CFG-01..04 vollständig abgedeckt in Plan 01:**
  - CFG-01 (4 Env-Vars in `.env.example`): Task 2
  - CFG-02 (`.gitignore` schützt `.env`): Task 1
  - CFG-03 (exit(0) bei Config-Fehler): Task 6
  - CFG-04 (Redact für API-Keys): Task 7
- **SINK-01..05 kommen in Plan 02 (`01-02-PLAN.md`)** — `setup-ws.ts` (Polyfill), `src/sink/gather.ts` (GatherSink-Klasse), `scripts/test-sink.ts` (Smoke-Test gegen echtes Space).

## Next Phase Readiness

- ESM-Toolchain steht, alle Deps installiert, `tsc --noEmit` clean.
- Config + Logger sind so designt, dass sie in Plan 02 ohne Änderungen vom Sink importiert werden können.
- Voraussetzung für Plan 02: User muss `.env` mit echten Werten anlegen (siehe oben).
- Keine Blocker.

## Self-Check: PASSED

Verifiziert:
- `.gitignore`, `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/types.ts`, `src/config.ts`, `src/logger.ts` — alle existieren
- Commits `e445ad2`, `cf86ec0`, `951d116`, `9cd5712`, `1cad0e7`, `06f54e9`, `4de8662` — alle in `git log`
- `npx tsc -p . --noEmit` — clean (final-check vor SUMMARY-Erstellung)

---
*Phase: 01-foundation-und-gather-sink*
*Completed: 2026-05-08*
