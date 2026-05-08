# gatherAppleMusicBridge

Lokaler macOS-Daemon (Node.js und TypeScript), der den aktuell in Apple Music laufenden Track in den Gather-Status schreibt. Single-User-Tool für Patrick Lorenz.

## Voraussetzungen

- macOS (Apple Silicon oder Intel)
- Node.js 22 LTS oder neuer (`node --version`)
- Apple Music plus [NepTunes](https://micropixels.software/apps/neptunes) als Last.fm-Scrobbler
- Last.fm-Account mit API-Key (optional, ohne Last.fm fällt der Daemon auf AppleScript-only zurück)
- GatherV2-Desktop-App (`app.v2.gather.town`) installiert, Account-Login funktioniert

## Setup

1. Repo klonen und Dependencies installieren:

   ```bash
   npm install
   ```

2. `.env`-Datei aus Vorlage erzeugen:

   ```bash
   cp .env.example .env
   ```

   Optional: Last.fm-Vars (`LASTFM_API_KEY`, `LASTFM_USER`) eintragen, falls Last.fm als Now-Playing-Source genutzt werden soll. Ohne sie läuft der Daemon AppleScript-only. Beide Felder müssen entweder beide gesetzt oder beide leer sein.

3. Daemon installieren (Build, launchd-Plist und TCC-Permission):

   ```bash
   npm run install-daemon
   ```

   Während des Installs erscheint einmalig ein macOS-Dialog "Terminal möchte Music steuern". Klick "OK", sonst kann der Daemon Apple Music nicht via AppleScript abfragen (siehe Troubleshooting).

4. Fertig. Bei jedem Login startet die Bridge automatisch im Hintergrund.

## GatherV2 mit Debug-Flag starten

Die Bridge spricht ab Phase 5 nicht mehr das Gather-1.0-WebSocket-Protokoll, sondern steuert die lokal laufende GatherV2-Electron-App via Chrome-DevTools-Protocol (CDP). Voraussetzung dafür: die App muss mit dem Debug-Port-Flag gestartet sein.

**Einmalige Test-Session:**

```bash
open -a GatherV2 --args --remote-debugging-port=9222
```

Login im Space, dann verifizieren:

```bash
npm run check-cdp
```

Erwartete Ausgabe: `✅ GatherV2-Page erreichbar: https://app.v2.gather.town/...`.

**Persistente Lösung (empfohlen):** GatherV2 als Login-Item mit dem Flag eintragen. Aktuell out-of-scope der v1, manuell oder via separater Phase v2.1.

**Wenn der Flag fehlt:** Der Daemon loggt beim ersten Tick `[gather] no GatherV2 page found at localhost:9222` und überspringt den Tick. Beim nächsten Tick (10s später) versucht er es erneut. Kein Crash.

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

### CDP nicht erreichbar oder GatherV2-Page nicht gefunden

1. `npm run check-cdp` ausführen — der Helper sagt dir präzise, welcher der zwei Failure-Modes vorliegt:
   - **CDP-Port `localhost:9222` antwortet nicht** -> GatherV2 läuft nicht oder wurde ohne `--remote-debugging-port`-Flag gestartet. Lösung:
     ```bash
     # GatherV2 sauber beenden, dann:
     open -a GatherV2 --args --remote-debugging-port=9222
     ```
   - **Port antwortet, aber keine `app.v2.gather.town`-Page** -> App ist auf Login-Page oder du bist ausgeloggt. Im UI einloggen und in den Space gehen.

2. Falls du einen anderen Port nutzen willst (z.B. wenn 9222 belegt ist):
   ```bash
   open -a GatherV2 --args --remote-debugging-port=9333
   # in der .env:
   GATHER_CDP_PORT=9333
   ```

### Audit-Warnungen (`npm audit`)

Vor Phase 5 zog der alte Gather-Game-Client alte axios- und protobufjs-Versionen mit CVE-Findings ein. Mit dem CDP-Refactor ist diese Dependency raus, `npm audit` sollte deutlich ruhiger sein. `chrome-remote-interface` ist gut gepflegt; falls dort eigene Audit-Hits auftauchen, lokal prüfen — das Tool ist Single-User und kontaktiert keine User-kontrollierten URLs.

## Architektur

- `src/index.ts` ist der Daemon-Entrypoint (Sink-Connect, Signal-Handler, Polling-Loop, Last-Word-Log)
- `src/sources/` enthält Last.fm und AppleScript Now-Playing-Sources mit AppleScript als Authority für Play und Pause
- `src/sink/` enthält den CDP-Wrapper gegen die GatherV2-Electron-App (`setCustomStatus` und `clearCustomStatus` via Chrome-DevTools-Protocol)
- `src/loop.ts` ist der 10s-Polling-Loop mit recursive `setTimeout`, AbortController und Track-Diff
- `scripts/install-daemon.ts` generiert die launchd-Plist und spielt sie ein
- `scripts/uninstall-daemon.ts` entfernt die Plist und stoppt den Daemon
- `scripts/check-cdp.ts` ist der CDP-Pre-Flight-Helper (`npm run check-cdp`)
- `scripts/lib/plist.ts` ist der Plist-XML-Template-Renderer

## Lizenz

Privat, nicht veröffentlicht.
