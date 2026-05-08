# Roadmap: gatherAppleMusicBridge

**Created:** 2026-05-08
**Granularity:** coarse
**Total v1 requirements:** 27
**Coverage:** 27/27 mapped

## Core Value

Wenn ich in Gather online bin, sehen meine Kollegen, was ich gerade höre, ohne dass ich von Apple Music auf Spotify wechseln muss.

## Build-Order-Rationale

Die Phasen folgen einer **Risk-First-Reihenfolge**, nicht dem Daten-Fluss "Quelle zur Senke". Begründung aus der Architektur-Recherche: Gather-WebSocket mit Polyfill-Reihenfolge, lazy `subscribeToConnection`-Lifecycle und proprietärem Action-Schema ist das einzige echte Unbekannte im Stack. Wenn der Sink hinten in Phase 4 liegen würde, fiele jeder dort gefundene Polyfill-/Lifecycle-Bug auf 80 % geschriebene Sources/Loop zurück. Sink-First eliminiert dieses Risiko in Stunde 1, und Sources lassen sich danach mit echtem Sink-Pfad (statt Mock) verifizieren. Loop kommt nach Sources (konzeptuell trivial, aber braucht stabile Komponenten-Interfaces), launchd zuletzt (technisch einfach, aber entkoppelt vom Foreground-Dev-Loop mit `tsx watch`).

## Phases

- [ ] **Phase 1: Foundation und Gather-Sink** - Repo-Setup, Config/Logger, WebSocket-Polyfill und GatherSink-Wrapper mit Smoke-Test gegen echtes Gather-Space
- [ ] **Phase 2: Now-Playing-Sources** - Last.fm-Adapter, AppleScript-Fallback und Source-Chain mit AppleScript als Authority für Play/Pause
- [ ] **Phase 3: Polling-Loop und Daemon-Verdrahtung** - Recursive-setTimeout-Loop, Track-Diff, SIGTERM-Handler und unhandled-Rejection-Guards, lauffähig im Foreground
- [ ] **Phase 4: launchd-Installation** - Plist-Template, Install/Uninstall-Scripts mit TCC-Permission-Trigger und stderr/stdout-Routing in `~/Library/Logs/`

## Phase Details

### Phase 1: Foundation und Gather-Sink
**Goal**: Bridge kann sich mit echtem Gather-Space verbinden und einen hardcoded Track-Status setzen oder leeren, mit Secrets aus `.env` und redacted Logs.
**Depends on**: Nothing (first phase)
**Requirements**: SINK-01, SINK-02, SINK-03, SINK-04, SINK-05, CFG-01, CFG-02, CFG-03, CFG-04
**Success Criteria** (what must be TRUE):
  1. Im Gather-Space erscheint nach Smoke-Test-Run für einen hardcoded Track das Emoji `♫` plus Statustext `Artist – Track`, und der Status wird beim Stoppen des Test-Scripts wieder geleert.
  2. `.env` mit `LASTFM_API_KEY`, `LASTFM_USER`, `GATHER_API_KEY`, `GATHER_SPACE_ID` lädt sauber, fehlende Variablen führen zu `process.exit(0)` mit klarer Fehlermeldung (nicht zu Crash-Loop).
  3. `.gitignore` ist im allerersten Commit enthalten und schließt `.env`, `dist/`, `node_modules/`, `*.log` aus, `.env.example` ist committet.
  4. Pino-Logs zeigen niemals den `GATHER_API_KEY` oder `LASTFM_API_KEY` im Klartext (Redaction aktiv).
  5. Polyfill `globalThis.WebSocket = WS` wird vor dem ersten Game-Client-Import gesetzt, der Sink wirft beim Connect keinen `TypeError: WebSocket is not a constructor`.
**Plans**: TBD

### Phase 2: Now-Playing-Sources
**Goal**: Bridge kann den aktuell laufenden Track aus Last.fm oder Music.app via AppleScript holen, mit AppleScript als Authority für Play/Pause/Stop und sauberem Fallback-Verhalten bei Source-Fehlern.
**Depends on**: Phase 1 (Logger und Types werden geteilt; Sink-Pfad ist verfügbar für End-to-End-Verifikation)
**Requirements**: SRC-01, SRC-02, SRC-03, SRC-04, SRC-05
**Success Criteria** (what must be TRUE):
  1. Wenn Music.app spielt und NepTunes scrobbelt, liefert die Source-Chain `{artist, track}` aus Last.fm filtered per `@attr.nowplaying === "true"` (nicht per Position).
  2. Wenn Last.fm `nowplaying`-leer oder per HTTP-Error fehlschlägt, fallt die Chain auf AppleScript zurück und liefert die Daten aus Music.app.
  3. Wenn Music.app pausiert oder gestoppt ist, liefert die Source-Chain `null` (auch wenn Last.fm noch ein stale `nowplaying=true` zurückgibt) — AppleScript ist Authority für Play/Pause/Stop.
  4. AppleScript startet Music.app niemals ungewollt: bei nicht laufender Music.app gibt der Outer-Guard `null` zurück, ohne `tell application "Music"` ohne Running-Check auszuführen.
  5. Einzelner Source-Fehler (Last.fm 503, AppleScript-Error) wird in der Chain zu `null` gemappt und geloggt, ohne den Caller zu crashen.
**Plans**: TBD

### Phase 3: Polling-Loop und Daemon-Verdrahtung
**Goal**: Daemon läuft im Foreground (`tsx src/index.ts`) als End-to-End-Bridge: alle 10 Sekunden pollen, bei Track-Wechsel Status setzen, bei Pause leeren, sauberer Shutdown bei SIGTERM/SIGINT.
**Depends on**: Phase 1 (Sink), Phase 2 (Sources)
**Requirements**: LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05
**Success Criteria** (what must be TRUE):
  1. Während Music.app spielt, aktualisiert sich der Gather-Status innerhalb von ~10-15 Sekunden bei Track-Wechsel; bei gleichbleibendem Track wird kein redundantes setStatus gesendet.
  2. Wenn Apple Music pausiert wird, ist der Gather-Status innerhalb eines Polling-Tick leer.
  3. Ein einzelner Last.fm-503 oder AppleScript-Permission-Fehler crasht den Daemon nicht — der nächste Tick läuft normal weiter (Try/Catch um jeden Tick).
  4. Ctrl-C im Foreground oder `kill -TERM <pid>` führt zu sauberem Shutdown: Status wird mit 5s-Timeout-Race geleert, Prozess exited mit 0.
  5. Eine unhandled Promise Rejection oder uncaughtException schreibt einen synchronen Last-Word-Log (via `pino.final()`), bevor der Prozess terminiert — kein stiller Tod.
**Plans**: TBD

### Phase 4: launchd-Installation
**Goal**: Bridge läuft als unsichtbarer Background-Daemon, der bei Login automatisch startet, bei Crash neu gestartet wird (aber nicht bei Config-Fehlern), und Logs in `~/Library/Logs/gather-bridge.{log,err}` schreibt.
**Depends on**: Phase 3 (Daemon muss im Foreground sauber laufen, bevor er als launchd-Agent verdrahtet wird)
**Requirements**: CFG-05, DMN-01, DMN-02, DMN-03, DMN-04, DMN-05, DMN-06, DMN-07
**Success Criteria** (what must be TRUE):
  1. `npm run install-daemon` rendert Plist mit absolutem `process.execPath` für Node, schreibt nach `~/Library/LaunchAgents/`, ruft `launchctl bootstrap`/`enable`/`kickstart` und triggert TCC-Permission im Vordergrund.
  2. Nach Login startet der Daemon automatisch (RunAtLoad), läuft im Hintergrund ohne UI und setzt Gather-Status während Apple-Music-Sessions.
  3. Bei Config-Fehler (z. B. fehlender API-Key) exited der Daemon mit Code 0 und wird nicht in eine Endlosschleife restartet — `KeepAlive: { SuccessfulExit: false, Crashed: true }` plus `ThrottleInterval: 30`.
  4. AppleScript-Fallback funktioniert auch unter dem launchd-spawned Daemon, weil das Install-Script die TCC-Automation-Permission im Vordergrund initial getriggert hat.
  5. `npm run uninstall-daemon` ruft `launchctl bootout` und löscht die Plist; nach `bootout` setzt der Daemon keinen Gather-Status mehr und startet nicht beim nächsten Login.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation und Gather-Sink | 0/0 | Not started | - |
| 2. Now-Playing-Sources | 0/0 | Not started | - |
| 3. Polling-Loop und Daemon-Verdrahtung | 0/0 | Not started | - |
| 4. launchd-Installation | 0/0 | Not started | - |

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| SRC-01 | Phase 2 |
| SRC-02 | Phase 2 |
| SRC-03 | Phase 2 |
| SRC-04 | Phase 2 |
| SRC-05 | Phase 2 |
| SINK-01 | Phase 1 |
| SINK-02 | Phase 1 |
| SINK-03 | Phase 1 |
| SINK-04 | Phase 1 |
| SINK-05 | Phase 1 |
| LOOP-01 | Phase 3 |
| LOOP-02 | Phase 3 |
| LOOP-03 | Phase 3 |
| LOOP-04 | Phase 3 |
| LOOP-05 | Phase 3 |
| CFG-01 | Phase 1 |
| CFG-02 | Phase 1 |
| CFG-03 | Phase 1 |
| CFG-04 | Phase 1 |
| CFG-05 | Phase 4 |
| DMN-01 | Phase 4 |
| DMN-02 | Phase 4 |
| DMN-03 | Phase 4 |
| DMN-04 | Phase 4 |
| DMN-05 | Phase 4 |
| DMN-06 | Phase 4 |
| DMN-07 | Phase 4 |

**Coverage:** 27/27 v1 requirements mapped. No orphans, no duplicates.

## Notes

- **Phase-Research-Flag (Phase 1):** Das `gather-game-client@43`-Auto-Reconnect-Verhalten ist nicht öffentlich dokumentiert (Lib seit 2 Jahren ohne Release). Während Phase 1 muss empirisch geprüft werden, ob `subscribeToConnection`-Callback bei TCP-Halbtod, NAT-Rebinding und macOS-Sleep/Wake feuert. Das Ergebnis bestimmt, ob Phase 5 (v2) einen App-Layer-Heartbeat oder einen eigenen Reconnect-Pfad braucht.
- **Phase-Research-Flag (Phase 4):** TCC-Automation-Permission-Verhalten unter Sonoma/Sequoia (macOS 14/15) hat sich gegenüber älterer Doku verschoben. Das Install-Script muss real getestet werden, der Permission-Trigger im Vordergrund ist Pflicht-Pattern.
- **v2-Phase (nicht in v1-Roadmap):** Robustheit (Heartbeat, Reconnect, Backoff) und Quality-of-Life (Status-Längen-Cap, Log-Level-Modi, Source-Labels) werden erst nach mindestens einer Woche Live-Erfahrung adressiert. Nicht spekulativ vorbauen — siehe REQUIREMENTS.md v2-Sektion.

---
*Roadmap created: 2026-05-08*
