# gatherAppleMusicBridge

Lokaler macOS-Daemon (Node.js und TypeScript), der den aktuell in Apple Music laufenden Track in den Gather-Status schreibt. Single-User-Tool für Patrick Lorenz.

## Voraussetzungen

- macOS (Apple Silicon oder Intel)
- Node.js 22 LTS oder neuer (`node --version`)
- Apple Music plus [NepTunes](https://micropixels.software/apps/neptunes) als Last.fm-Scrobbler
- Last.fm-Account mit API-Key
- Gather-Space mit API-Key

## Setup

1. Repo klonen und Dependencies installieren:

   ```bash
   npm install
   ```

2. `.env`-Datei aus Vorlage erzeugen und mit API-Keys füllen:

   ```bash
   cp .env.example .env
   ```

   Editor öffnen, alle vier Keys eintragen: `LASTFM_API_KEY`, `LASTFM_USER`, `GATHER_API_KEY`, `GATHER_SPACE_ID`.

3. Daemon installieren (Build, launchd-Plist und TCC-Permission):

   ```bash
   npm run install-daemon
   ```

   Während des Installs erscheint einmalig ein macOS-Dialog "Terminal möchte Music steuern". Klick "OK", sonst kann der Daemon Apple Music nicht via AppleScript abfragen (siehe Troubleshooting).

4. Fertig. Bei jedem Login startet die Bridge automatisch im Hintergrund.

## Daemon-Steuerung

| Aktion | Befehl |
|--------|--------|
| Status | `launchctl print gui/$(id -u)/agency.deepr.gather-apple-music-bridge` |
| Logs (live) | `tail -f ~/Library/Logs/gather-bridge.log` |
| Errors (live) | `tail -f ~/Library/Logs/gather-bridge.err` |
| Neustart | `launchctl kickstart -k gui/$(id -u)/agency.deepr.gather-apple-music-bridge` |
| Stop | `launchctl bootout gui/$(id -u)/agency.deepr.gather-apple-music-bridge ~/Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist` |
| Deinstallieren | `npm run uninstall-daemon` |

## Logs

- `~/Library/Logs/gather-bridge.log` ist stdout (pino-JSON)
- `~/Library/Logs/gather-bridge.err` ist stderr (Crashes, AppleScript-Errors)

Pretty-Print:

```bash
tail -f ~/Library/Logs/gather-bridge.log | npx pino-pretty
```

Logs wachsen unbegrenzt, gelegentlich manuell leeren:

```bash
truncate -s 0 ~/Library/Logs/gather-bridge.log
```

## Troubleshooting

### AppleScript-Permission ("errAEEventNotPermitted -1743")

Wenn die Logs zeigen, dass der AppleScript-Fallback nicht funktioniert:

1. Permission zurücksetzen:

   ```bash
   tccutil reset AppleEvents
   ```

2. `npm run install-daemon` erneut laufen, beim TCC-Trigger im Vordergrund den Dialog mit "OK" bestätigen.

Alternativ unter **Systemeinstellungen, Datenschutz und Sicherheit, Automation** prüfen, ob "Terminal" oder "Node" Zugriff auf "Music" hat.

### Node-Version gewechselt (nvm oder Homebrew-Update)

Die Plist enthält den absoluten Pfad zum Node-Binary, das beim Install aktiv war (`process.execPath`). Nach `nvm install <neue-version>` oder einem Homebrew-Node-Update zeigt der Pfad ggf. ins Leere.

Fix: `npm run install-daemon` erneut ausführen, der neue Pfad wird in die Plist geschrieben.

### Daemon startet nicht

```bash
launchctl print gui/$(id -u)/agency.deepr.gather-apple-music-bridge
```

`last exit code` ungleich 0 deutet auf Crash hin, dann `~/Library/Logs/gather-bridge.err` lesen.

`last exit code = 78` (`EX_CONFIG`) bedeutet meist Plist-Parse-Fehler oder fehlendes Node-Binary, dann Plist neu generieren via `npm run install-daemon`.

### Crash-Loop verhindern

Die Plist nutzt `KeepAlive: { SuccessfulExit: false, Crashed: true }` plus `ThrottleInterval: 30`. Das heißt:

- **Sauberer Exit (Code 0)** ist kein Restart. Config-Fehler (z. B. fehlender API-Key) führen zu `process.exit(0)` und werden nicht restartet.
- **Crash (Code ungleich 0)** ist ein Restart, frühestens nach 30 Sekunden.

Wenn der Daemon trotzdem in Loops läuft: `npm run uninstall-daemon` und Logs analysieren.

### Audit-Warnungen (`npm audit`)

`@gathertown/gather-game-client` zieht alte Versionen von `axios` und `protobufjs` (CVE-Findings). Das Tool ist Single-User, kontaktiert nur Last.fm und Gather, hat keine User-Inputs in URLs oder Bodies, die Warnings sind hier ohne praktische Konsequenz.

## Architektur

- `src/index.ts` ist der Daemon-Entrypoint (WebSocket-Polyfill, Sink-Connect, Signal-Handler, Polling-Loop, Last-Word-Log)
- `src/sources/` enthält Last.fm und AppleScript Now-Playing-Sources mit AppleScript als Authority für Play und Pause
- `src/sink/` enthält den Gather-WebSocket-Wrapper (`setEmojiStatus` plus `setTextStatus`)
- `src/loop.ts` ist der 10s-Polling-Loop mit recursive `setTimeout`, AbortController und Track-Diff
- `scripts/install-daemon.ts` generiert die launchd-Plist und spielt sie ein
- `scripts/uninstall-daemon.ts` entfernt die Plist und stoppt den Daemon
- `scripts/lib/plist.ts` ist der Plist-XML-Template-Renderer

## Lizenz

Privat, nicht veröffentlicht.
