# Pitfalls Research

**Domain:** Local macOS Background-Daemon (Node.js/TypeScript) — Apple-Music-zu-Gather-Status-Bridge
**Researched:** 2026-05-08
**Confidence:** HIGH (Last.fm-/launchd-Quirks per official Last.fm Support, Apple Dev, Node-Issue-Tracker bestätigt; Gather-Spezifika MEDIUM, da `gather-game-client@43` seit 2 Jahren ohne Release und Doku dünn)

---

## Critical Pitfalls

Pitfalls, die einen v1-Launch komplett killen oder den Daemon im Endlos-Crash-Loop versenken.

### Pitfall 1: `tell application "Music"` startet Music.app, wenn sie nicht läuft

**What goes wrong:**
Sobald der AppleScript-Fallback feuert und Music.app gerade nicht läuft, öffnet `tell application "Music"` die App vollautomatisch. Der User schließt Music.app, der Daemon pollt 10 Sekunden später, Music.app springt geisterhaft wieder auf. Single-User-Tool wird zum Poltergeist.

**Why it happens:**
AppleScript-Standardverhalten: jeder `tell application "<Name>"`-Block triggert einen Launch der Ziel-App, falls sie nicht läuft. Das ist seit klassischem Mac OS so dokumentiert. Entwickler vergessen es regelmäßig, weil es im Glücksfall-Test nie auftritt (man hat Music.app eh offen).

**How to avoid:**
**Erst per `System Events` prüfen, dann erst Music.app ansprechen:**

```applescript
tell application "System Events"
    set isRunning to (name of processes) contains "Music"
end tell
if isRunning then
    tell application "Music"
        if player state is playing then ...
    end tell
end if
```

Alternativ: `if application "Music" is running then ...` als Outer-Guard. Beide Patterns vermeiden den ungewollten Launch.

**Warning signs:**
- Music.app öffnet sich wenige Sekunden nach Schließen wieder
- Konsole/log: AppleScript-Fallback feuert öfter als erwartet (sollte selten sein, wenn Last.fm primär)
- User-Beschwerde: "irgendwas started Music ständig"

**Phase to address:**
Phase 2 (AppleScript-Fallback). Pflicht, bevor der Daemon installiert wird.

---

### Pitfall 2: `KeepAlive: true` + Config-Fehler beim Start = Endlos-Crash-Loop

**What goes wrong:**
Daemon liest beim Start `.env`, findet einen Tippfehler (`GATHER_API_KEY` fehlt) oder API-Key ist abgelaufen, wirft Error, exit code != 0. launchd mit `KeepAlive: true` startet sofort wieder. Erneuter Crash. launchd's Throttle (default 10 s) greift, aber: **1 Crash alle 10 s = 8.640 Crashes pro Tag**, jeder schreibt Stack-Trace in die Log-Datei. Logs explodieren, Last.fm-API hämmert vor sich hin (falls der Crash nach dem ersten erfolgreichen Fetch kommt).

**Why it happens:**
- launchd-Default `ThrottleInterval = 10 s` ist nicht abschaltbar nach unten, aber auch nicht aggressiv genug für Config-Loops
- `KeepAlive: true` (statt strukturiertem `{ SuccessfulExit: false }`) restartet **auch** bei `process.exit(0)`
- Entwickler werfen üblicherweise Errors mit `throw` -> exit code 1, der für launchd "wieder starten" bedeutet

**How to avoid:**
Drei zusammengehörige Maßnahmen:

1. **Config-Validation bei Start, exit code 0 bei Config-Fehler:**
   ```typescript
   try {
     const env = EnvSchema.parse(process.env);
   } catch (err) {
     log.fatal({ err }, "Invalid configuration. Daemon will NOT restart.");
     process.exit(0);   // wichtig: 0, nicht 1
   }
   ```

2. **launchd-Plist nutzt `KeepAlive` als Dictionary, nicht `<true/>`:**
   ```xml
   <key>KeepAlive</key>
   <dict>
     <key>SuccessfulExit</key>
     <false/>           <!-- bei exit 0 NICHT restarten -->
     <key>Crashed</key>
     <true/>            <!-- bei Crash schon -->
   </dict>
   <key>ThrottleInterval</key>
   <integer>30</integer>  <!-- 30 s statt 10 s, dämpft Crash-Loops -->
   ```

3. **Kill-Switch dokumentieren:** im README explizit den Befehl, der den Daemon manuell stoppt:
   ```bash
   launchctl bootout gui/$(id -u)/de.lorenz.gatherapplemusicbridge
   ```

**Warning signs:**
- `~/Library/Logs/gather-bridge.err` wächst auf > 10 MB binnen Stunden
- `launchctl print gui/$(id -u)/de.lorenz.gatherapplemusicbridge` zeigt hohen `last exit code` ungleich 0 und kurze Run-Time
- `Activity Monitor` zeigt Node-Prozesse, die in Sekunden auftauchen und verschwinden

**Phase to address:**
Phase 3 (launchd-Integration). Muss vor erstem `bootstrap` korrekt sein, sonst tut man sich beim Debuggen schwer.

---

### Pitfall 3: Last.fm `limit=1` liefert 2 Tracks, wenn `nowplaying` aktiv ist

**What goes wrong:**
Code schreibt `data.recenttracks.track[0]` und nimmt den ersten Track als "now playing". In ~50 % der Fälle ist `track[0]` aber der **letzte gescrobbelte** Track (mit `date`-Feld), und `track[1]` ist der nowplaying-Track. Status zeigt den falschen Song.

**Why it happens:**
Last.fm dokumentiert das so: bei `limit=N` mit aktivem nowplaying liefert die API **N+1 Tracks**, wobei der nowplaying-Track an Position 0 oder 1 stehen kann (Reihenfolge nicht garantiert). Der einzige verlässliche Marker ist `@attr.nowplaying === "true"`.

**How to avoid:**
Filtern nach `@attr.nowplaying`, **nicht** nach Position:

```typescript
const tracks = data.recenttracks.track;
const nowPlaying = tracks.find(t => t["@attr"]?.nowplaying === "true");
if (!nowPlaying) return null;        // gerade nichts läuft
return { artist: nowPlaying.artist["#text"], track: nowPlaying.name };
```

Bonus: Currently-playing-Track hat **kein** `date`-Feld, das kann man als zweite Heuristik nutzen, ist aber redundant.

**Warning signs:**
- Status zeigt einen Song, den man vor 30 Min gehört hat, statt aktuell
- Status wechselt nicht, obwohl in Music.app der Track gewechselt hat
- Test mit Pause: Status bleibt auf altem Song stehen statt zu leeren

**Phase to address:**
Phase 1 (Last.fm-Adapter). Direkter Coding-Fehler, fängt mit erstem Test auf.

---

### Pitfall 4: WebSocket-Polyfill nach Game-Client-Import

**What goes wrong:**
```typescript
import { Game } from "@gathertown/gather-game-client";   // <- lädt sofort
import WS from "isomorphic-ws";
(globalThis as any).WebSocket = WS;                       // <- zu spät
```
Der Game-Client liest `globalThis.WebSocket` zur **Modul-Load-Zeit** (Top-Level-Code im Package). Setzt man den Polyfill danach, ist `WebSocket` zum Connect-Zeitpunkt `undefined` -> `TypeError: WebSocket is not a constructor`. Daemon crasht beim ersten `game.connect()`.

**Why it happens:**
- ESM lädt alle statischen Imports vor jedem Top-Level-Code im aktuellen Modul.
- Imports werden in Reihenfolge ihrer Deklaration evaluiert, aber die **Side-Effects** (inkl. `globalThis.WebSocket =`-Zuweisung) laufen erst nach allen Imports des Moduls.
- Konsequenz: Polyfill und Game-Client gehören in **getrennte Module**, mit explizitem Import-Order.

**How to avoid:**
Polyfill in eine eigene Datei mit Side-Effect, **vor** dem Game-Client importieren:

```typescript
// src/setup-ws.ts (Side-Effect-Modul)
import WS from "isomorphic-ws";
(globalThis as any).WebSocket = WS;

// src/index.ts
import "./setup-ws.js";                                   // <- MUSS erste Zeile sein
import { Game } from "@gathertown/gather-game-client";
```

Im `tsconfig` `"module": "Node16"` und `import` mit `.js`-Extension (Node-ESM-Pflicht).

**Warning signs:**
- Erster Run wirft `ReferenceError: WebSocket is not defined` oder `TypeError: WebSocket is not a constructor`
- Funktioniert in `tsx` Dev, crasht in `node dist/index.js` Prod (oder umgekehrt — beide Pfade testen!)

**Phase to address:**
Phase 1 (Gather-Client-Setup). Erstes Smoke-Test-Kriterium.

---

### Pitfall 5: Gather-API-Key in Logs / `.env` im Commit

**What goes wrong:**
Zwei Varianten:
- **a)** `pino` loggt das geparste env-Objekt zu Debug-Zwecken, der Gather-API-Key landet in Klartext in `~/Library/Logs/gather-bridge.log`. Backup-Tools (Time Machine, Arq, Cloud-Sync) ziehen das mit. Geleakter API-Key kann **alles** im Gather-Space tun (Räume zerstören, Maps ändern, alle User kicken).
- **b)** `.env` mit beiden API-Keys versehentlich committen, weil `.gitignore` erst nachträglich hinzugefügt wurde (oder weil `.env.example` und `.env` versehentlich vertauscht).

**Why it happens:**
- pino-Default ist `level: info`. Wenn jemand spaßeshalber `log.info({ env }, "starting up")` schreibt, ist der Key drin
- `.gitignore` muss **vor erstem Commit** existieren, sonst ist `.env` schon getrackt und ein nachträgliches `.gitignore` ändert nichts (`git rm --cached .env` ist nötig)
- Last.fm-Key ist read-only -> niedriges Risiko. **Gather-Key ist read+write -> kritisches Risiko.**

**How to avoid:**
1. **`.gitignore` als allerersten Commit** mit `.env`, `*.log`, `dist/`, `node_modules/` drin. Vor dem ersten `git add`.
2. **pino mit `redact`** für sensible Keys konfigurieren:
   ```typescript
   const log = pino({
     redact: {
       paths: ["env.GATHER_API_KEY", "env.LASTFM_API_KEY", "*.apiKey", "*.api_key"],
       remove: true,
     },
   });
   ```
3. **Niemals `console.log(process.env)`** für Debug-Zwecke. Stattdessen explizit nur die nicht-geheimen Felder loggen.
4. **Pre-Commit-Check:** `git ls-files | grep -E '\.env$'` muss leer sein. Alternativ: `gitleaks` lokal vor erstem Push.
5. **Schon committet?** `git filter-repo` (oder `bfg`) und Key bei Gather **sofort rotieren** (`https://app.gather.town/apikeys` -> alten Key löschen).

**Warning signs:**
- `git log -p -- .env` zeigt Inhalt -> Key ist im Repo, auch wenn aktuelle Version nicht mehr da
- Log-Datei mit `grep -i 'api[_-]?key' ~/Library/Logs/gather-bridge.log` liefert Matches
- Repo ist auf GitHub/GitLab und `.env` taucht in der Datei-Liste auf

**Phase to address:**
Phase 0 (Repo-Init), Pre-First-Commit. Plus Phase 4 (Logging) für die `redact`-Konfiguration.

---

### Pitfall 6: launchd findet `node` nicht (Path-Problem)

**What goes wrong:**
Plist enthält `<string>node</string>` als erstes ProgramArgument oder einen Pfad wie `~/.nvm/versions/node/v22.12.0/bin/node`. launchd startet **bevor** Login-Shell-Profile gelesen sind, kennt also weder `nvm`-Shims noch User-`PATH`. Service exited mit `EX_CONFIG (78)`, in `~/Library/Logs/gather-bridge.err` steht "command not found" oder Plist-Validation-Error. Daemon läuft nie an. Throttle-Loop mit 10 s.

**Why it happens:**
- launchd resolved `ProgramArguments[0]` **vor** den `EnvironmentVariables` aus dem Plist, selbst wenn `PATH` im Plist gesetzt ist, hilft das nicht.
- `nvm`-Pfade sind versionsspezifisch: nach `nvm install 22.13` zeigt `which node` auf einen anderen Pfad, alter Plist-Pfad bricht.
- macOS-Standard-Node-Pfad ist nicht stabil: Homebrew Apple Silicon = `/opt/homebrew/bin/node`, Intel = `/usr/local/bin/node`, nvm = irgendwo unter `~/.nvm/`.

**How to avoid:**
1. **Install-Script bestimmt `node`-Pfad zur Install-Zeit über `execFile`** (nicht Shell-Interpolation):
   ```typescript
   import { execFileSync } from "node:child_process";
   const nodePath = execFileSync("/usr/bin/env", ["node", "-e", "console.log(process.execPath)"], { encoding: "utf8" }).trim();
   // oder: process.execPath direkt im Install-Script (läuft ja selbst mit dem gewünschten Node)
   // diesen Pfad in die Plist schreiben
   ```
   Einfachste Variante: `process.execPath` im Install-Script (TS unter `tsx` oder `node`) zeigt schon auf das richtige Node-Binary.
2. **Bei nvm-Nutzern: in den stable-Pfad symlinken oder System-Node empfehlen.** README-Warnung: "Wenn du nvm nutzt, breaked ein `nvm install`/`nvm alias default` ggf. den Daemon. Dann `npm run install-daemon` neu laufen lassen."
3. **Test-Schritt im Install-Script:** vor `bootstrap` eine `node --version`-Probe mit dem ermittelten Pfad ausführen, abbrechen wenn das fehlschlägt.

**Warning signs:**
- `launchctl print gui/$(id -u)/de.lorenz.gatherapplemusicbridge` zeigt `last exit code = 78`
- `~/Library/Logs/gather-bridge.err` enthält "No such file or directory" oder Plist-Parse-Errors
- Daemon lief gestern, läuft heute nach `nvm use 24` nicht mehr

**Phase to address:**
Phase 3 (launchd-Integration / Install-Script). Pflicht, sonst Daemon installiert sich erfolgreich, läuft aber nie.

---

## Moderate Pitfalls

Pitfalls, die nicht den Launch killen, aber den Daemon nach Tagen/Wochen unzuverlässig machen.

### Pitfall 7: AppleScript-Automation-Permission-Prompt blockiert Daemon

**What goes wrong:**
Erster AppleScript-Aufruf gegen Music.app von einem neuen Binary aus löst macOS-TCC-Prompt aus: *"Bridge möchte Music kontrollieren — Erlauben/Nicht erlauben?"*. Wenn der Daemon zu diesem Zeitpunkt im Hintergrund unter launchd läuft (kein UI-Kontext), kann der Prompt im Worst Case **gar nicht angezeigt werden** oder wird übersehen. AppleScript-Aufruf timeoutet/wirft `errAEEventNotPermitted` (errno -1743). Fallback funktioniert nie.

**Why it happens:**
- macOS Mojave (10.14) und neuer: jede App, die AppleEvents an eine andere App sendet, braucht TCC-Genehmigung pro Quell-Ziel-Paar.
- Der "Source"-Identifier ist hier `node` (oder besser: das Binary, das `node` startet, das kann `launchd` sein!), Permission wird auf `node` gespeichert, nicht auf den Daemon-Code.
- Auf macOS Sonoma/Sequoia (14/15) wurden TCC-Prompts strenger; Background-Prozesse zeigen sie nicht mehr zuverlässig.
- Bei Node-Updates (`nvm install`) wechselt das Binary -> alte Permission gilt nicht mehr.

**How to avoid:**
1. **Erst-Aktivierung im Vordergrund:** `npm run install-daemon` triggert nach Install **manuell** einmal `osascript -e 'tell application "Music" to player state'` aus der User-Shell. Das fragt den Permission-Prompt im Vordergrund an, User klickt "OK". Permission ist dann dauerhaft gesetzt.
2. **Im Daemon: AppleScript-Errors mit `-1743` als Permission-Fehler erkennen** und in Logs explizit "Open System Settings -> Privacy -> Automation -> Node -> Music" schreiben, statt nur stumm zu failen.
3. **Im README dokumentieren**, dass Permission **einmalig** akzeptiert werden muss und bei Node-Versions-Wechsel neu erteilt werden muss.
4. **Permission zurücksetzen** für Debugging: `tccutil reset AppleEvents` (kompletter Reset, nimmt aber alle anderen Apps mit).

**Warning signs:**
- AppleScript-Fallback liefert konstant `null`, obwohl Music.app spielt
- Log: `osascript: 1:1: execution error: Not authorized to send Apple events to Music. (-1743)`
- System Settings -> Privacy -> Automation: "Node" oder "Bridge" fehlt in der Liste

**Phase to address:**
Phase 2 (AppleScript-Fallback) + Phase 3 (Install-Script muss Permission triggern).

---

### Pitfall 8: Gather-Client trennt nach längerer Inaktivität, Daemon hängt

**What goes wrong:**
WebSocket-Verbindungen sterben oft nach Idle-Phasen (typisch nach 30 s bei Carrier-NAT, 60 s bei AWS ALB, ungewiss bei Gather). Wenn die Bridge nichts sendet, weil keine Track-Änderung anliegt, erkennt der Daemon u. U. nicht, dass die Verbindung tot ist. Alle Status-Updates der nächsten Stunde gehen ins Leere. Gather zeigt den letzten gesetzten Status weiter (oder nichts), der User merkt nichts.

**Why it happens:**
- Der `gather-game-client@43` ist 2 Jahre alt, hat eingebaute Reconnect-Logik (laut Engine-Doku exponential backoff + heartbeat), aber sie ist nicht garantiert robust gegen alle TCP-Halbtot-Szenarien (RST-Pakete, Sleep/Wake auf macOS, NAT-Rebinding).
- `subscribeToConnection(connected => ...)` feuert bei sauberem Close, **nicht** bei stillem TCP-Tod.

**How to avoid:**
1. **`subscribeToConnection`-Callback nutzen:** auf `connected === false` reagieren, eigenen Reconnect/Re-Init-Pfad triggern. Status-Cache invalidieren, damit beim Reconnect der aktuelle Track neu gesendet wird (sonst denkt unser Diff-Code "kein Wechsel" und schickt nichts).
2. **App-Layer-Heartbeat:** alle 60 s **immer** `setTextStatus` mit dem aktuellen Status erneut senden (idempotent). Hält die Verbindung wach UND repariert "stale Status" nach Reconnect automatisch.
3. **Watchdog:** wenn keine erfolgreiche `sendAction`-Antwort innerhalb von 30 s nach Versuch -> Reconnect erzwingen (`game.disconnect()` + neue `Game()`-Instanz).
4. **macOS Sleep/Wake-Handling:** Node-Timer auf macOS feuern nach Wake teilweise verspätet (libuv + `mach_absolute_time`-Issue). Reconnect-Logik darf **nicht** auf Timer-Genauigkeit vertrauen.

**Warning signs:**
- Daemon läuft seit Stunden, Status in Gather hängt fest auf altem Song
- Log: keine "connected: false"-Events, aber auch keine erfolgreichen Status-Updates mehr
- `lsof -p <pid> | grep gather` zeigt geschlossene/verwaiste Sockets

**Phase to address:**
Phase 1 (Gather-Client) + Phase 4 (Robustheit/Heartbeat).

---

### Pitfall 9: Polling-Interval kürzer/länger als Track -> Skip oder Doppel-Ping

**What goes wrong:**
- **a) Sehr kurze Tracks (< 10 s, Skits, Intro/Outro):** Track läuft, ist beim nächsten 10 s-Poll schon vorbei. Bridge zeigt diesen Track nie an.
- **b) Track-Repeat / Replay:** User skipped zurück und hört denselben Song nochmal. NepTunes scrobbelt erst nach 50 % der Spielzeit -> Last.fm `nowplaying` hat eventuell für 2-3 Min identische Daten. Diff-Code "kein Wechsel" -> kein Re-Setzen des Status (wäre ok, fühlt sich aber "stuck" an, wenn der Status davor wegen Pause leer war).
- **c) NepTunes-Lag:** zwischen "Track wechselt in Music.app" und "neuer nowplaying-Eintrag bei Last.fm" liegen 5-15 s. Bridge zeigt also kurz noch den vorigen Song.

**Why it happens:**
- 10 s Polling ist ein Kompromiss; jede schnellere Frequenz nähert sich dem Last.fm-Rate-Limit (5/s pro IP), auch wenn weit drunter, ist es Verschwendung.
- NepTunes nutzt Last.fm's "nowplaying"-API mit eigenem Throttling (typisch 5-10 s nach Track-Start)
- Diff-State des Daemons unterscheidet (Artist + Track), bei Repeat ändert sich nichts.

**How to avoid:**
1. **Akzeptiere die 5-15 s Latenz**, das ist nicht behebbar ohne andere Datenquelle (AppleScript-Fallback wäre schneller, aber an Music.app nur lokal).
2. **Diff auf (Artist + Track + Status), nicht nur (Artist + Track):** dann triggert "war Pause, jetzt wieder Play" eine Status-Setzung, auch wenn der Track gleich ist.
3. **Sehr kurze Tracks akzeptieren als nicht angezeigt**, Trade-off, der für ein Single-User-Statustool ok ist.
4. **AppleScript-Fallback aggressiver nutzen, wenn Last.fm nichts liefert:** wenn Last.fm `nowplaying = null`, sofort AppleScript probieren, Music.app weiß sofort, was läuft.

**Warning signs:**
- Status zeigt 5-15 s lang den falschen Song nach Wechsel
- Gleicher Track auf Repeat -> Status wird nie aktualisiert
- 10-Sekunden-Songs (z. B. Album-Skits) erscheinen nie

**Phase to address:**
Phase 2 (Polling-Loop + Diff-Logik).

---

### Pitfall 10: AppleScript liefert kein Now-Playing, wenn Music.app paused

**What goes wrong:**
User pausiert Apple Music. Bridge soll den Status leeren. AppleScript-Fallback prüft `if player state is playing`. Bei `paused`/`stopped`/`fast forwarding` wird nichts zurückgegeben, der Daemon setzt den Status korrekt auf leer. **Aber:** Last.fm-Pfad gibt **weiterhin** den letzten `nowplaying`-Eintrag zurück, weil NepTunes "nowplaying" nicht aktiv löscht, das verfällt nach 10 Min Inaktivität bei Last.fm.

Konsequenz: Bridge zeigt 10 Min lang einen Song an, der gar nicht mehr läuft. User kommt zurück, Kollegen denken, er hört seit 10 Min `Tom Misch — Disco Yes`, dabei pausiert er.

**Why it happens:**
- NepTunes kann (per Default oder gar nicht) den `nowplaying=true`-Status auf Last.fm explizit canceln. Last.fm verfällt es nach Timeout selbst.
- PROJECT.md sagt: "Status leeren bei Pause statt stale stehen lassen". Das geht aber **nur** über AppleScript, nicht über Last.fm.

**How to avoid:**
**AppleScript ist nicht nur "Fallback wenn Last.fm down", er ist Wahrheits-Quelle für "spielt überhaupt was".**

```typescript
async function getNowPlaying() {
  const musicAppState = await getMusicAppState();    // AppleScript
  if (musicAppState === "not-running") return null;  // Status leeren
  if (musicAppState === "paused")      return null;  // Status leeren
  // Music.app spielt -> jetzt erst Last.fm fragen, hat oft bessere Metadaten
  const fromLastfm = await fetchNowPlaying();
  if (fromLastfm) return fromLastfm;
  // Last.fm hat noch nichts -> AppleScript-Daten nehmen
  return await getCurrentTrackFromMusicApp();
}
```

Diese Reihenfolge: AppleScript ist **Authority für Play/Pause/Stop**, Last.fm liefert **Metadaten** (oft sauberer als Music.app, besonders bei lokalen Files).

**Trade-off:** AppleScript-Aufruf bei jedem 10s-Poll. Das ist ok (osascript ist billig, ~50 ms), aber dokumentieren.

**Warning signs:**
- Status zeigt nach Pause noch ~10 Min lang den letzten Track
- Test-Szenario: Music.app pausieren, 30 s warten, Status sollte leer sein, ist aber gefüllt

**Phase to address:**
Phase 2 (Polling-Loop), Reihenfolge AppleScript-vor-Last.fm muss explizit sein.

---

### Pitfall 11: pino loggt nach stdout, launchd wartet auf stderr

**What goes wrong:**
pino-Default-Destination ist **stdout**, nicht stderr. Wenn Plist `<key>StandardErrorPath</key>` für die Error-Logdatei konfiguriert hat, kommen pino-Errors in `gather-bridge.log` (stdout) statt `gather-bridge.err`. Beim Debuggen sucht man Fehler in der falschen Datei und denkt "der Daemon loggt nichts".

**Why it happens:**
pino nutzt `process.stdout.write` per Default. Das ist eine sinnvolle Konvention für Container/12-Factor, aber für launchd-Setup muss man wissen, welcher Stream wohin geht.

**How to avoid:**
Zwei Optionen:

**a) Eine Log-Datei für alles** (einfachst):
```xml
<key>StandardOutPath</key>  <string>~/Library/Logs/gather-bridge.log</string>
<key>StandardErrorPath</key> <string>~/Library/Logs/gather-bridge.log</string>
```

**b) pino auf stderr umlenken:**
```typescript
const log = pino(pino.destination(2));  // 2 = stderr fd
```

Empfehlung: **Option a)** für ein Single-User-Tool. Saubere Trennung lohnt nur, wenn man Errors per `tail -f *.err` separat überwacht, bei einem Daemon ohne SLAs Overkill.

**Warning signs:**
- `gather-bridge.err` ist leer, aber Daemon zeigt offensichtlich Probleme
- Beim Debuggen findet man Logs nur in der "falschen" Datei

**Phase to address:**
Phase 4 (Logging).

---

### Pitfall 12: Log-Datei wächst unbegrenzt

**What goes wrong:**
launchd appended an `StandardOutPath`/`StandardErrorPath` für immer. Bei 10s-Polling und `level: debug` schreibt pino ~600 Zeilen/h = ~14k/Tag. Nach 6 Monaten ist die Log-Datei mehrere hundert MB groß. Time Machine pinned alle Versionen, Disk wächst.

**Why it happens:**
launchd hat **kein eingebautes Log-Rotation-System**. macOS' `newsyslog` rotiert zwar `/var/log/*`, aber **nicht** Files in `~/Library/Logs/`, es sei denn man legt eine Konfig-Datei an. Und selbst dann: rotiert `newsyslog` als root, neue Datei gehört root:wheel, der User-Daemon kann nicht mehr reinschreiben.

**How to avoid:**
**Option a) pino's eigenes File-Transport mit Rotation** statt launchd-File-Redirection:
```typescript
const log = pino(pino.transport({
  target: "pino/file",
  options: { destination: "~/Library/Logs/gather-bridge.log", mkdir: true },
}));
// + manuelles Rotate-Pattern: vor jedem Run prüfen, ob Datei > 10 MB, dann rename
```

**Option b)** Periodisches Cleanup-Script via separatem launchd-Job (`StartCalendarInterval`, einmal pro Woche), das logs > 30 Tage löscht / komprimiert.

**Option c) Pragma:** für Single-User-Tool reicht `level: info` (kein debug-spam) + manuelles `rm` alle paar Monate. README-Hinweis genügt.

**Empfehlung:** Option c) für v1, Option a) für v2.

**Warning signs:**
- `du -h ~/Library/Logs/gather-bridge.log` zeigt > 100 MB
- Disk Inspector zeigt das File als großen Verbraucher

**Phase to address:**
Phase 4 (Logging) + Roadmap-Entscheidung "v2: Log-Rotation".

---

### Pitfall 13: NepTunes-Upgrade bricht Scrobbling silent

**What goes wrong:**
NepTunes bekommt ein Update (oder wird durch macOS-Update neu gestartet/quarantänisiert), die Last.fm-Authentifizierung in NepTunes geht verloren oder ein Permission-Bug verhindert das Auslesen von Music.app. Last.fm bekommt keine Daten mehr -> Bridge fällt **stumm** auf AppleScript zurück. User bemerkt es nicht (Status bleibt korrekt, dank Fallback). Stattdessen leidet die langfristige Last.fm-History, irrelevant für die Bridge, aber ärgerlich.

**Why it happens:**
- NepTunes ist Drittsoftware, ihre Auth-Persistenz im Keychain kann durch macOS-Updates brechen.
- Bridge hat keinen "ist NepTunes überhaupt am scrobbeln?"-Healthcheck.

**How to avoid:**
- **Akzeptieren als Feature**: AppleScript ist robuster, macht ja den Job. Bridge muss nicht wissen, ob NepTunes läuft.
- **Optionaler Healthcheck (v2):** wenn AppleScript Track A meldet, Last.fm aber Track B (oder nichts) -> NepTunes hängt. Log-Warnung. Nicht kritisch genug für v1.
- **README-Hinweis:** "Wenn Last.fm-Stats nicht aktualisiert werden, NepTunes neu einloggen." Bridge selbst läuft weiter.

**Warning signs:**
- Daemon-Logs zeigen ungewöhnlich oft "Last.fm: no nowplaying" und gleichzeitig AppleScript-Fallback liefert Daten
- Last.fm-Profil hat keine neuen Scrobbles seit X Tagen, obwohl gehört wurde

**Phase to address:**
Phase 2 (Fallback-Logik), Verhalten ist by design correct, kein Code-Change nötig. Phase 5+ wenn überhaupt für Healthcheck.

---

### Pitfall 14: Sleep/Wake macht Polling-Timer ungenau

**What goes wrong:**
MacBook geht in den Standby. `setInterval(poll, 10_000)` ist angehalten. Bei Wake kann Node-Timer auf macOS **verspätet** feuern (bis zu 60 s, je nach Sleep-Dauer und libuv-Version). Status zeigt sich nach Wake erst nach > 60 s, nicht direkt. User wundert sich.

Schlimmer: Bei sehr langen Sleeps (Laptop über Nacht zu) kann der erste Wake-Poll auf eine geschlossene Gather-WebSocket treffen, Reconnect-Logik (Pitfall 8) muss greifen.

**Why it happens:**
- libuv (Node's Timer-Backend) nutzt auf macOS `mach_absolute_time()`, das suspend/resume historisch unterschiedlich behandelt hat.
- Es gibt keinen offiziellen `wake`-Event in Node ohne Drittpaket.

**How to avoid:**
1. **Polling auf Drift-Korrektur umstellen:** statt fixem `setInterval` rekursives `setTimeout` mit Wall-Clock-Check:
   ```typescript
   async function loop() {
     const start = Date.now();
     await poll();
     const elapsed = Date.now() - start;
     setTimeout(loop, Math.max(0, 10_000 - elapsed));
   }
   ```
2. **Erste Aktion nach langer Inaktivität: WebSocket-Health prüfen** (z. B. einen Ping senden oder `subscribeToConnection`-State checken). Falls dead: Reconnect.
3. **Trade-off akzeptieren:** für ein 10 s-Polling ist eine Verspätung von 10-30 s nach Wake okay. Hartes "muss in 1s nach Wake reagieren" wäre Overkill.

**Warning signs:**
- Nach Lid-Open: Status hängt 30-60 s auf altem Track
- Gather-Verbindung nach Wake "connected: false" -> Reconnect-Logs

**Phase to address:**
Phase 4 (Robustheit / Polling-Loop).

---

### Pitfall 15: AppleScript-Output mit Unicode/Sonderzeichen falsch geparst

**What goes wrong:**
AppleScript-Script liefert `<artist> ||| <track>` zurück. Wenn ein Track-Name selbst `|||` enthält (selten, aber: K-Pop, experimentelle Bands, Emoji-Songtitel), bricht der `split(" ||| ")`-Parser. Schlimmer: Tracks mit `"` oder Backslash im Titel können das AppleScript selbst zerschießen.

**Why it happens:**
- AppleScript-Strings müssen `"` als `\"` und `\` als `\\` escapen, wenn der Track-Name Quotes enthält und das in einer komplexen Konkatenation landet, kann das Script syntaktisch brechen.
- Inline-AppleScript (wie in `run-applescript`-Beispielen) ist anfällig dafür; Music.app gibt aber im Output korrekte Strings zurück, das ist nicht das Problem.
- Emoji im Track-Namen funktioniert in macOS 10.5+ generell, kann aber bei `osascript -e` über Shell-Quoting zerlegt werden (eher theoretisch).

**How to avoid:**
1. **Separator wählen, der in Track-Namen praktisch nie vorkommt:** Tab (`\t`) oder ASCII-Unit-Separator (U+001F) statt `|||`.
2. **AppleScript in eigene `.applescript`-Datei** auslagern statt inline. Reduziert Escaping-Risiko, weil keine Shell-/JS-String-Konkatenation involviert.
3. **Robustes Parsing:** `output.indexOf(SEPARATOR)` statt `split`, nimmt nur den ersten Separator, der Rest ist Track-Name.
4. **Trim auf `output`** und auf `null/empty` checken.

**Warning signs:**
- Bestimmte Tracks zeigen "undefined" als Artist oder Track im Status
- Log: "split returned 1 element" statt 2

**Phase to address:**
Phase 2 (AppleScript-Fallback).

---

### Pitfall 16: Gather-Status hat Längen-Limit und akzeptiert nicht alle Zeichen

**What goes wrong:**
Sehr lange Track-Namen (Klassik-Sätze, Live-Aufnahmen mit "Live at the Royal Albert Hall (Remastered Bonus Track) [feat. Guest Artist]") überschreiten Gather's interne Status-Längengrenze und werden abgeschnitten, oder die `sendAction` wirft. Emoji am Anfang (`♫`) zählt als 1+ char je nach Encoding. Worst case: WebSocket-Frame gerejectet, Status nicht gesetzt, Daemon merkt nichts.

**Why it happens:**
- Gather dokumentiert Status-Limits nicht öffentlich. Erfahrungswerte aus mod-spotify-as-status: ~80-100 Zeichen sind unproblematisch.
- protobuf-Felder können theoretisch alle UTF-8, aber Gather's Server-Side-Validierung kann strikter sein.

**How to avoid:**
1. **Soft-Cap:** Track + Artist auf z. B. 80 Zeichen abkürzen, mit `…` am Ende. Format: `♫ Artist – Track…`.
2. **Defensiv kürzen:**
   ```typescript
   const status = `${artist} – ${track}`;
   const truncated = status.length > 80 ? status.slice(0, 79) + "…" : status;
   ```
3. **Fehler von `sendAction` einfangen, nicht ignorieren**, bei Reject nur Warnen, nicht Daemon-Crash.

**Warning signs:**
- Gather-Status leer/abgeschnitten bei Klassik-Tracks
- Log: protobuf-validation-Errors

**Phase to address:**
Phase 1 (Gather-Integration).

---

### Pitfall 17: Unhandled Promise Rejection killt den Daemon stumm

**What goes wrong:**
Eine async-Funktion (z. B. `fetchNowPlaying`) wirft, der Caller hat keinen `.catch()` und der `await` ist außerhalb eines try/catch. Node 15+ defaultet auf "terminate process". Daemon stirbt mit Exit Code 1, launchd restartet (Pitfall 2 lässt grüßen), und ohne Pino-`fatal`-Hook ist der eigentliche Fehler nicht in den Logs.

**Why it happens:**
- Async-Code ist verführerisch: jedes vergessene `try/catch` bei Top-Level `await poll()` kann den Prozess killen.
- pino schreibt asynchron, bei sofortigem `process.exit` gehen die letzten Log-Zeilen verloren.

**How to avoid:**
```typescript
process.on("unhandledRejection", (err) => {
  pino.final(log).fatal({ err }, "unhandledRejection");
  process.exit(1);   // 1, weil das ein Bug ist; launchd restartet (siehe Pitfall 2)
});
process.on("uncaughtException", (err) => {
  pino.final(log).fatal({ err }, "uncaughtException");
  process.exit(1);
});
```

`pino.final()` macht den Log-Write synchron, sodass die letzte Fehlermeldung garantiert auf Disk landet.

**Warning signs:**
- Daemon-Logs hören mitten im Polling auf, kein Stack-Trace, kein "shutdown"
- launchd zeigt sporadische Restarts ohne ersichtlichen Grund

**Phase to address:**
Phase 4 (Robustheit). Pflicht-Pattern für jeden langlaufenden Node-Daemon.

---

## Minor Pitfalls

Pitfalls, die unschön sind, aber den Use-Case nicht ernsthaft kaputtmachen.

### Pitfall 18: `npm audit` schreit wegen alter axios/protobufjs in gather-game-client

**What goes wrong:**
`@gathertown/gather-game-client@43` zieht `axios@~0.26.0` und `protobufjs` (mit historisch CVE-2023-36665 Prototype-Pollution). `npm audit` zeigt 2-5 High/Critical-Findings, jeder neue Install warnt. Im Single-User-Tool ohne User-Inputs ist das praktisch ungefährlich, sieht aber nach Verlassen aus.

**Why it happens:**
gather-game-client wird seit 2 Jahren nicht mehr released; die Maintainer pinnen alte Deps.

**How to avoid:**
- **Akzeptieren** für lokales Single-User-Tool. Risiko-Profil: Last.fm und Gather sind die einzigen URLs, die der Daemon kontaktiert, keine User-Inputs in URLs/Bodies, kein Server-Mode.
- **Im README dokumentieren**, warum die Audit-Warnings ignoriert werden.
- Optional: `npm audit --omit=dev` reduziert Lärm.

**Phase to address:**
Phase 0 (Setup).

### Pitfall 19: dist/ vs src/ unter launchd: tsx vs node

**What goes wrong:**
Im Plist steht `node dist/index.js`. Build-Output veraltet, weil `npm run build` nach Code-Änderung vergessen wurde. Daemon startet alte Code-Version. Verwirrt beim Debuggen.

**How to avoid:**
- `npm run install-daemon` führt **immer** `npm run build` zuerst aus.
- Im README: "nach Code-Änderung: `npm run build && launchctl kickstart gui/$(id -u)/de.lorenz.gatherapplemusicbridge`"
- Optional: dev-Modus mit `tsx` direkt im Plist (`/usr/local/bin/npx tsx /path/to/src/index.ts`), funktioniert, ist aber langsam beim Start.

**Phase to address:**
Phase 3 (Install-Script).

### Pitfall 20: `.env` mit dotenv@17 im build/dist nicht gefunden

**What goes wrong:**
`dotenv` lädt aus `process.cwd()`. Unter launchd ist `cwd` per Default `/`, nicht das Projekt-Verzeichnis. dotenv findet `.env` nicht, ENV-Vars sind leer, Daemon crasht beim Config-Validieren (siehe Pitfall 2).

**How to avoid:**
- **Plist setzt `WorkingDirectory`** explizit:
  ```xml
  <key>WorkingDirectory</key>
  <string>/Users/plorenz/.../gatherAppleMusicBridge</string>
  ```
- **Oder:** `dotenv.config({ path: path.join(import.meta.dirname, "../.env") })` mit absolutem Pfad relativ zum Code.

**Phase to address:**
Phase 3 (launchd-Plist).

### Pitfall 21: TypeScript ESM-Imports brauchen `.js`-Endung

**What goes wrong:**
`import { foo } from "./bar"` funktioniert in `tsx`-Dev (esbuild ist tolerant), wirft `ERR_MODULE_NOT_FOUND` in `node dist/index.js` Prod (Node-ESM ist strikt: braucht `.js`).

**How to avoid:**
- Alle relativen Imports mit `.js`-Endung: `import { foo } from "./bar.js"` (auch wenn Source `.ts` ist, TS resolved das richtig, Node nutzt das emittierte `.js`).
- `tsconfig.json` mit `"module": "Node16"` und `"moduleResolution": "Node16"` aktiviert die ESM-Strenge schon im Type-Check.

**Phase to address:**
Phase 0 (TS-Setup).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `console.log` statt pino | Spart 5 min Setup | Keine Log-Levels, keine strukturierten Logs, schwer zu filtern wenn der Daemon eine Woche durchläuft | Niemals, pino-Setup ist 3 Zeilen |
| `KeepAlive: true` (statt `{ SuccessfulExit: false }`) | Plist 2 Zeilen kürzer | Endlos-Restart-Loop bei Config-Fehlern, Logs explodieren | Nur wenn Config-Validation `process.exit(0)` zwingend ist und im Code mit Tests abgedeckt ist |
| Inline-AppleScript per `run-applescript` | Eine Datei weniger im Repo | Escaping-Hölle bei wachsendem Script | Ok für 5-Zeilen-Scripts (wie hier). Ab ~15 Zeilen: separate `.applescript`-Datei |
| `node` ohne absoluten Pfad im Plist | Manuelle nvm-Path-Erkennung gespart | Daemon stirbt nach `nvm install`, nach Homebrew-Update, nach jedem Pfad-Wechsel | Nie produktiv, Install-Script soll absoluten Pfad setzen |
| Diff nur auf `(artist + track)` | Vermeidet redundante Sends | Pause/Play-Resume mit gleichem Track triggert kein Status-Update | Nur wenn AppleScript-Authority Pause/Stop/Play korrekt handlet |
| Last.fm-`track[0]` statt `find(@attr.nowplaying)` | 1 Zeile kürzer | Falscher Song wird angezeigt, ~50 % der Fälle | Niemals |
| Pino mit Default-Destination (stdout) | Default | Logs landen in der "falschen" Datei für Debugging | Wenn StandardOut/StandardErr auf dieselbe Datei zeigen, dann egal |
| Gather-Status ohne Längen-Cap | Kürzerer Code | Lange Tracks crashen oder werden abgeschnitten | Niemals, Cap ist 3 Zeilen |
| `.env` ohne `.gitignore`-First | Schneller Start | Geleakter Gather-Key kann den Space zerstören | Niemals |
| `setInterval` statt `setTimeout`-Recursion | Ein Wort weniger | Drift nach macOS-Sleep, mögliche Überlappung wenn `poll()` länger als 10 s dauert | Wenn Polling rein zeitkritisch und Operation garantiert < Intervall ist |
| Kein `unhandledRejection`-Handler | "Funktioniert ja" | Stiller Daemon-Tod, kein Stack-Trace | Niemals in einem Daemon |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Last.fm `getRecentTracks`** | `track[0]` als nowplaying nehmen | `track.find(t => t["@attr"]?.nowplaying === "true")` |
| **Last.fm Rate-Limit** | Annahme "5/s pro IP heißt 5/s pro Account" | Es ist 5/s pro IP, gemittelt über 5 min. 10s-Polling = 0,1/s, sehr safe. Aber bei mehreren Tools auf derselben IP (Browser + Bridge + Backup-Tool) addiert sich das. |
| **Last.fm Currently Playing** | `date`-Feld immer erwarten | Currently-playing-Track hat **kein** `date`-Feld |
| **Last.fm Error Code 29** | Bei 429-artigem Fehler sofort retry | Exponential Backoff, Retry-After-Header beachten, eigenes Throttling im Daemon |
| **Gather WebSocket-Polyfill** | Polyfill nach Game-Client-Import setzen | Polyfill in eigenes Side-Effect-Modul, **vor** Game-Client importieren |
| **Gather Status setzen** | `setStatus` (existiert nicht) | `setEmojiStatus` + `setTextStatus` als getrennte Actions |
| **Gather Reconnect** | Auf Library's Auto-Reconnect blind vertrauen | `subscribeToConnection`-Callback nutzen, App-Layer-Heartbeat alle 60 s |
| **Gather Disconnect** | `game.disconnect()` und sofort neuen `Game()` instanziieren | Polyfill-Setup nicht erneut durchlaufen, aber Game-Instance wegwerfen und neu bauen |
| **Music.app AppleScript** | `tell application "Music"` ohne Running-Check | `if application "Music" is running then tell ...` |
| **Music.app TCC-Permission** | Erwarten, dass Permission-Prompt im Hintergrund kommt | Im Install-Script einmalig im Vordergrund triggern |
| **launchd Plist** | `node` als ProgramArguments[0] | Absoluter Pfad aus `process.execPath` zur Install-Zeit |
| **launchd KeepAlive** | `<true/>` für simple Lösung | `<dict><key>SuccessfulExit</key><false/></dict>` für config-error-Schutz |
| **launchd `cwd`** | Annahme "läuft im Projekt-Verzeichnis" | Per `<key>WorkingDirectory</key>` explizit setzen |
| **launchd Throttle** | Default = 10s reicht | `ThrottleInterval = 30` für sanftere Crash-Loops, plus Config-exit(0) |
| **NepTunes** | Bridge prüft "läuft NepTunes?" | Egal, Last.fm-Pfad failed soft, AppleScript fängt auf |
| **dotenv unter launchd** | `.env` aus aktuellem Verzeichnis erwarten | `dotenv.config({ path: <absolut> })` oder `WorkingDirectory` setzen |

## Performance Traps

Da das Tool Single-User ist, sind die meisten klassischen Performance-Probleme egal. Diese Traps treffen aber zu:

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Memory-Leak via setInterval-Closure** | Node-Prozess wächst von ~40 MB auf > 200 MB nach Tagen | `clearInterval` bei Shutdown; keine großen Objekte in Closure capturen; recursive `setTimeout` ist auch leak-anfälliger als gedacht (siehe pocoo.org-Artikel) | Nach Wochen/Monaten Laufzeit ohne Restart |
| **Log-File explodiert** | Disk-Usage in `~/Library/Logs/` > 100 MB | `level: info` (nicht `debug`), periodisches Cleanup, oder pino-Rotation | Nach Monaten ohne Manual-Cleanup |
| **Last.fm-Hammering bei Crash-Loop** | Bridge crasht alle 11 s, macht zwischen Crashes je einen Last.fm-Call -> 5-6 Calls/Min, kein Rate-Limit-Hit aber unnötig | Pitfall 2 fixen | Bei jedem Config-Error-Loop |
| **fetch keep-alive nicht aktiviert** | Jeder Last.fm-Call macht TLS-Handshake (~150 ms) | Native fetch in Node 22 nutzt undici mit Keep-Alive **per Default**. Nicht zerstören durch eigene Agent-Konfiguration | Wenn jemand "performance-tuning" mit eigenem `Agent` macht und Keep-Alive abschaltet |
| **Doppel-Polling bei Overlap** | Wenn ein Last.fm-Call > 10 s braucht, läuft `setInterval` parallel los, zwei in-flight Requests | `setTimeout`-Recursion mit Drift-Korrektur statt `setInterval`. Plus `AbortSignal.timeout(5000)` damit Calls in 5 s aufgeben. | Bei Last.fm-Outage mit langsamen Antworten |
| **AppleScript-Fork pro Poll** | `osascript`-Subprocess-Spawn bei jedem 10s-Poll = ~50ms Overhead | Akzeptieren, Music.app-only ist die Wahrheit für Pause/Stop. Cache wäre Komplexität ohne Gewinn. | Nicht relevant für 10s-Polling |

## Sources

- [Last.fm Support: getRecentTracks - The most recent track will not include a date field if it is currently playing](https://support.last.fm/t/user-getrecenttracks-the-most-recent-track-will-not-include-a-date-field-if-it-is-currently-playing/115900) [HIGH]
- [Last.fm API Terms of Service (Rate Limits)](https://www.last.fm/api/tos) [HIGH]
- [Last.fm API Error Codes (incl. Code 29 Rate Limit Exceeded)](https://www.last.fm/api/errorcodes) [HIGH]
- [unofficial Last.fm API docs: getRecentTracks](https://lastfm-docs.github.io/api-docs/user/getRecentTracks/) [MEDIUM]
- [Last.fm API issue: getRecentTracks no longer returning now playing track (inflatablefriends/lastfm#78)](https://github.com/inflatablefriends/lastfm/issues/78) [HIGH]
- [Apple Dev Forums: launchd keeps restarting my helper](https://developer.apple.com/forums/thread/22824) [HIGH]
- [launchd.info: A launchd Tutorial, KeepAlive, ThrottleInterval](https://www.launchd.info/) [HIGH]
- [GitHub: launchd-keepalive examples](https://github.com/tjluoma/launchd-keepalive) [HIGH]
- [Apple Discussions: launchctl StartInterval vs ThrottleInterval](https://discussions.apple.com/thread/2520819) [HIGH]
- [Lucas Pinheiro: Where is my PATH, launchD?](https://lucaspin.medium.com/where-is-my-path-launchd-fc3fc5449864) [HIGH]
- [Bitsplitting: Reauthorizing Automation in Mojave (TCC + AppleScript)](https://bitsplitting.org/2018/07/11/reauthorizing-automation-in-mojave/) [HIGH]
- [Scripting OS X: Avoiding AppleScript Security and Privacy Requests](https://scriptingosx.com/2020/09/avoiding-applescript-security-and-privacy-requests/) [HIGH]
- [HackTricks: macOS TCC](https://angelica.gitbook.io/hacktricks/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-tcc) [MEDIUM]
- [Daring Fireball: How to Determine if a Certain App Is Running Using AppleScript](https://daringfireball.net/2006/10/how_to_tell_if_an_app_is_running) [HIGH]
- [Vincent Gable: How To Check if an Application is Running With AppleScript](https://vgable.com/blog/2009/04/24/how-to-check-if-an-application-is-running-with-applescript/) [HIGH]
- [Apple Dev: AppleScript Lexical Conventions / Unicode Support](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/conceptual/ASLR_lexical_conventions.html) [HIGH]
- [Armin Ronacher: Your Node is Leaking Memory? setTimeout Could be the Reason](https://lucumr.pocoo.org/2024/6/5/node-timeout/) [HIGH]
- [Better Stack: Preventing and Debugging Memory Leaks in Node.js](https://betterstack.com/community/guides/scaling-nodejs/high-performance-nodejs/nodejs-memory-leaks/) [HIGH]
- [Node.js Issue #20661: Unexpected timer behavior contradicting documentation on MacOS (sleep/wake)](https://github.com/nodejs/node/issues/20661) [HIGH]
- [Node.js Issue #13168: setTimeout not always firing when computer sleeps/wakes](https://github.com/nodejs/node/issues/13168) [HIGH]
- [Node.js Docs: Process / Exit Codes](https://nodejs.org/api/process.html) [HIGH]
- [Better Stack: A Complete Guide to Pino Logging in Node.js](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/) [HIGH]
- [DEV.to: The Silent Killers in Node.js: uncaughtException and unhandledRejection](https://dev.to/silentwatcher_95/the-silent-killers-in-nodejs-uncaughtexception-and-unhandledrejection-1p9b) [MEDIUM]
- [pino issue #761: Exit logging fails with standard pino](https://github.com/pinojs/pino/issues/761) [HIGH]
- [Node.js ECMAScript Modules Documentation](https://nodejs.org/api/esm.html) [HIGH]
- [TypeScript: ECMAScript Modules in Node.js](https://www.typescriptlang.org/docs/handbook/esm-node.html) [HIGH]
- [undici Discussion #2382: How the default dispatcher reuses connections (keep-alive)](https://github.com/nodejs/undici/discussions/2382) [HIGH]
- [Gather Forum: Web socket api why sometime error 1006](https://forum.gather.town/t/web-socket-api-why-sometime-error-1006/714/2) [HIGH]
- [Gather Forum: NPM Vulnerability protobufjs in gather-game-client](https://forum.gather.town/t/npm-vulnerability-protobuffjs-6-10-0-7-2-3/673) [HIGH]
- [@gathertown/gather-game-client Engine docs (auto-reconnect, heartbeat)](http://gather-game-client-docs.s3-website-us-west-2.amazonaws.com/classes/Engine.html) [MEDIUM]
- [Markkop/gather-town-websocket-examples](https://github.com/Markkop/gather-town-websocket-examples) [HIGH]
- [Hiren Patel: Using macOS newsyslog to Rotate Service Logs](https://patelhiren.com/blog/macos-newsyslog-openclaw-logs/) [HIGH]
- [WebSocket.org: Fix WebSocket Timeout and Silent Dropped Connections](https://websocket.org/guides/troubleshooting/timeout/) [HIGH]
- [RingCentral: Keeping WebSocket connections alive](https://developers.ringcentral.com/guide/notifications/websockets/heart-beats) [HIGH]
- [protobuf.js CVE-2023-36665 Advisory](https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-xq3m-2v4x-88gg) [HIGH]
- [NepTunes (micropixels) Product Page](https://micropixels.software/apps/neptunes) [HIGH]

---

*Pitfalls research for: Local macOS Node.js Daemon, Apple Music to Gather Status Bridge*
*Researched: 2026-05-08*
