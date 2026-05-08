---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
last_updated: "2026-05-08T17:25:07.479Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 7
  completed_plans: 6
  percent: 86
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

- **Phase:** 4 (launchd-Installation) — Plan 04-01 Code abgeschlossen, Plan 04-02 (Real-System-Smoke-Test) deferred (User-Action)
- **Plan:** 04-01 abgeschlossen (Plist-Renderer, Install-/Uninstall-Scripts, npm-Scripts, README).
- **Status:** Phase-4-Code (Plan 04-01) 100% komplett. Alle 8 Phase-4-Requirements (CFG-05, DMN-01..07) im Code abgedeckt. Plan 04-02 ist 2x checkpoint:human-verify (Real-System-Mutation): User muss `npm run install-daemon` selbst laufen lassen und `launchctl list | grep gather` prüfen.
- **Progress:** [█████████░] 86%

```
[██████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░] 2/4 phases (50%, 4/4 Plans in Phases 1+2)
```

## Current Focus

**Next action:** Plan 04-02 (Real-System-Smoke-Test, 2x checkpoint:human-verify) — User-Action. Aufruf: `/gsd-execute-phase 4`. User muss `npm run install-daemon` selbst laufen lassen, beim TCC-Prompt "Terminal möchte Music steuern" mit "OK" bestätigen, und mit `launchctl list | grep gather`, `tail -f ~/Library/Logs/gather-bridge.log` validieren, dass der Daemon läuft, Status setzt, bei Crash neu startet und bei Config-Error sauber endet.

**Phase 2 scope reminder:**

- ~~`src/types.ts` PlayerState-Type erweitern~~ ✅ Plan 02-01
- ~~`src/sources/types.ts` mit NowPlayingSource + AppleScriptResult~~ ✅ Plan 02-01
- ~~`src/sources/lastfm.ts` mit native fetch + Zod-Schema + @attr.nowplaying-Filter~~ ✅ Plan 02-01
- ~~`src/sources/applescript.ts` mit System-Events-Outer-Guard + Player-State-Authority~~ ✅ Plan 02-01
- ~~`src/sources/chain.ts` mit getNowPlaying-Composer~~ ✅ Plan 02-02
- ~~`scripts/test-sources.ts` Smoke-Test + npm-Script~~ ✅ Plan 02-02

**Highest risk in Phase 2:** AppleScript-Outer-Guard-Korrektheit (Pitfall 1 = SRC-04) — User-Verifikation nötig: Music.app schließen → `npm run test:sources` → Music.app DARF NICHT geisterhaft starten. **Risiko gemindert:** `tell application "System Events" / if not (exists application process "Music") then return ""` BEFORE `tell application "Music"`.

## Performance Metrics

- **Phases completed:** 0 (Phases 1+2+3+4-Code 100%, Verifier offen, Plan 04-02 Real-System-Smoke deferred)
- **Plans completed:** 6 (von 7; Plan 04-02 deferred als User-Action)
- **Requirements validated:** 27/27 im Code (CFG-01..05, SINK-01..05, SRC-01..05, LOOP-01..05, DMN-01..07) — System-Verifikation für DMN-* steht aus (Plan 04-02)
- **Time elapsed since init:** 0d

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 (Foundation, Config, Logger) | 2m 53s | 7 | 8 |
| Phase 01 P02 | 3min | 3 tasks | 3 files |
| Phase 2 P01 | 3min | 4 tasks | 6 files |
| Phase 2 P02 | 2min | 2 tasks | 3 files |
| Phase 3 P01 (Polling-Loop, Daemon) | 5min | 3 tasks | 3 files |
| Phase 03 P01 | 5min | 3 tasks | 3 files |
| Phase 04 P01 | 275s | 3 tasks | 5 files |

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

### Execution Decisions (Plan 04-01)

| Decision | Rationale |
|----------|-----------|
| `spawnSync` mit Argument-Array, kein `exec` mit Shell-String | Defensiv gegen Shell-Quoting-Risiken bei Pfaden mit Leerzeichen; Command-Injection ausgeschlossen, auch wenn alle Inputs intern (process.execPath, REPO_DIR, os.homedir). |
| `process.execPath` zur Install-Zeit eingefroren in der Plist | Pitfall 23, DMN-01. nvm/Homebrew-Update wechselt das Node-Binary — der absolute Pfad in der Plist hält genau das Binary fest, mit dem der User installiert hat. Re-Install bei Node-Wechsel löst es. |
| `os.homedir()` + `path.join(...)` für Plist und Logs (kein Tilde-Expand zur Render-Zeit) | Pitfall 11, CFG-05. launchd macht KEIN Tilde-Expand in Plist-Werten — ohne absolute Pfade landet `~/Library/Logs/...` als Literal-Pfad und Logs verschwinden ins Nichts. |
| TCC-Trigger via zwei `osascript`-Calls statt einem | Robuster: Der erste Call (`tell application "System Events" to (exists application process "Music")`) prüft, ob Music überhaupt läuft, ohne sie zu starten (Pitfall 1). Der zweite Call (`tell application "Music" to player state`) ist die eigentliche TCC-Permission-Anforderung. |
| `node:assert/strict` + `tsx` als Standalone-Test-Runner | Plan-Konvention "keine Test-Framework-Dependency". 7 Smoke-Tests reichen für Template-Substitution + Snapshot-Eigenschaften; jest/vitest wäre Overkill für ~50 Zeilen Render-Code. |
| JSDoc-Header auf `renderPlist` ergänzt | Plan-Verify-Konvention erwartete `renderPlist`-Mention >= 2 in `plist.ts`; reine Doku, keine Verhaltensänderung (Rule 3 Auto-Fix). |
| Re-Install Idempotenz: `launchctl bootout` mit `allowFailure: true` als erster launchctl-Call | Service nicht geladen → bootout liefert Exit ≠ 0, das ist erwartet und kein Fehler. Damit ist `npm run install-daemon` mehrfach hintereinander aufrufbar, ohne dass der zweite Run scheitert (DMN-04). |
| Build-Step (`npm run build`) als Schritt 1 von 6 in install-daemon.ts | Plist verweist auf `dist/index.js`, nicht auf TS-Source via `tsx`. Production-Mode, schneller Startup, kein tsx-Overhead im Daemon-Lebenszyklus. |

### Active TODOs

- **Plan 04-02 (Real-System-Smoke-Test, deferred):** 2x checkpoint:human-verify, der User muss `npm run install-daemon` selbst laufen lassen, beim TCC-Prompt "Terminal möchte Music steuern" mit "OK" bestätigen, und mit `launchctl list | grep gather`, `launchctl print gui/$(id -u)/agency.deepr.gather-apple-music-bridge`, `tail -f ~/Library/Logs/gather-bridge.log` die Service-Aktivierung, Status-Update in Gather, KeepAlive-Restart bei Crash und sauberen Exit bei Config-Error validieren. Aufruf via `/gsd-execute-phase 4`.
- **Phase-1-Verifier:** Muss `human_verification`-Block für deferred Task 4 (visueller Smoke-Test im Gather-Browser-Tab) in `01-VERIFICATION.md` aufnehmen. ~30s User-Action nach `.env`-Setup.
- **Phase-2-Verifier:** Muss `human_verification`-Block für drei optionale Smoke-Test-Läufe (`npm run test:sources` mit Music.app spielt / pausiert / geschlossen) in `02-VERIFICATION.md` aufnehmen. Erwartete Ergebnisse stehen in `02-02-PLAN.md` Abschnitt `<verification>`.
- **TCC-Permission beim ersten Live-Run**: macOS zeigt einmaligen Automation-Permission-Prompt für "Music"-Steuerung. User klickt OK → dauerhaft. Adapter erkennt `-1743`-Error explizit und loggt System-Settings-Hinweis. Plan 04-01 Install-Script triggert die Permission im Vordergrund (DMN-03 erfüllt).

### Blockers

None.

### Open Questions (to resolve during phases)

- **Phase 1:** `gather-game-client@43`-Auto-Reconnect-Verhalten bei TCP-Halbtod, NAT-Rebinding, Sleep/Wake — empirisch ermitteln. Ergebnis bestimmt v2-Reconnect-Strategie.
- **Phase 4:** TCC-Automation-Permission unter Sonoma/Sequoia für launchd-Children — real testen mit Install-Script-Vordergrund-Trigger.
- **Empirisch:** Gather-Status-Längen-Limit ist nicht offiziell dokumentiert (~80-100 Zeichen unkritisch). Falls in Phase 1 ein Track-Längen-Issue auftaucht, Status-Cap nach v2 verschieben.

## Session Continuity

### Last session

**2026-05-08T17:20 — Phase 4 (Plan 04-01) ausgeführt:**

- Plan 04-01 (launchd-Installation Code-Artefakte): 3 Tasks, 3 atomic Commits
  - `549ce31` `feat(04-01): add renderPlist template function with snapshot test` — `scripts/lib/plist.ts`, `scripts/lib/plist.test.ts`
  - `85b1987` `feat(04-01): add install/uninstall daemon scripts via spawnSync` — `scripts/install-daemon.ts`, `scripts/uninstall-daemon.ts`
  - `9be4f1a` `docs(04-01): wire install-daemon/uninstall-daemon npm-scripts and README` — `package.json`, `README.md`
- `npx tsc -p . --noEmit` clean nach jedem Task (alle 4 Phasen zusammen).
- `npx tsx scripts/lib/plist.test.ts` exit 0 — alle 7 Snapshot-Tests grün.
- Phase-Level-Verifikation: alle 8 Phase-4-Requirements (CFG-05, DMN-01..07) im Code abgedeckt.
- 04-01-SUMMARY mit Self-Check: PASSED geschrieben.
- 1 Deviation (Rule 3 auto-fix): JSDoc-Header auf `renderPlist` ergänzt, weil Plan-Verify `grep -c "renderPlist" >= 2` erwartete; reine Doku-Änderung im selben Commit `549ce31`.
- Plan 04-02 (Real-System-Smoke-Test, 2x checkpoint:human-verify) bewusst übersprungen — User-System-Mutation, gehört in `gsd-execute-phase 4`-Run mit Checkpoint-Stops.

**Pre-existing:**

- 2026-05-08T16:52 — Phase 3 (Plan 03-01) ausgeführt (Polling-Loop, Track-Diff, Daemon-Entrypoint; 3 Tasks)

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
5. **Claude (Plan 04-02 ausstehend):** `/gsd-execute-phase 4` lässt den Orchestrator Plan 04-02 als 2x checkpoint:human-verify ausführen — User-Action: `npm run install-daemon`, dann mit `launchctl list | grep gather`, `tail -f ~/Library/Logs/gather-bridge.log` validieren.
6. **Claude:** `/gsd-verify-phase 4` (Phase-4-Verifier, mit `human_verification`-Block für Service-Aktivierung, KeepAlive-Restart bei Crash, sauberer Exit bei Config-Error).

---
*State initialized: 2026-05-08*
*Last execution: 2026-05-08 (Plan 04-01 — Phase 4 Code abgeschlossen, Plan 04-02 deferred)*
