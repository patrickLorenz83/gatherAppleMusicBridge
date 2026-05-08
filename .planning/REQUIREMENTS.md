# Requirements: gatherAppleMusicBridge

**Defined:** 2026-05-08
**Core Value:** Wenn ich in Gather online bin, sehen meine Kollegen, was ich gerade höre, ohne dass ich von Apple Music auf Spotify wechseln muss.

## v1 Requirements

### Sources (Now-Playing-Daten)

- [ ] **SRC-01**: Bridge liest aktuell laufenden Track aus Last.fm via `user.getRecentTracks` und filtert per `@attr.nowplaying === "true"` (nicht per Position)
- [ ] **SRC-02**: Bridge nutzt AppleScript gegen Music.app als Fallback, wenn Last.fm keinen Now-Playing-Track liefert
- [ ] **SRC-03**: AppleScript-Source ist Authority für Play/Pause/Stop, weil Last.fm `nowplaying`-Flag nach Pause stale stehen kann
- [ ] **SRC-04**: AppleScript prüft via `System Events` ob Music.app läuft, bevor `tell application "Music"` ausgeführt wird (verhindert Auto-Start)
- [ ] **SRC-05**: Source-Chain implementiert ein gemeinsames `NowPlayingSource`-Interface mit Error-zu-null-Mapping

### Sink (Gather-Status)

- [ ] **SINK-01**: Bridge connected zu Gather via `@gathertown/gather-game-client` (WebSocket, nicht HTTP)
- [ ] **SINK-02**: WebSocket-Polyfill (`globalThis.WebSocket = WS`) wird in einem Side-Effect-Modul **vor** Game-Client-Import gesetzt
- [ ] **SINK-03**: Bridge setzt Gather-Status via `setEmojiStatus` (♫) + `setTextStatus` (`Artist – Track`)
- [ ] **SINK-04**: Bridge leert Gather-Status (`setTextStatus("")`), wenn Apple Music pausiert oder gestoppt ist
- [ ] **SINK-05**: GatherSink-Wrapper exposed nur `connect`, `setStatus`, `clearStatus` mit eigenem `connected`-Flag

### Polling-Loop und Diff

- [ ] **LOOP-01**: Polling-Loop läuft alle 10 Sekunden, implementiert über rekursives `setTimeout` mit `AbortController` (nicht `setInterval`)
- [ ] **LOOP-02**: Track-Diff über Composite-Key `${artist}|${track}` (lowercase, trimmed), kein redundantes setStatus bei gleichem Track
- [ ] **LOOP-03**: Try/Catch um jeden Tick, einzelner Last.fm- oder AppleScript-Fehler crasht den Daemon nicht
- [ ] **LOOP-04**: SIGTERM/SIGINT-Handler räumt Gather-Status (5s-Timeout-Race) und exited mit `process.exit(0)`
- [ ] **LOOP-05**: `unhandledRejection`/`uncaughtException`-Handler nutzt `pino.final()` für synchronen Last-Word-Log

### Konfiguration und Logging

- [ ] **CFG-01**: API-Keys (`LASTFM_API_KEY`, `LASTFM_USER`, `GATHER_API_KEY`, `GATHER_SPACE_ID`) liegen in `.env`-Datei im Repo-Root
- [ ] **CFG-02**: `.env` ist in `.gitignore` (vor erstem Commit), `.env.example` ist committet
- [ ] **CFG-03**: Config-Loader validiert alle Env-Variablen mit Zod, beendet bei Fehlern mit `process.exit(0)` (nicht 1) gegen KeepAlive-Loop
- [ ] **CFG-04**: Pino-Logger mit Redaction für API-Keys (kein Token in Logs)
- [ ] **CFG-05**: Logs gehen nach stderr/stdout, launchd routet zu `~/Library/Logs/gather-bridge.{log,err}`

### Daemon-Installation (launchd)

- [ ] **DMN-01**: `npm run install-daemon` rendert Plist-Template mit absolutem Node-Pfad (`process.execPath`) und schreibt nach `~/Library/LaunchAgents/`
- [ ] **DMN-02**: Plist verwendet `KeepAlive: { SuccessfulExit: false, Crashed: true }` plus `ThrottleInterval: 30` (kein Endlos-Loop)
- [ ] **DMN-03**: Install-Script triggert AppleScript-TCC-Permission im Vordergrund (`osascript -e 'tell application "Music" to player state'`), damit der Daemon-Fallback nicht silent failed
- [ ] **DMN-04**: Install-Script ruft modernes `launchctl bootstrap`/`enable`/`kickstart` (nicht deprecated `load`)
- [ ] **DMN-05**: `npm run uninstall-daemon` ruft symmetrisches `launchctl bootout` und löscht die Plist
- [ ] **DMN-06**: Daemon startet automatisch beim Login (RunAtLoad in Plist)
- [ ] **DMN-07**: Plist setzt `WorkingDirectory: <repo>` damit `dotenv` die `.env` findet

## v2 Requirements

Reaktiv nach v1, basierend auf Live-Erfahrung.

### Robustheit und Reconnect

- **ROBUST-01**: App-Layer-Heartbeat alle 60s (Status erneut senden), falls Gather-WebSocket idle silent stirbt
- **ROBUST-02**: Eigene Reconnect-Logik mit `subscribeToConnection`-Callback, falls SDK-Auto-Reconnect nicht reicht
- **ROBUST-03**: Exponential-Backoff bei aufeinander folgenden Fehlern (10s → 30s → 60s → 5min cap)

### Quality-of-Life

- **QOL-01**: Status-Längen-Cap mit Ellipsis (`…` bei > 80 Zeichen)
- **QOL-02**: Verbose/Quiet-Logging-Modi via `LOG_LEVEL`-env
- **QOL-03**: Source-Label in Logs (`[lastfm]` vs `[applescript]`)
- **QOL-04**: Konfigurierbares Format-Template (`{emoji} {artist} – {track}`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-User / Team-Setup | Tool ist explizit Single-User für Patrick |
| Spotify-Integration | Gather hat das nativ, deshalb diese Bridge überhaupt |
| Cloud-Deployment / Cloudflare Worker | Lokal reicht, keine Server-Kosten |
| Tray-/Menüleisten-UI | Daemon ist invisible, kein UI-Aufwand für v1 |
| Andere Streaming-Dienste (YouTube Music, Tidal) | Apple Music ist der einzige Use Case |
| Tests, CI | Single-User-Tool, würde nur Overhead bringen |
| Open-Source-Veröffentlichung | Kein Bedarf, würde Doku/License/Templates nötig machen |
| Single-Binary-Distribution (pkg/nexe) | npm + launchd reicht für ein Tool, das nur ich nutze |
| macOS Keychain für Secrets | `.env` reicht, Keychain wäre Overkill |
| Music-Control (Play/Pause/Skip aus Bridge) | Bridge ist nur Read+Forward, keine Steuerung |
| Scrobbling | NepTunes übernimmt das, Bridge dupliziert nicht |
| Rich-Presence-/History-Tracking | Status setzen reicht, History interessiert mich nicht |
| Auto-Update-Mechanismus | `git pull && npm install` reicht für mein eigenes Tool |
| Log-Rotation | Manuelles `truncate` reicht für Single-User-Tool |
| Podcasts/Audiobooks-Support | Apple Music = Musik, andere Apple-Apps nicht im Scope |
| Meeting/DnD-Integration (Status pausieren bei Calls) | Spekulative QoL, nicht Core Value |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRC-01 | TBD | Pending |
| SRC-02 | TBD | Pending |
| SRC-03 | TBD | Pending |
| SRC-04 | TBD | Pending |
| SRC-05 | TBD | Pending |
| SINK-01 | TBD | Pending |
| SINK-02 | TBD | Pending |
| SINK-03 | TBD | Pending |
| SINK-04 | TBD | Pending |
| SINK-05 | TBD | Pending |
| LOOP-01 | TBD | Pending |
| LOOP-02 | TBD | Pending |
| LOOP-03 | TBD | Pending |
| LOOP-04 | TBD | Pending |
| LOOP-05 | TBD | Pending |
| CFG-01 | TBD | Pending |
| CFG-02 | TBD | Pending |
| CFG-03 | TBD | Pending |
| CFG-04 | TBD | Pending |
| CFG-05 | TBD | Pending |
| DMN-01 | TBD | Pending |
| DMN-02 | TBD | Pending |
| DMN-03 | TBD | Pending |
| DMN-04 | TBD | Pending |
| DMN-05 | TBD | Pending |
| DMN-06 | TBD | Pending |
| DMN-07 | TBD | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 0 (filled by roadmapper)
- Unmapped: 27 ⚠️ (will be resolved by roadmap)

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-08 after initial definition*
