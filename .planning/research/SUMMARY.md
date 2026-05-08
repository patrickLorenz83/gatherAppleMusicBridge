# Project Research Summary

**Project:** gatherAppleMusicBridge
**Domain:** Local macOS Background-Daemon (Node.js/TypeScript), Apple-Music-zu-Gather-Status-Bridge
**Researched:** 2026-05-08
**Confidence:** HIGH

## Executive Summary

Diese Bridge ist ein klassischer "Currently-playing zu External-Presence"-Daemon, der unter macOS als launchd-User-Agent läuft. Die Recherche bestätigt das Pattern aus drei Quellen: das offizielle Gather-Beispiel `mod-spotify-as-status` (Sink-Setup, WebSocket-Polyfill, Action-Schema), `NextFire/apple-music-discord-rpc` (architektonischer Zwilling, gleiche OS-Quelle, gleicher launch-agent-Patternsatz) und `gather-scrobble` (Last.fm-zu-Gather-Variante). Die Architektur ist trivial in der Substanz, aber dicht in den Details: drei Komponenten (Sources, Sink, Loop), drei externe Integrationen (Last.fm HTTPS, Music.app via AppleScript, Gather via WebSocket), alles orchestriert von einem 30-Zeilen-Polling-Loop mit Diff-Logik.

**Wichtigste Korrektur an PROJECT.md:** Gather-Status wird **nicht** über die HTTP-API gesetzt, sondern via `@gathertown/gather-game-client` über WebSocket mit den Actions `setEmojiStatus` + `setTextStatus`. Die HTTP-API ist für Räume/Maps/Objekte zuständig, nicht für Live-Player-Status. Diese Korrektur ist nicht-trivial, weil sie das Setup verschärft (`global.WebSocket`-Polyfill muss vor Game-Client-Import gesetzt werden, sonst stiller Crash).

**Hauptrisiken und Mitigation:** (1) launchd `KeepAlive: true` mit Config-Fehler erzeugt Endlos-Crash-Loops, deshalb **strukturiertes** `KeepAlive: { SuccessfulExit: false }` plus `process.exit(0)` bei Config-Fehlern. (2) AppleScript-Permissions (TCC) werden im Hintergrund nicht zuverlässig erteilt, deshalb Permission-Trigger im Vordergrund über das Install-Script. (3) Last.fm `track[0]` ist nicht zwingend der nowplaying-Track, deshalb per `@attr.nowplaying === "true"` filtern. (4) Gather-WebSocket-Verbindung kann silent sterben, deshalb App-Layer-Heartbeat alle 60 s.

## Key Findings

### Recommended Stack

Node.js 22 LTS + TypeScript 5.7 + ESM, mit native `fetch` für Last.fm und `run-applescript` für den AppleScript-Fallback. Kein `dotenv-cli`, kein `pm2`, kein winston, kein `node-fetch`, kein `axios`. Process-Supervision via launchd allein. Logger ist `pino`, weil JSON nach stderr/stdout sich sauber in launchd's `StandardOutPath`/`StandardErrorPath` übersetzt.

**Core technologies:**
- **Node.js 22 LTS**: Runtime, stabil bis April 2027, native fetch und ESM ohne Boilerplate
- **TypeScript 5.7** (nicht 6.0): Sprache, breite Tool-Kompatibilität, 6.x ist Q1-2026-Release mit Tool-Drift
- **`@gathertown/gather-game-client@43.0.1`**: Gather-Sink via WebSocket, einziger Weg für Live-Player-Status, alt aber nicht deprecated
- **`isomorphic-ws@5` + `ws@8`**: WebSocket-Polyfill, **muss** vor Game-Client-Import als Side-Effect-Modul geladen werden
- **`run-applescript@7`**: Music.app-Fallback ohne selbstgebauten Subprocess-Call, ESM-only
- **native `fetch`** + **`zod@4`**: Last.fm-Client als 30-Zeilen-Wrapper statt npm-Paket
- **`pino@10`**: strukturierter JSON-Logger mit Redaction für API-Keys
- **`dotenv@17`**: `.env`-Loader aus `WorkingDirectory`, Plist hardcodet keine Secrets
- **launchd**: User-Agent in `~/Library/LaunchAgents/`, modernes `bootstrap`/`bootout`/`kickstart`-Pattern

Ausführliche Versionsmatrix und alternative Optionen siehe `STACK.md`.

### Expected Features

Single-User-Domain ohne Wettbewerbskontext. "Differentiator" ist hier "Quality-of-Life nach v1". Anti-Features sind das wichtigste Kapitel, weil Scope-Creep das primäre Risiko ist.

**Must have (table stakes):**
- Last.fm `getRecentTracks?nowplaying=true` Polling alle 10 s
- AppleScript-Fallback gegen Music.app, wenn Last.fm nichts liefert
- `setEmojiStatus` + `setTextStatus` über WebSocket (nicht HTTP)
- Status leeren bei Pause/Stop (saubere Anzeige für Kollegen)
- Track-Diff-Logik (kein Spam-Update bei gleichem Track)
- `.env` für Secrets, in `.gitignore` **vor erstem Commit**
- launchd-Plist via `npm run install-daemon`, mit `KeepAlive: { SuccessfulExit: false }`
- Stderr/Stdout in `~/Library/Logs/gather-bridge.{log,err}`
- Try/Catch um jeden Tick (kein Daemon-Crash bei Last.fm-Schluckauf)
- Verifikation des `gather-game-client`-Reconnect-Verhaltens, ggf. eigenes Reconnect

**Should have (Quality-of-Life nach v1):**
- App-Layer-Heartbeat alle 60 s (Status erneut senden, hält WebSocket wach)
- Track-Längen-Cap auf ~80 Zeichen mit Ellipsis
- Verbose/Quiet-Logging-Modi via `LOG_LEVEL`
- Exponential-Backoff bei aufeinander folgenden Fehlern (10s -> 30s -> 60s -> 5min cap)
- Source-Label in Logs (`[lastfm]` vs `[applescript]`)

**Defer (v2+):**
- Custom-Emoji-Rotation (rein kosmetisch)
- Health-Check-HTTP-Endpoint (nur wenn jemand etwas baut, das ihn pingt)
- Pause-Visible-Status-Modus (Default = clear, sauberer)
- Log-Rotation (manuelles `truncate` reicht für Single-User-Tool)

**Bewusst nicht (Anti-Features):**
- Scrobbling, Music-Control, Multi-Source-Aggregation, Tray-UI, Auto-Update, Single-Binary, Tests/CI, Open-Source-Release, Keychain-Integration, Podcasts/Audiobooks, Meeting/DnD-Integration

Vollständige Liste und Begründung siehe `FEATURES.md`.

### Architecture Approach

Drei harte Komponenten-Grenzen mit klaren Interfaces, alles dazwischen ist trivial. Polling über rekursives `setTimeout` (nicht `setInterval`, wegen Drift und Overlap-Risiko bei langsamen Ticks). Source-Chain-Pattern mit `NowPlayingSource`-Interface, AppleScript ist **nicht nur Fallback bei Last.fm-Outage**, sondern Authority für Play/Pause/Stop, weil NepTunes Last.fm's `nowplaying`-Flag nicht aktiv löscht und es 10 Min lang stale stehen kann. Sink ist ein zustandsbehafteter Wrapper um den Game-Client mit lazy Connect, eigenem `connected`-Flag und `clearStatus`-Methode für Shutdown.

**Major components:**
1. **Sources** (`src/sources/`): `lastfm.ts` (HTTPS + Zod), `appleScript.ts` (run-applescript + Music.app-Running-Check), `chain.ts` (sequenzielles Try mit Error-zu-null-Mapping)
2. **Sink** (`src/sink/gather.ts`): `GatherSink`-Klasse, kapselt Game-Client, exposed nur `connect`, `setStatus`, `clearStatus`
3. **Loop/Orchestrator** (`src/loop.ts` + `src/index.ts`): Recursive `setTimeout` mit `AbortController`, Composite-Key-Diff (`${artist}|${track}` lowercase trimmed), SIGTERM-Handler mit 5s-Timeout-Race vor `process.exit(0)`
4. **Config + Logger** (`src/config.ts`, `src/logger.ts`): Zod-validierte Env-Variablen, pino mit Redaction für API-Keys
5. **Install-Scripts** (`scripts/`): `install-daemon.ts` rendert Plist-Template mit absoluten Pfaden (`process.execPath` für Node-Binary), ruft `launchctl bootstrap`; symmetrisches `uninstall-daemon.ts`

Build-Reihenfolge nach Risiko, nicht nach Daten-Flow: **Sink zuerst** (höchstes Risiko durch Polyfill-Order und WebSocket-Lifecycle), dann Sources, dann Loop, dann Install-Script. Vollständiges Daten- und Lifecycle-Flow-Diagramm siehe `ARCHITECTURE.md`.

### Critical Pitfalls

Die fünf wichtigsten von 21 dokumentierten Stolperfallen:

1. **WebSocket-Polyfill nach Game-Client-Import** — `globalThis.WebSocket = WS` muss in einem **separaten Side-Effect-Modul** liegen, das **vor** `import { Game }` geladen wird. ESM-Static-Imports laufen vor Top-Level-Code im selben Modul, deshalb stille `TypeError: WebSocket is not a constructor` zur Connect-Zeit
2. **`KeepAlive: true` + Config-Fehler = Endlos-Crash-Loop** — strukturiertes `KeepAlive: { SuccessfulExit: false, Crashed: true }` plus `process.exit(0)` (nicht 1) bei Config-Validation-Fehlern, plus `ThrottleInterval: 30` für sanftere Crashes
3. **Last.fm `track[0]` ist nicht zwingend der nowplaying-Track** — bei aktivem nowplaying liefert die API N+1 Tracks, immer per `track.find(t => t["@attr"]?.nowplaying === "true")` filtern, niemals per Position
4. **`tell application "Music"` startet Music.app, wenn sie nicht läuft** — Outer-Guard mit `if application "Music" is running then ...`, sonst macht der Daemon Music.app zum Zombie
5. **AppleScript-TCC-Permission im Hintergrund nicht erteilbar** — Erst-Aktivierung muss im Install-Script im Vordergrund passieren (`osascript -e 'tell application "Music" to player state'`), sonst zeigt macOS den Prompt nie und der Fallback failed silent

Weitere wichtige Klassen von Pitfalls: Path-Probleme bei launchd (Node-Binary muss absoluter Pfad sein, `process.execPath` zur Install-Zeit), Gather-WebSocket-Silent-Death nach Idle (App-Layer-Heartbeat alle 60s), AppleScript als **Authority für Play/Pause** statt nur als Fallback (sonst hängt Status 10 Min nach Pause), unhandled-rejection-Handler mit `pino.final()` für synchronen Last-Word-Log. Gesamte Liste mit Mitigation siehe `PITFALLS.md`.

## Implications for Roadmap

Die Architektur-Recherche schlägt eine Build-Reihenfolge nach **Risiko** vor, nicht nach Daten-Flow. Die naheliegende Reihenfolge "von Quelle zur Senke" (Last.fm zuerst) ist gefährlich, weil das risikoreichste Stück (Gather-Sink mit WebSocket-Polyfill-Trickserei) ans Ende rutscht, wo man schon 80% Code geschrieben hat. Stattdessen: Sink-First.

### Phase 1: Foundation und Gather-Sink

**Rationale:** Die Gather-WebSocket-Integration ist das einzige unbekannte und damit höchste Risiko. Wenn Polyfill-Order, `subscribeToConnection`-Lifecycle oder Action-Schema falsch sind, ist das Projekt tot, egal wie schön Last.fm und AppleScript laufen. Diese Phase verifiziert mit einer Mock-Source (hardcoded Track), dass `setEmojiStatus`+`setTextStatus` tatsächlich in Gather sichtbar werden.

**Delivers:**
- Repo-Init mit `.gitignore` als allerersten Commit, `.env.example`, `tsconfig.json`, `package.json` mit ESM
- `src/types.ts`, `src/config.ts` (Zod-validiert), `src/logger.ts` (pino mit Redaction)
- `src/setup-ws.ts` als Side-Effect-Polyfill-Modul
- `src/sink/gather.ts` mit `GatherSink`-Klasse: connect, setStatus, clearStatus, eigenes connected-Flag
- Smoke-Test-Script (`scripts/test-sink.ts`), das mit hardcoded `{artist, track}` einen Status setzt und 10s später leert

**Addresses:** Gather-Status (table stakes), Track-Diff-Vorbereitung (table stakes)
**Avoids:** Pitfall 4 (Polyfill-Order), Pitfall 5 (API-Key-Leak via Redaction), Pitfall 16 (Status-Längen-Cap), Pitfall 21 (ESM-`.js`-Imports)
**Uses:** TypeScript 5.7 + ESM, `@gathertown/gather-game-client`, `isomorphic-ws`, `pino`, `dotenv`, `zod`

### Phase 2: Sources (Last.fm + AppleScript)

**Rationale:** Mit funktionierender Sink lassen sich Sources einzeln gegen den realen Daemon-Pfad testen. AppleScript-Source kommt nach Last.fm, weil die TCC-Permission-Mechanik komplexer ist und besser nicht parallel zur Last.fm-Schema-Verifikation läuft.

**Delivers:**
- `src/sources/lastfm.ts` mit nativem fetch, Zod-validiert, `AbortSignal.timeout(5000)`
- `src/sources/appleScript.ts` mit `run-applescript`, **mit `if application "Music" is running then` Outer-Guard**, separater Output-Separator (Tab statt `|||`)
- `src/sources/chain.ts`: sequenzielles Try, Error-zu-null-Mapping, Logging der Source-Auswahl
- AppleScript als **Authority für Play/Pause/Stop**: erst Music.app-State prüfen, dann erst Last.fm fragen für Metadata

**Addresses:** Last.fm-Read (table stakes), AppleScript-Fallback (table stakes), Track-Diff-Logik (table stakes)
**Avoids:** Pitfall 1 (Music.app-Auto-Start), Pitfall 3 (`track[0]` vs `@attr.nowplaying`), Pitfall 10 (Pause-Detection nur per AppleScript), Pitfall 15 (Unicode/Separator)
**Implements:** Source-Chain-Pattern, `NowPlayingSource`-Interface

### Phase 3: Polling-Loop und Daemon-Verdrahtung

**Rationale:** Sources und Sink sind isoliert getestet, jetzt die Orchestrierung. Loop-Logik ist konzeptuell einfach, aber `try/finally`-Disziplin und SIGTERM-Race-Guard sind die Stolperfallen.

**Delivers:**
- `src/loop.ts`: rekursives `setTimeout` mit `AbortController`, Composite-Key-Diff, Exponential-Backoff (10s -> 5min cap), `consecutiveErrors`-Tracking
- `src/index.ts`: Wiring, SIGTERM/SIGINT-Handler mit 5s-Race vor `clearStatus()` + `process.exit(0)`, `unhandledRejection`/`uncaughtException`-Handler mit `pino.final()`
- End-to-End-Test mit `tsx watch src/index.ts` während echter Apple-Music-Session

**Addresses:** 10s-Polling (table stakes), Track-Diff (table stakes), Clear-on-Pause (table stakes), Last.fm-Error-Swallow (table stakes)
**Avoids:** Pitfall 9 (Polling-Interval-Drift), Pitfall 14 (Sleep/Wake-Drift), Pitfall 17 (unhandled-rejection-Daemon-Tod)
**Uses:** AbortController, native Node-Timer-API

### Phase 4: launchd-Integration

**Rationale:** Erst wenn der Daemon im Foreground sauber läuft, lohnt sich die launchd-Verdrahtung. Diese Phase ist technisch nicht schwer, hat aber die meisten "Daemon-installiert-aber-läuft-nie"-Fallen (Path, Permissions, KeepAlive-Loops).

**Delivers:**
- `scripts/plist.template.xml` mit `${PLACEHOLDERS}` für `${REPO}`, `${NODE_BIN}`, `${UID}`, `${USER}`
- `scripts/install-daemon.ts`: Plist rendern (Node-Binary über `process.execPath`), schreiben nach `~/Library/LaunchAgents/`, `launchctl bootout/bootstrap/enable/kickstart`, **Permission-Trigger im Vordergrund** (`osascript -e 'tell application "Music" to player state'`)
- `scripts/uninstall-daemon.ts`: symmetrisches `bootout` + Plist-Löschung
- Plist mit `KeepAlive: { SuccessfulExit: false, Crashed: true }`, `ThrottleInterval: 30`, `WorkingDirectory: <repo>`, `EnvironmentVariables.PATH`, `StandardOut/ErrorPath` in `~/Library/Logs/`
- README mit Kill-Switch-Befehl und nvm-Warnung

**Addresses:** Daemon-Installation (table stakes), Auto-Start bei Login (table stakes), Auto-Restart bei Crash (table stakes), Logging in Datei (table stakes)
**Avoids:** Pitfall 2 (KeepAlive-Crash-Loop), Pitfall 5 (`.gitignore`-First), Pitfall 6 (Node-Path), Pitfall 7 (TCC-Permission-Trigger), Pitfall 11+12 (Logging-Pfad), Pitfall 19 (dist-vs-src), Pitfall 20 (dotenv-`WorkingDirectory`)
**Uses:** launchd `bootstrap`/`bootout`/`kickstart`, `process.execPath`

### Phase 5 (optional, nach v1): Robustheit und QoL

**Rationale:** Erst einbauen, wenn v1 mindestens eine Woche unter realen Bedingungen lief und konkrete Probleme auftraten. **Nicht spekulativ vorbauen.**

**Delivers (je nach lived experience):**
- App-Layer-Heartbeat (alle 60s aktuellen Status erneut senden), wahrscheinlich nötig
- Reconnect-Logik mit `subscribeToConnection`-Callback, falls SDK-Auto-Reconnect nicht reicht (in Phase 1 verifiziert)
- Status-Längen-Cap mit Ellipsis (`…` bei > 80 Zeichen)
- Verbose-Logging-Modus via `LOG_LEVEL`-env
- Exponential-Backoff bei Last.fm-Errors
- Konfigurierbares Format-String

**Avoids:** Pitfall 8 (Gather-Idle-Silent-Death), Pitfall 16 (Status-Längen-Cap), Pitfall 13 (NepTunes-Upgrade-bricht-Scrobbling)

### Phase Ordering Rationale

- **Sink-First eliminiert das größte Unbekannte in Stunde 1.** Polyfill-Order und WebSocket-Lifecycle sind so spezifisch, dass jede andere Reihenfolge das Risiko hat, am Ende der Implementation festzustellen, dass der Sink zickt.
- **Sources nach Sink, in der Reihenfolge Last.fm-vor-AppleScript**, weil Last.fm reines HTTPS+JSON ist und AppleScript die TCC-Permission-Komplexität reinbringt.
- **Loop-Orchestrierung kommt nach Sources**, weil sie konzeptuell trivial ist, sobald Sources und Sink stabile Interfaces haben.
- **launchd zum Schluss**, nicht parallel: solange `tsx watch src/index.ts` für End-to-End-Tests reicht, lenken Plist-Details nur ab.
- **Robustheit erst nach v1-Live-Erfahrung**, weil Gather-Idle-Verhalten und Backoff-Schwellen empirisch bestimmt werden müssen.

### Research Flags

**Phasen, die wahrscheinlich Phase-Research brauchen:**

- **Phase 1 (Gather-Sink):** Verhalten von `gather-game-client@43`-Auto-Reconnect ist nicht öffentlich dokumentiert. `subscribeToConnection`-Semantik bei TCP-Halbtod, NAT-Rebinding, macOS-Sleep/Wake muss empirisch ermittelt werden.
- **Phase 4 (launchd):** TCC-Automation-Permission-Verhalten unter Sonoma/Sequoia (macOS 14/15) hat sich gegenüber älterer Doku verschoben.

**Phasen mit etablierten Patterns (Phase-Research vermutlich überflüssig):** Phase 2, Phase 3, Phase 5

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Alle Versionen via `npm view` 2026-05-08 verifiziert. Gather-Pattern aus offiziellem Referenz-Repo. |
| Features | MEDIUM-HIGH | Sechs Reference-Projekte analysiert. Single-User-Domain hat keinen Markt-Vergleich. Anti-Features sind gut belegt durch PROJECT.md-Constraints. |
| Architecture | HIGH | Komponenten-Schnitt aus Stack + Reference-Repo abgeleitet. Polling-/Lifecycle-Patterns sind Standard-Node-Idiome. |
| Pitfalls | HIGH | Last.fm-Quirks via offiziellem Last.fm-Support-Forum, launchd-Quirks via Apple-Dev-Forum, Node-Sleep/Wake via Node-Issue-Tracker. |

**Overall confidence:** HIGH

### Gaps to Address

- **`gather-game-client@43` Auto-Reconnect-Verhalten** ist nicht öffentlich dokumentiert. Während Phase 1 muss empirisch geprüft werden.
- **TCC-AppleScript-Permission unter macOS 14/15 für launchd-Children:** in Phase 4 muss das Install-Script real getestet werden.
- **Gather-Status-Längen-Limit ist nicht offiziell dokumentiert.** Erfahrungswerte: ~80-100 Zeichen unkritisch.
- **NepTunes-Verhalten bei Last.fm-Auth-Verlust nach macOS-Update:** kein technischer Bug der Bridge, dokumentationswürdig im README.
- **`@gathertown/gather-game-client@43` ist seit 2 Jahren ohne Release.** Mitigation: README-Hinweis, Lock-File committen.

## Sources

### Primary (HIGH confidence)

**Reference-Repos:**
- https://github.com/gathertown/mod-spotify-as-status
- https://github.com/gathertown/api-examples
- https://github.com/Markkop/gather-town-websocket-examples
- https://github.com/NextFire/apple-music-discord-rpc
- https://pypi.org/project/gather-scrobble/

**Last.fm-Quirks:**
- https://support.last.fm/t/user-getrecenttracks-the-most-recent-track-will-not-include-a-date-field-if-it-is-currently-playing/115900
- https://www.last.fm/api/tos
- https://www.last.fm/api/errorcodes

**launchd / macOS:**
- https://www.launchd.info/
- https://developer.apple.com/forums/thread/22824
- https://bitsplitting.org/2018/07/11/reauthorizing-automation-in-mojave/
- https://scriptingosx.com/2020/09/avoiding-applescript-security-and-privacy-requests/

**Node.js / TypeScript:**
- https://nodejs.org/api/esm.html
- https://github.com/nodejs/node/issues/20661
- https://lucumr.pocoo.org/2024/6/5/node-timeout/

### Secondary (MEDIUM confidence)
- @gathertown/gather-game-client TypeDoc (S3-Hosting)
- https://forum.gather.town/t/web-socket-api-why-sometime-error-1006/714/2
- https://forum.gather.town/t/npm-vulnerability-protobuffjs-6-10-0-7-2-3/673

---
*Research completed: 2026-05-08*
*Ready for roadmap: yes*
