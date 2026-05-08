---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Roadmap initialized, awaiting `/gsd-plan-phase 1`
last_updated: "2026-05-08T16:04:31.242Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
  percent: 50
---

# STATE: gatherAppleMusicBridge

**Last updated:** 2026-05-08

## Project Reference

- **Core Value:** Wenn ich in Gather online bin, sehen meine Kollegen, was ich gerade höre, ohne dass ich von Apple Music auf Spotify wechseln muss.
- **Mode:** yolo
- **Granularity:** coarse
- **Total v1 requirements:** 27
- **Total phases:** 4

## Current Position

- **Phase:** 1 (Foundation und Gather-Sink) — In Progress
- **Plan:** 01-01 abgeschlossen (Foundation, Config, Logger). Nächster Plan: 01-02 (Gather-Sink + Smoke-Test).
- **Status:** Plan 01-01 done; User muss `.env` aus `.env.example` kopieren und mit echten Werten füllen, BEVOR Plan 01-02 läuft.
- **Progress:** [█████░░░░░] 50% (1/2 Plans in Phase 1)

```
[█████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0/4 phases (0%, 1/2 Plans in Phase 1)
```

## Current Focus

**Next action:** User legt `.env` mit echten Keys an (siehe `01-01-SUMMARY.md` → User Setup Required). Dann `/gsd-execute-phase 1` für Plan 01-02 (Gather-Sink Smoke-Test).

**Phase 1 scope reminder:**

- ~~Repo-Init mit `.gitignore`-First, `.env.example`, `tsconfig.json`, ESM-`package.json`~~ ✅ Plan 01-01
- ~~`src/types.ts`, `src/config.ts` (Zod), `src/logger.ts` (pino mit Redaction)~~ ✅ Plan 01-01
- `src/setup-ws.ts` (Polyfill-Side-Effect-Modul, Pflicht vor Game-Client-Import) — Plan 01-02
- `src/sink/gather.ts` mit `GatherSink`-Klasse — Plan 01-02
- `scripts/test-sink.ts` Smoke-Test mit hardcoded Track gegen echtes Gather-Space — Plan 01-02

**Highest risk in Phase 1:** WebSocket-Polyfill-Reihenfolge (Pitfall 4) und `subscribeToConnection`-Lifecycle des `gather-game-client@43` (undokumentiert). Smoke-Test ist Pflicht, bevor Phase 2 startet.

## Performance Metrics

- **Phases completed:** 0
- **Plans completed:** 1
- **Requirements validated:** 4/27 (CFG-01..04)
- **Time elapsed since init:** 0d

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 (Foundation, Config, Logger) | 2m 53s | 7 | 8 |

## Accumulated Context

### Key Decisions (from PROJECT.md)

| Decision | Rationale |
|----------|-----------|
| Last.fm primär, AppleScript Fallback und Authority für Play/Pause | Apple Music hat keine Live-API; Last.fm via NepTunes ist etabliert; AppleScript fängt Pause-Stale ab |
| Node.js/TypeScript statt Python/Go | Match zu Referenz-Repo `mod-spotify-as-status`; npm + launchd ist der vorhandene macOS-Workflow |
| Background-Daemon via launchd, kein UI | Tool soll unsichtbar laufen, Status setzen ist Hintergrund-Aufgabe |
| 10-Sekunden-Polling | Schnelle Reaktion bei Track-Wechsel, weit unter Last.fm-Rate-Limit (5/s pro IP) |
| `.env` für Secrets, nicht macOS Keychain | Single-User, ein Repo, einfacher Setup; Keychain wäre Overkill |
| Status leeren bei Pause statt stale stehen lassen | Saubere Anzeige für Kollegen |
| Single-User, kein Open-Source | Persönliches Werkzeug, Veröffentlichung würde Doku/Tests/CI verlangen |

### Execution Decisions (Plan 01-01)

| Decision | Rationale |
|----------|-----------|
| TypeScript 5.7 statt 6.0 | TS 6 zu jung (Q1 2026), Tool-Ökosystem nicht voll synchron — STACK.md Empfehlung |
| `module: NodeNext` statt `Node16` | Zukunftssicher in TS 5.7, folgt aktiver Node-Version automatisch |
| `process.exit(0)` bei Config-Fehler statt `exit(1)` | Phase 4 launchd KeepAlive `{ SuccessfulExit: false, Crashed: true }` würde sonst endlos restarten |
| Pino-Redact mit konkreten + Wildcard-Pfaden, `censor: "[REDACTED]"` | Defensiv gegen verschachtelte Logs; sichtbar beim Debugging |
| Boot-Pfad logger-frei (config.ts schreibt direkt auf stderr) | Verhindert Circular-Dep-Risiko, deterministische Boot-Reihenfolge |
| Keine `pino-pretty` Dep | User kann ad-hoc via `npx pino-pretty` rendern |

### Active TODOs

- **Vor Plan 01-02:** User muss `.env` aus `.env.example` mit echten Werten anlegen (LASTFM_API_KEY, LASTFM_USER, GATHER_API_KEY, GATHER_SPACE_ID).

### Blockers

None.

### Open Questions (to resolve during phases)

- **Phase 1:** `gather-game-client@43`-Auto-Reconnect-Verhalten bei TCP-Halbtod, NAT-Rebinding, Sleep/Wake — empirisch ermitteln. Ergebnis bestimmt v2-Reconnect-Strategie.
- **Phase 4:** TCC-Automation-Permission unter Sonoma/Sequoia für launchd-Children — real testen mit Install-Script-Vordergrund-Trigger.
- **Empirisch:** Gather-Status-Längen-Limit ist nicht offiziell dokumentiert (~80-100 Zeichen unkritisch). Falls in Phase 1 ein Track-Längen-Issue auftaucht, Status-Cap nach v2 verschieben.

## Session Continuity

### Last session

**2026-05-08T16:02 — Plan 01-01 ausgeführt:**

- 7 Tasks atomic committet (`e445ad2` `.gitignore`, `cf86ec0` `.env.example`, `951d116` `package.json`, `9cd5712` `tsconfig`, `1cad0e7` `types.ts`, `06f54e9` `config.ts`, `4de8662` `logger.ts`)
- `npm install` für 6 Runtime + 4 Dev-Deps erfolgreich, `package-lock.json` committet
- `npx tsc -p . --noEmit` clean
- `01-01-SUMMARY.md` geschrieben mit Self-Check: PASSED
- ROADMAP.md Phase 1 Plan-Counter geupdated (1/2)
- REQUIREMENTS.md CFG-01..04 als done markiert (4/27)
- Keine Deviations, keine Blocker

**Pre-existing:** Initialization session 2026-05-08 (PROJECT, REQUIREMENTS, Research, ROADMAP, STATE)

### Resume on next session

1. **User:** `cp .env.example .env` und mit echten Keys füllen (siehe `01-01-SUMMARY.md` → User Setup Required).
2. **Claude:** `/gsd-execute-phase 1` (Plan 01-02: Gather-Sink + Smoke-Test).

---
*State initialized: 2026-05-08*
*Last execution: 2026-05-08 (Plan 01-01)*
