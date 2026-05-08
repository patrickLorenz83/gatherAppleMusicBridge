# STATE: gatherAppleMusicBridge

**Last updated:** 2026-05-08

## Project Reference

- **Core Value:** Wenn ich in Gather online bin, sehen meine Kollegen, was ich gerade höre, ohne dass ich von Apple Music auf Spotify wechseln muss.
- **Mode:** yolo
- **Granularity:** coarse
- **Total v1 requirements:** 27
- **Total phases:** 4

## Current Position

- **Phase:** Not yet started — Phase 1 is next
- **Plan:** Not yet created
- **Status:** Roadmap initialized, awaiting `/gsd-plan-phase 1`
- **Progress:** 0/4 phases complete

```
[                                                    ] 0/4 phases (0%)
```

## Current Focus

**Next action:** Run `/gsd-plan-phase 1` to decompose Phase 1 (Foundation und Gather-Sink) into executable plans.

**Phase 1 scope reminder:**
- Repo-Init mit `.gitignore`-First, `.env.example`, `tsconfig.json`, ESM-`package.json`
- `src/types.ts`, `src/config.ts` (Zod), `src/logger.ts` (pino mit Redaction)
- `src/setup-ws.ts` (Polyfill-Side-Effect-Modul, Pflicht vor Game-Client-Import)
- `src/sink/gather.ts` mit `GatherSink`-Klasse
- `scripts/test-sink.ts` Smoke-Test mit hardcoded Track gegen echtes Gather-Space

**Highest risk in Phase 1:** WebSocket-Polyfill-Reihenfolge (Pitfall 4) und `subscribeToConnection`-Lifecycle des `gather-game-client@43` (undokumentiert). Smoke-Test ist Pflicht, bevor Phase 2 startet.

## Performance Metrics

- **Phases completed:** 0
- **Plans completed:** 0
- **Requirements validated:** 0/27
- **Time elapsed since init:** 0d

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

### Active TODOs

None yet — first plan to be derived during Phase 1 planning.

### Blockers

None.

### Open Questions (to resolve during phases)

- **Phase 1:** `gather-game-client@43`-Auto-Reconnect-Verhalten bei TCP-Halbtod, NAT-Rebinding, Sleep/Wake — empirisch ermitteln. Ergebnis bestimmt v2-Reconnect-Strategie.
- **Phase 4:** TCC-Automation-Permission unter Sonoma/Sequoia für launchd-Children — real testen mit Install-Script-Vordergrund-Trigger.
- **Empirisch:** Gather-Status-Längen-Limit ist nicht offiziell dokumentiert (~80-100 Zeichen unkritisch). Falls in Phase 1 ein Track-Längen-Issue auftaucht, Status-Cap nach v2 verschieben.

## Session Continuity

### Last session

Initialization session 2026-05-08:
- PROJECT.md erstellt (Core Value, Constraints, Decisions)
- REQUIREMENTS.md mit 27 v1-Requirements und v2-Reaktiv-Liste
- Recherche durchgeführt: STACK.md, ARCHITECTURE.md, PITFALLS.md, FEATURES.md, SUMMARY.md
- ROADMAP.md mit 4 Phasen (Sink-First, risk-driven) erstellt
- STATE.md initialisiert
- REQUIREMENTS.md Traceability-Sektion auf Phase-Mapping aktualisiert

### Resume on next session

Run `/gsd-plan-phase 1` — Roadmap und Requirements sind bereit.

---
*State initialized: 2026-05-08*
