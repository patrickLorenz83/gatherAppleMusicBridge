---
phase: 05-cdp-bridge-refactor
verified: 2026-05-09T00:30:00Z
status: human_needed
score: 10/10 must-haves statisch verified (SC1+SC2 brauchen Live-Smoke gegen GatherV2)
overrides_applied: 0
re_verification:
  previous_status: null
  initial: true
human_verification:
  - test: "Live-Smoke-Test gegen laufende GatherV2-Electron-App (SC1)"
    expected: "Avatar zeigt Custom-Status mit Emoji 🎵 und Text 'Daft Punk – Around the World' für ~10 Sekunden im GatherV2-UI; Logs zeigen [gather] CDP pre-flight OK und [gather] status set via CDP"
    why_human: "setCustomStatus rendert in der GatherV2-Renderer-Page; nur visuell + via Renderer-Roundtrip verifizierbar, nicht durch statische Code-Analyse"
    steps:
      - "GatherV2 sauber beenden (sonst greift Debug-Flag nicht)"
      - "open -a GatherV2 --args --remote-debugging-port=9222"
      - "Im UI in Space einloggen (eigener Avatar im Map-View sichtbar)"
      - "npm run check-cdp  -> erwartet ✅ GatherV2-Page erreichbar"
      - "npm run test:sink"
      - "Avatar im UI beobachten: 🎵 Daft Punk – Around the World erscheint ~10s, dann verschwindet er"
  - test: "clearCustomStatus() leert den Status sichtbar (SC2)"
    expected: "Nach den 10s Wartezeit verschwindet der Custom-Status im GatherV2-UI; Skript exitet mit Code 0; Logs zeigen [gather] status cleared via CDP"
    why_human: "UI-Effekt nur visuell prüfbar; gehört zu SC1-Smoke-Test, ist Teil des selben npm run test:sink-Laufs"
  - test: "Pre-flight error message bei fehlendem Debug-Flag (SC3)"
    expected: "Wenn GatherV2 ohne --remote-debugging-port läuft, sagt npm run check-cdp '❌ CDP nicht erreichbar' + Setup-Befehl; sink.connect() im Daemon wirft mit derselben Setup-Anleitung im Fehler-Log"
    why_human: "Erfordert App-Restart ohne Flag und visuelle Prüfung der Konsolen-Output; Code-Pfad ist statisch verifiziert (Z. 60 in src/sink/gather.ts), aber Triggering ist runtime"
  - test: "gatherDev undefined führt zu log.warn + skip statt Crash (SC5)"
    expected: "Wenn die App auf Login-Page steht (kein gatherDev), wirft runInPage 'ReferenceError: gatherDev is not defined'; Loop fängt im try/catch (loop.ts:51), loggt [loop] tick failed und scheduliert nächsten Tick"
    why_human: "Erfordert eingeloggte vs. ausgeloggte App-Session; Code-Pfad statisch ok, aber nur runtime triggerbar"
---

# Phase 5: CDP-Bridge Refactor (Gather 2.0) — Verification Report

**Phase Goal:** Bridge funktioniert mit Gather 2.0 (`app.v2.gather.town`) via Chrome-DevTools-Protocol gegen lokale GatherV2-Electron-App. `setCustomStatus({emoji, text, clearCondition})` über `gatherDev.Repos.gameSpace.currentSpaceUser`.

**Verified:** 2026-05-09T00:30:00Z
**Status:** human_needed
**Re-verification:** Nein — initiale Verifikation

## Goal Achievement

### Observable Truths (must_haves > truths)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GatherSink schreibt Custom-Status (emoji 🎵 + text) via CDP gegen GatherV2-Electron-App | ✓ STATIC VERIFIED | `src/sink/gather.ts:78-98` setStatus baut Expression `gatherDev.Repos.gameSpace.currentSpaceUser.setCustomStatus({emoji, text, clearCondition: {type: "Never"}})`; runInPage Z. 138-173; Live-Test deferred zu human_verification |
| 2 | GatherSink leert Custom-Status via clearCustomStatus() über CDP | ✓ STATIC VERIFIED | `src/sink/gather.ts:100-105` clearStatus ruft `gatherDev.Repos.gameSpace.currentSpaceUser.clearCustomStatus()`; Live-Test deferred |
| 3 | connect() prüft CDP-Port, wirft mit klarer Setup-Anleitung wenn Page fehlt | ✓ VERIFIED | `src/sink/gather.ts:50-76`: pre-flight via findPage(), throw mit `Start the app with: open -a GatherV2 --args --remote-debugging-port=${port}` |
| 4 | Config-Schema verlangt weder GATHER_API_KEY noch GATHER_SPACE_ID; optional GATHER_CDP_PORT, GATHER_PAGE_URL_FILTER | ✓ VERIFIED | `src/config.ts:17-26`: Schema enthält nur LASTFM-Felder + GATHER_CDP_PORT (default "9222") + GATHER_PAGE_URL_FILTER (default "app.v2.gather.town"); grep nach GATHER_API_KEY/GATHER_SPACE_ID in src/+scripts/ leer |
| 5 | @gathertown/gather-game-client, isomorphic-ws, ws aus deps entfernt; chrome-remote-interface@^0.33.3 installiert | ✓ VERIFIED | `package.json:21-27` deps={chrome-remote-interface@^0.33.3, dotenv, pino, run-applescript, zod}; `node_modules/@gathertown` GONE, `node_modules/isomorphic-ws` GONE, `node_modules/chrome-remote-interface@0.33.3` OK |
| 6 | src/setup-ws.ts existiert nicht mehr, kein Modul importiert es noch | ✓ VERIFIED | `test -e src/setup-ws.ts` -> DELETED; `grep -rn "setup-ws" src/ scripts/` leer |
| 7 | tsc --noEmit clean | ✓ VERIFIED | `npx tsc -p . --noEmit` -> Exit 0 |
| 8 | scripts/test-sink.ts ruft new GatherSink() ohne Args, async Public-API | ✓ VERIFIED | `scripts/test-sink.ts:32` `new GatherSink()` (kein Arg); Z. 35,39,47,53 await an connect/setStatus/clearStatus/disconnect |
| 9 | src/loop.ts und src/index.ts awaiten alle Sink-Calls | ✓ VERIFIED | `src/loop.ts:45,47` await; `src/index.ts:51,55,81` await |
| 10 | README dokumentiert GatherV2-Start mit --remote-debugging-port=9222 | ✓ VERIFIED | `README.md:39-59` neue Sektion "GatherV2 mit Debug-Flag starten"; Z. 130-145 Troubleshooting |

**Score:** 10/10 statische Truths verified. SC1 und SC2 (UI-Roundtrip) sind als human_verification ausgelagert — siehe unten.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sink/gather.ts` | CDP-basierte GatherSink mit emoji/text/clearCondition + clearCustomStatus | ✓ VERIFIED | 175 Zeilen; importiert `chrome-remote-interface`; Public-API komplett (connect/setStatus/clearStatus/disconnect/connected getter); JSON.stringify (3 Treffer); AbortSignal.timeout(2000); runInPage statt eval; Runtime.enable vor evaluate; try/finally mit client.close().catch(() => {}); awaitPromise:true; exceptionDetails-Check |
| `src/config.ts` | Config-Schema ohne Gather-Pflichtkeys, optional CDP-Felder | ✓ VERIFIED | Z. 17-36; nur LASTFM-Refine + neue GATHER_CDP_PORT/GATHER_PAGE_URL_FILTER mit Defaults; LASTFM-Konsistenz-Refine erhalten |
| `scripts/check-cdp.ts` | CLI-Helper für Pre-Flight-Check des CDP-Ports und der GatherV2-Page | ✓ VERIFIED | 60 Zeilen; eigenständig (kein dotenv-Import); top-level await; AbortSignal.timeout(2000); 2 distinct Failure-Modes mit Setup-Befehl im Output |
| `scripts/test-sink.ts` | Smoke-Test gegen lokale GatherV2 via CDP | ✓ VERIFIED | Z. 26-66; main() async; await an allen 4 Methoden; "Daft Punk" + "Around the World" hardcoded; 10s + 2s sleep; main().catch fängt Throws |
| `package.json` | chrome-remote-interface drin, keine alten Gather/WS-Pakete | ✓ VERIFIED | dependencies enthält chrome-remote-interface@^0.33.3; KEIN @gathertown/*, isomorphic-ws, ws; @types/chrome-remote-interface@^0.33.0 in devDependencies; npm-Script "check-cdp" Z. 17 |
| `README.md` | GatherV2-Setup-Anleitung mit Debug-Flag | ✓ VERIFIED | Voraussetzungen aktualisiert (Z. 11), Setup ohne Gather-Keys (Z. 13-37), neue Sektion "GatherV2 mit Debug-Flag starten" (Z. 39-59), Troubleshooting "CDP nicht erreichbar" (Z. 130-145), Audit-Warnungen aktualisiert, Architektur-Bullet zu CDP-Wrapper |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| src/sink/gather.ts | chrome-remote-interface | `import CDP from "chrome-remote-interface"` | ✓ WIRED | Z. 20; CDP() in runInPage Z. 147 verwendet |
| src/sink/gather.ts | http://localhost:PORT/json | fetch in fetchTargets | ✓ WIRED | Z. 122 fetch mit Template-Literal `localhost:${this.cfg.port}/json` |
| src/loop.ts | src/sink/gather.ts | await sink.setStatus / await sink.clearStatus | ✓ WIRED | Z. 45,47 |
| src/index.ts | src/sink/gather.ts | await sink.clearStatus / await sink.disconnect / await sink.connect | ✓ WIRED | Z. 51 (await sink.clearStatus im Shutdown), Z. 55 (await sink.disconnect), Z. 81 (await sink.connect) |
| src/index.ts | src/config.ts | new GatherSink({port: Number(config.GATHER_CDP_PORT), pageUrlFilter: config.GATHER_PAGE_URL_FILTER}) | ✓ WIRED | Z. 77-80 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/sink/gather.ts > setStatus` | np.artist, np.track | NowPlaying-Param vom Caller (loop.ts > getNowPlaying() > Source-Chain Last.fm/AppleScript, Phase 2) | Ja (statisch — Source-Chain ist Phase 2/3 verifiziert) | ✓ FLOWING |
| `src/sink/gather.ts > runInPage` | page.webSocketDebuggerUrl | findPage() -> fetchTargets() -> CDP /json HTTP-Endpoint | Live-Daten von der GatherV2-Electron-App | ⚠️ STATIC (nicht runtime-prüfbar ohne Live-App) |
| `scripts/check-cdp.ts` | targets, page.url | fetch http://localhost:PORT/json | Live-Daten der CDP-Backend | ⚠️ STATIC (gleicher Reason) |

Hinweis: STATIC bedeutet hier "Code-Pfad ist sauber, Live-Datenfluss erst durch Smoke-Test bestätigbar". Kein Code-Smell — strukturell korrekt.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type-Check clean | `npx tsc -p . --noEmit` | Exit 0 | ✓ PASS |
| Stale-Imports-Sweep src/+scripts/ | `grep -rn "setup-ws\|@gathertown/gather-game-client\|isomorphic-ws"` | leer | ✓ PASS |
| Stale-Config-Refs | `grep -rn "GATHER_API_KEY\|GATHER_SPACE_ID" src/ scripts/` | leer | ✓ PASS |
| chrome-remote-interface installiert | `test -d node_modules/chrome-remote-interface` | OK; Version 0.33.3 in package.json | ✓ PASS |
| Alte Pakete deinstalliert | `test -d node_modules/@gathertown` und `test -d node_modules/isomorphic-ws` | beide GONE | ✓ PASS |
| setup-ws.ts gelöscht | `test -e src/setup-ws.ts` | DELETED | ✓ PASS |
| Public-API stable (5 Member) | `grep -E "connect\(|setStatus\(|clearStatus\(|disconnect\(|get connected" src/sink/gather.ts` | 5 Treffer | ✓ PASS |
| JSON.stringify ≥ 2× in setStatus-Path | `grep "JSON.stringify" src/sink/gather.ts` | 3 Treffer (emojiLiteral, textLiteral, exceptionDetails-Fallback) | ✓ PASS |
| AbortSignal.timeout in beiden CDP-Fetches | `grep "AbortSignal.timeout" src/sink/gather.ts scripts/check-cdp.ts` | je 1 Treffer | ✓ PASS |
| runInPage-Methode (nicht eval) | `grep "runInPage" src/sink/gather.ts` | 4 Treffer | ✓ PASS |
| npm-Script check-cdp registriert | `grep "check-cdp" package.json` | Z. 17 `"check-cdp": "tsx scripts/check-cdp.ts"` | ✓ PASS |
| Live-Smoke-Test (`npm run test:sink` gegen GatherV2) | manuell vom User | n/a | ? SKIP (siehe human_verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SINK-01 | 05-01-PLAN | GatherSink hat Public-API (connect/setStatus/clearStatus/disconnect/connected) | ✓ SATISFIED | src/sink/gather.ts Z. 35-114, alle 5 Member da, alle 4 Methoden Promise-returning |
| SINK-02 | 05-01-PLAN | setStatus rendert emoji + text im Gather-UI (über CDP) | ✓ STATIC + ? NEEDS HUMAN | Code-Pfad statisch ok; UI-Roundtrip = Smoke-Test |
| SINK-03 | 05-01-PLAN | clearStatus cleart Custom-Status | ✓ STATIC + ? NEEDS HUMAN | Code-Pfad ok; UI-Roundtrip = Smoke-Test |
| SINK-04 | 05-01-PLAN | Pre-Flight bei missing CDP wirft mit Setup-Anleitung | ✓ SATISFIED | src/sink/gather.ts Z. 58-62 |
| SINK-05 | 05-01-PLAN | Error-Resilience: gatherDev undef -> warn+skip, kein Crash | ✓ STATIC | runInPage wirft, Caller (loop.ts try/catch Z. 51-54 + index.ts shutdown try/catch Z. 50-53) absorbieren — Tick wird übersprungen, kein Daemon-Crash. Live-Trigger = Human-Verify |
| CFG-01 | 05-01-PLAN | Config schemavalidiert, klare Fehlermeldung bei Fehlkonfig | ✓ SATISFIED | src/config.ts Z. 41-58, exit(0) bei Fehler, stderr-Output mit issues |
| CFG-02 | 05-01-PLAN | Optional-Felder mit Defaults | ✓ SATISFIED | LASTFM_API_KEY/USER optional default ""; GATHER_CDP_PORT default "9222"; GATHER_PAGE_URL_FILTER default "app.v2.gather.town" |

### Anti-Patterns Found

Keine. Speziell geprüfte Stub-Indikatoren:

- ✓ Keine `TODO|FIXME|XXX|HACK|PLACEHOLDER` in den geänderten Files
- ✓ Keine `return null|return {}` als Stub-Return im Sink-Hot-Path
- ✓ Keine leeren Handler `() => {}` außer dem dokumentierten `client.close().catch(() => {})` (idempotent, intendiert, kommentiert)
- ✓ Keine `console.log`-only-Implementierungen
- ✓ JSON.stringify schützt T-05-01 Code-Injection (Plan-Threat-Model)
- ✓ AbortSignal.timeout schützt T-05-03 DoS-via-hänger
- ✓ runInPage-Naming statt eval entspricht Security-Reminder

### Human Verification Required

#### 1. Live-Smoke-Test gegen laufende GatherV2-Electron-App (deckt SC1 + SC2)

**Test:** Vollständiger Smoke-Test gegen die echte GatherV2-App.

**Vorbereitung:**

1. GatherV2-Electron-App vorher sauber beenden (Cmd+Q im Dock-Menü).
2. Im Terminal:

   ```bash
   open -a GatherV2 --args --remote-debugging-port=9222
   ```

3. Im UI in den gewünschten Space einloggen (eigener Avatar im Map-View sichtbar).
4. Pre-Flight-Check:

   ```bash
   npm run check-cdp
   ```

   Erwartet: `✅ GatherV2-Page erreichbar: https://app.v2.gather.town/...` und Exit 0.

**Smoke-Test:**

```bash
npm run test:sink
```

**Akzeptanz:**
- Avatar im GatherV2-UI zeigt Custom-Status mit Emoji `🎵` + Text `Daft Punk – Around the World` für ~10 Sekunden.
- Nach den 10 Sekunden ist der Custom-Status weg.
- Skript exitet mit Code 0 (kein `[test-sink] smoke test FAILED`).
- Logs (stderr) enthalten:
  - `[gather] CDP pre-flight OK`
  - `[gather] status set via CDP`
  - `[gather] status cleared via CDP`

**Why human:** UI-Render-Roundtrip durch die GatherV2-Renderer-Page; nicht durch statische Code-Analyse oder CLI-Probe verifizierbar.

#### 2. Pre-flight error message bei fehlendem Debug-Flag (SC3)

**Test:**

1. GatherV2 ohne Debug-Flag starten (oder beenden):

   ```bash
   open -a GatherV2  # ohne --args
   ```

2. `npm run check-cdp` ausführen.

**Akzeptanz:**
- Output `❌ CDP nicht erreichbar auf localhost:9222.` mit Setup-Befehl `open -a GatherV2 --args --remote-debugging-port=9222` und einer Detail-Zeile.
- Exit-Code 1.
- `npm run test:sink` wirft jetzt mit `[gather] no GatherV2 page found at localhost:9222. Start the app with: ...` und exitet mit Code 1 via `[test-sink] smoke test FAILED`.

**Why human:** Erfordert App-Restart ohne Flag und visuelle Prüfung der Konsolen-Output.

#### 3. gatherDev-undefined-Verhalten (SC5)

**Test:**

1. GatherV2 mit Debug-Flag starten, aber NICHT in Space einloggen (auf Login-Page bleiben).
2. `npm run test:sink` starten.

**Akzeptanz:**
- `npm run check-cdp` zeigt `❌ CDP läuft auf localhost:9222, aber keine Page mit URL-Substring "app.v2.gather.town" gefunden.` (Login-Page hat anderen URL).
- `npm run test:sink`: `await sink.connect()` wirft mit Setup-Anleitung; `main().catch` greift; Exit 1, kein Daemon-Crash.

Alternativ — ECHTER Daemon-Run (nicht Smoke-Test): wenn der Daemon läuft (`npm run install-daemon`) und der User wechselt während des Betriebs auf die Login-Page, soll Loop-Tick nur loggen und nicht crashen. Verifizierbar in `~/Library/Logs/gather-bridge.err` (`[loop] tick failed`).

**Why human:** Erfordert Login-Logout-State der App und runtime-getriggerte Code-Pfade.

### Gaps Summary

**Keine Gaps.** Alle 10 Phase-internen Truths sind statisch erfüllt:
- Code-Pfade existieren, sind verdrahtet, tsc clean.
- Dependency-Bilanz korrekt (4 Pakete raus, 1 + 1 @types rein).
- setup-ws.ts gelöscht, keine Stale-Imports.
- Public-API ist 1:1 erhalten (Loop/Index nur await ergänzt).
- Config-Schema-Migration vollständig (keine Gather-Pflichtkeys mehr, neue optionale CDP-Felder mit Defaults).
- README + .env.example aktualisiert.
- 8 atomic Code-Commits mit erwarteten Präfixen + 1 Plan-metadata-Commit.

**Status `human_needed`** (nicht `passed`), weil die zwei Kern-Outcomes des Phasen-Goals — `setCustomStatus` rendert im UI sichtbar (SC1) und `clearCustomStatus` cleart im UI sichtbar (SC2) — nur durch einen Live-Smoke-Test gegen die laufende GatherV2-Electron-App bestätigbar sind. Statische Code-Analyse kann den UI-Roundtrip nicht ersetzen.

**Empfehlung:** User führt die drei human_verification-Tests in der oben dokumentierten Reihenfolge aus. Bei Erfolg: Phase ist vollständig abgeschlossen. Bei Fehler: spezifische Diagnose in `README.md > Troubleshooting > CDP nicht erreichbar` und in `05-01-PLAN.md > Task 9 > Bei Fehler — Diagnose-Reihenfolge`.

---

*Verified: 2026-05-09T00:30:00Z*
*Verifier: Claude (gsd-verifier)*
