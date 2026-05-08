---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: "Phase-3-Code (Polling-Loop und Daemon-Verdrahtung) 100% komplett. Alle 5 LOOP-Requirements erfüllt, tsc clean. Optionaler manueller End-to-End-Smoke-Test (`npx tsx src/index.ts`) ist User-Action."
last_updated: "2026-05-08T16:52:25Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 5
  completed_plans: 5
  percent: 100
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

- **Phase:** 3 (Polling-Loop und Daemon-Verdrahtung) — Code abgeschlossen, Phase-3-Verifier offen
- **Plan:** 03-01 abgeschlossen (Polling-Loop, Track-Diff, Daemon-Entrypoint mit Signal-Handlern und Last-Word-Log).
- **Status:** Phase-3-Code 100% komplett, alle 5 Phase-3-Requirements (LOOP-01..05) erfüllt. Optionaler manueller End-to-End-Smoke-Test (`npx tsx src/index.ts`) ist User-Action.
- **Progress:** [██████████] 100%

```
[██████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░] 2/4 phases (50%, 4/4 Plans in Phases 1+2)
```

## Current Focus

**Next action:** Phase-3-Verifier ausführen (`/gsd-verify-phase 3`). Verifier prüft alle 5 LOOP-Requirements in `src/diff.ts`, `src/loop.ts`, `src/index.ts` und nimmt einen `human_verification`-Block in `03-VERIFICATION.md` für den optionalen End-to-End-Smoke-Test (`npx tsx src/index.ts`) auf.

**Phase 2 scope reminder:**

- ~~`src/types.ts` PlayerState-Type erweitern~~ ✅ Plan 02-01
- ~~`src/sources/types.ts` mit NowPlayingSource + AppleScriptResult~~ ✅ Plan 02-01
- ~~`src/sources/lastfm.ts` mit native fetch + Zod-Schema + @attr.nowplaying-Filter~~ ✅ Plan 02-01
- ~~`src/sources/applescript.ts` mit System-Events-Outer-Guard + Player-State-Authority~~ ✅ Plan 02-01
- ~~`src/sources/chain.ts` mit getNowPlaying-Composer~~ ✅ Plan 02-02
- ~~`scripts/test-sources.ts` Smoke-Test + npm-Script~~ ✅ Plan 02-02

**Highest risk in Phase 2:** AppleScript-Outer-Guard-Korrektheit (Pitfall 1 = SRC-04) — User-Verifikation nötig: Music.app schließen → `npm run test:sources` → Music.app DARF NICHT geisterhaft starten. **Risiko gemindert:** `tell application "System Events" / if not (exists application process "Music") then return ""` BEFORE `tell application "Music"`.

## Performance Metrics

- **Phases completed:** 0 (Phases 1+2+3 Code 100%, Verifier offen)
- **Plans completed:** 5
- **Requirements validated:** 19/27 (CFG-01..04, SINK-01..05, SRC-01..05, LOOP-01..05)
- **Time elapsed since init:** 0d

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 (Foundation, Config, Logger) | 2m 53s | 7 | 8 |
| Phase 01 P02 | 3min | 3 tasks | 3 files |
| Phase 2 P01 | 3min | 4 tasks | 6 files |
| Phase 2 P02 | 2min | 2 tasks | 3 files |
| Phase 3 P01 (Polling-Loop, Daemon) | 5min | 3 tasks | 3 files |
| Phase 03 P01 | 5min | 3 tasks | 3 files |

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

### Execution Decisions (Plan 01-02)

| Decision | Rationale |
|----------|-----------|
| `game.disconnect()` async (`Promise<void>`), nicht synchron | Verifiziert in `node_modules/@gathertown/gather-game-client/dist/src/Game.d.ts:92` — Plan-Skelett-Annahme war falsch. Smoke-Test `awaitet` jetzt; Phase 3 SIGTERM-Handler MUSS ebenso. |
| `sendAction({$case: "setEmojiStatus", ...})` statt `game.setEmojiStatus(...)` | Folgt offiziellem Reference-Repo-Pattern aus `mod-spotify-as-status`, explizit auf der WebSocket-Wire (debuggbar). High-Level-Methoden existieren auch, aber wir bleiben Reference-Repo-konform. |
| Connect-Timeout fest auf 10s mit Promise-Reject | T-02-04-Mitigation: Smoke-Test/Phase-3-Loop hängt nicht beim Boot, sondern crashed mit Stack-Trace. Caller entscheidet über Recovery. |
| `setStatus`/`clearStatus` werfen NICHT bei `!connected` (nur Warning) | Defensiv: Caller (Phase-3-Loop) soll nicht crashen, wenn Sink temporär down ist. Reconnect ist v2 (ROBUST-02). |
| `NonNullable<NowPlaying>` als `setStatus`-Parameter (nicht `NowPlaying`) | Klarer Vertrag: Caller filtert `null` vorher und entscheidet zwischen `setStatus` ODER `clearStatus`. |

### Execution Decisions (Plan 02-01)

| Decision | Rationale |
|----------|-----------|
| AppleScript-Output-Format `STATE:<s>` / `PLAY:<artist>\t<track>` mit Tab-Separator | Tab-Separator ist robust (Track-Namen enthalten praktisch nie Tabs, Pitfall 15); STATE/PLAY-Prefix macht JS-Parsing branch-eindeutig. |
| `runAppleScript` (named import) statt `execFile osascript` | Sindresorhus-Wrapper bringt Promise-API + Escaping; ESM-only matcht type=module; weniger Code. |
| `parsePlayerState` mappt `fast forwarding`/`rewinding` auf `paused` | Sicherheits-Default — bei Skip-and-Seek lieber leerer Status als falscher Track. |
| Last.fm Roll-your-own statt `lastfm-ts-api` Wrapper | Single-Endpoint, native fetch reicht; defensives Zod-Schema fängt API-Quirks (Single-Object statt Array, fehlende @attr) zuverlässig ab. |
| Last.fm-Schema akzeptiert `track` als Array ODER Single-Object via `z.union` | Verhindert ZodError beim ersten Run mit nur einem History-Track (alte Last.fm-Quirk). |
| TCC-Error `-1743` explizit erkannt und mit Permission-Hinweis geloggt | Bereitet Phase-4-DMN-03-Install-Script vor; transparente Erst-Run-Reibung statt stillem Fehlschlag. |

### Execution Decisions (Plan 02-02)

| Decision | Rationale |
|----------|-----------|
| Pseudo-Code aus 02-CONTEXT.md 1:1 implementiert (sequenzielle Branches) | Authority-Logik braucht Reihenfolge: AppleScript-State entscheidet, ob Last.fm überhaupt relevant ist. |
| Top-Level-`try/catch` im Composer als Belt-and-suspenders | 3 Zeilen Schutz gegen Modul-Load-Fehler/OOM; SRC-05 zweistufig (Adapter + Composer). |
| Kein paralleles `Promise.all([apple, lastfm])` | Optimierung wäre max ~100ms wert, würde aber NepTunes-Stale-Data-Risiko erhöhen, wenn Music.app pausiert ist (Pitfall 10). |
| Separate Commits feat/chore für `scripts/test-sources.ts` und `package.json` | Einzeln revertierbar — Script-Body und npm-Script-Eintrag sind konzeptuell getrennt. |
| `pino`-Logger im Smoke-Test statt `console.log` | Konsistent mit Phase-1 `test-sink.ts`; Redaction-Strategy greift auch hier. |

### Execution Decisions (Plan 03-01)

| Decision | Rationale |
|----------|-----------|
| `pino.final()` durch `finalFatal()`-Helper mit `log.flushSync()` ersetzt | API ist in pino 10.x entfernt (siehe pino transports docs). Helper schreibt `log.fatal(...)` synchron via `flushSync()` — funktional äquivalent für SonicBoom-Default-Destination. |
| `shutdown()`: `exit(0)` auch bei Cleanup-Fehler oder 5s-Timeout | launchd in Phase 4 nutzt `KeepAlive: { SuccessfulExit: false, Crashed: true }` — `exit(1)` bei Cleanup-Hänger würde unerwünschten Restart triggern. |
| Polling-Intervall hardcoded `10_000` ms in `loop.ts` | v1 Single-User-Tool, kein Env-Var-Variabilitätsbedarf. Last.fm Rate-Limit (5/s/IP) ist weit drüber. |
| `runLoop` nicht async, erster Tick fire-and-forget via `void tick()` | Caller (`main()`) registriert Signal-Handler ohne auf erstes Polling-Ergebnis zu warten. |
| Doppel-Signal-Schutz via `shuttingDown`-Flag | Doppel-Ctrl-C oder zweites SIGTERM während Shutdown würde sonst zweite `shutdown()`-Invocation auslösen — `sink.disconnect()` doppelt awaitet (Race). |
| `abort.signal.addEventListener("abort", ...)` mit `{ once: true }` cleart pending Timer | Memory-Leak-Prävention bei langlaufendem Daemon; Listener-Lifecycle endet mit erstem abort-Event. |
| Polyfill `import "./setup-ws.js";` als Zeile 1 (defensiv, gather.ts importiert es schon) | Pitfall 4: Belt-and-suspenders gegen versehentliches Reimporten/Reordering in Future-Refactors. |

### Active TODOs

- **Phase-1-Verifier:** Muss `human_verification`-Block für deferred Task 4 (visueller Smoke-Test im Gather-Browser-Tab) in `01-VERIFICATION.md` aufnehmen. ~30s User-Action nach `.env`-Setup.
- **Phase-2-Verifier:** Muss `human_verification`-Block für drei optionale Smoke-Test-Läufe (`npm run test:sources` mit Music.app spielt / pausiert / geschlossen) in `02-VERIFICATION.md` aufnehmen. Erwartete Ergebnisse stehen in `02-02-PLAN.md` Abschnitt `<verification>`.
- **TCC-Permission beim ersten Live-Run**: macOS zeigt einmaligen Automation-Permission-Prompt für "Music"-Steuerung. User klickt OK → dauerhaft. Adapter erkennt `-1743`-Error explizit und loggt System-Settings-Hinweis (volle Behandlung in Phase 4 DMN-03).

### Blockers

None.

### Open Questions (to resolve during phases)

- **Phase 1:** `gather-game-client@43`-Auto-Reconnect-Verhalten bei TCP-Halbtod, NAT-Rebinding, Sleep/Wake — empirisch ermitteln. Ergebnis bestimmt v2-Reconnect-Strategie.
- **Phase 4:** TCC-Automation-Permission unter Sonoma/Sequoia für launchd-Children — real testen mit Install-Script-Vordergrund-Trigger.
- **Empirisch:** Gather-Status-Längen-Limit ist nicht offiziell dokumentiert (~80-100 Zeichen unkritisch). Falls in Phase 1 ein Track-Längen-Issue auftaucht, Status-Cap nach v2 verschieben.

## Session Continuity

### Last session

**2026-05-08T16:52 — Phase 3 (Plan 03-01) ausgeführt:**

- Plan 03-01 (Polling-Loop und Daemon-Verdrahtung): 3 Tasks, 3 atomic Commits
  - `a8ae8ff` `feat(03-01): add nowPlayingKey composite-key for track-diff (LOOP-02)` — `src/diff.ts`
  - `edc74c8` `feat(03-01): add runLoop with recursive setTimeout, AbortController and per-tick try/catch (LOOP-01, LOOP-02, LOOP-03)` — `src/loop.ts`
  - `da1e540` `feat(03-01): wire daemon entrypoint with signal handlers, last-word-log and shutdown-race (LOOP-04, LOOP-05)` — `src/index.ts`
- `npx tsc -p . --noEmit` clean nach jedem Task (alle drei Phasen zusammen).
- 03-01-SUMMARY mit Self-Check: PASSED geschrieben.
- ROADMAP.md Phase 3 Plan-Counter via `roadmap.update-plan-progress 03` aktualisiert (Status: Complete).
- REQUIREMENTS.md LOOP-01..05 als done markiert (19/27).
- 4 Deviations (auto-fixed): NowPlaying-Import-Pfad-Bug, setInterval-Substring im Doku-Kommentar, pino.final-API-Drift in pino 10.x, Polyfill-Import-Reihenfolge für Plan-Verify-Konformität. Alle dokumentiert in 03-01-SUMMARY.

**Pre-existing:**

- 2026-05-08T16:33 — Phase 2 (Plans 02-01 + 02-02) ausgeführt
- 2026-05-08T16:09 — Plan 01-02 ausgeführt (GatherSink + Smoke-Test; 3 Tasks)
- 2026-05-08T16:02 — Plan 01-01 ausgeführt (Foundation, Config, Logger; 7 Tasks)
- Initialization session 2026-05-08 (PROJECT, REQUIREMENTS, Research, ROADMAP, STATE)

**Pre-existing:**

- 2026-05-08T16:09 — Plan 01-02 ausgeführt (GatherSink + Smoke-Test; 3 Tasks)
- 2026-05-08T16:02 — Plan 01-01 ausgeführt (Foundation, Config, Logger; 7 Tasks)
- Initialization session 2026-05-08 (PROJECT, REQUIREMENTS, Research, ROADMAP, STATE)

### Resume on next session

1. **User (falls noch nicht geschehen):** `cp .env.example .env` und mit echten Keys füllen.
2. **Claude:** `/gsd-verify-phase 1` (Phase-1-Verifier, mit `human_verification`-Block für visuellen Smoke-Test).
3. **Claude:** `/gsd-verify-phase 2` (Phase-2-Verifier, mit `human_verification`-Block für drei optionale `npm run test:sources`-Läufe).
4. **Claude:** `/gsd-verify-phase 3` (Phase-3-Verifier, mit `human_verification`-Block für optionalen End-to-End-Smoke-Test `npx tsx src/index.ts`).
5. Nach erfolgreichen Verifier-Runs: `/gsd-execute-phase 4` (launchd-Wrapper und Installation: Plist-Generator, Install-Script, TCC-Permission-Trigger).

---
*State initialized: 2026-05-08*
*Last execution: 2026-05-08 (Plan 03-01 — Phase 3 abgeschlossen)*
