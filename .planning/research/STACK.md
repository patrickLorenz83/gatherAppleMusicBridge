# Stack Research

**Domain:** Local macOS Background-Daemon (Node.js/TypeScript) — Music-Status-Bridge
**Researched:** 2026-05-08
**Confidence:** HIGH (alle Versionen via `npm view` verifiziert; Gather-Pattern aus offiziellem Referenz-Repo `gathertown/mod-spotify-as-status`)

## Executive Recommendation (TL;DR)

**Stack-Kern:**
- **Node.js 22 LTS** + **TypeScript 5.7** (nicht 6.0.3, siehe unten) + **tsx 4.21** (Dev) + **`tsc` build to dist/** (Prod)
- **`@gathertown/gather-game-client@43.0.1` via WebSocket** (NICHT die HTTP-API — siehe Korrektur unten) für `setEmojiStatus` und `setTextStatus`
- **Native `fetch` (Node 22+)** für Last.fm — kein Drittpaket nötig
- **`run-applescript@7`** von sindresorhus für AppleScript-Fallback
- **`dotenv@17`** für Konfiguration
- **`pino@10`** als Logger (JSON-Logs nach stderr, launchd schreibt sie in Datei)
- **launchd** allein als Process-Supervisor — kein pm2

**Wichtigste Korrektur am Projekt-Plan:** PROJECT.md spricht von "Gather HTTP API (setStatus)" — das ist ungenau. Der etablierte Weg, einen Player-Status zu setzen, ist die **WebSocket-API** via `@gathertown/gather-game-client` mit den Actions `setEmojiStatus` + `setTextStatus`. Das offizielle Gather-Beispiel `mod-spotify-as-status` macht es genau so. Die HTTP-API ist für Räume/Maps/Objekte da, nicht für Live-Player-Status.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | **22.x LTS** (aktiv: 22.20+) | Runtime | LTS bis April 2027, native `fetch` stabil, native `--env-file=` Flag, kein Bedarf für `dotenv-cli`. Node 24.x ist installiert (`v24.15.0`), das geht ebenfalls, ist aber bis Oktober 2026 die "Current"-Linie und wird erst dann LTS. Für einen langlaufenden Daemon empfehlenswert: 22 LTS. |
| TypeScript | **5.7.x** (aktuell ~5.7.3) | Sprache | Stabil, breit unterstützt, alle Tools (tsx, esbuild, ts-node) funktionieren. **Achtung:** `npm view typescript` zeigt 6.0.3 als latest — TypeScript 6.x ist neu (Release Q1 2026), bringt Breaking Changes (u. a. `--erasableSyntaxOnly`, geänderte Module-Resolution-Defaults). Für ein Single-User-Tool ohne Tests ist 5.7 die risikoärmere Wahl. |
| tsx | **4.21.0** | TS-Runner für Dev | Esbuild-basiert, keine Type-Checks zur Laufzeit (-> schnell), Shebang-Support für CLI-Scripts. Empfohlen statt `ts-node` für **alle** neuen TS-Node-Projekte 2026. |
| `@gathertown/gather-game-client` | **43.0.1** | Gather-WebSocket-Client | Offizieller Client von Gather. Letzter Release: 2 Jahre alt, **nicht aktiv weiterentwickelt**, aber **nicht deprecated** und es ist der einzige Weg, Player-Status zu setzen. Alternative wäre, das WebSocket-Protokoll selbst zu sprechen — viel zu viel Aufwand für ein Single-User-Tool. |
| dotenv | **17.4.2** | `.env`-Loader | De-facto-Standard. **Alternative:** Node 22 hat `--env-file=.env` als CLI-Flag — funktioniert für einfache Fälle, aber `dotenv` ist defensiver bei Quoting/Escaping und in der TS-Toolchain einfacher zu verdrahten. |
| pino | **10.3.1** | Logger | Schnellster Node-Logger, JSON-Format passt perfekt zu launchd-StandardOutPath/StandardErrorPath in Datei (parsbar). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `run-applescript` | **7.1.0** | AppleScript-Fallback gegen Music.app | Statt selbst `osascript` per Subprocess aufzurufen — sindresorhus' Wrapper kümmert sich um Escaping, Promise-API, korrekte Fehlerbehandlung. ESM-only ab v6, deshalb `"type": "module"` in package.json. |
| `isomorphic-ws` | **5.0.0** | WebSocket-Polyfill für Gather-Client | **Pflicht-Setup**: `global.WebSocket = require("isomorphic-ws")` vor `import { Game }` — exakt wie im `mod-spotify-as-status`-Reference-Repo. Ohne das funktioniert `gather-game-client` in Node nicht. |
| `ws` | **8.20.0** | WebSocket-Engine (transitiv via isomorphic-ws) | Wird i. d. R. mitgezogen; explizit in `dependencies` aufnehmen, falls peer-dep-Warnings auftauchen. |
| `zod` | **4.4.3** | Runtime-Validation für `.env` und Last.fm-Response | Nicht zwingend für Single-User-Tool, aber sinnvoll: Last.fm liefert manchmal kaputte/ungewöhnliche Strukturen (siehe PITFALLS). Mit Zod statt `as any` -> klarere Fehlermeldungen, kein Daemon-Crash bei API-Schluckauf. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **npm** (kein pnpm/yarn) | Package-Manager | Das Tool ist Single-User, ohne Monorepo. npm reicht, ist auf macOS vorinstalliert, weniger Setup. |
| **tsc** (TypeScript-Compiler) | Build nach `dist/` | `npm run build` -> `tsc -p .` -> launchd startet `node dist/index.js`. Schneller wäre `esbuild`, aber tsc gibt Type-Checks beim Build. |
| **Node 22 ESM** + `"type": "module"` | Modul-System | `run-applescript` ist ESM-only -> ESM ist die zukunftssichere Wahl. CJS-Variante ginge auch, ist aber rückwärtsgewandt. |

## Installation

```bash
# Core (Runtime-Dependencies)
npm install \
  @gathertown/gather-game-client@^43.0.1 \
  isomorphic-ws@^5.0.0 \
  ws@^8.20.0 \
  dotenv@^17.4.2 \
  pino@^10.3.1 \
  run-applescript@^7.1.0 \
  zod@^4.4.3

# Dev-Dependencies
npm install -D \
  typescript@~5.7.3 \
  tsx@^4.21.0 \
  @types/node@^22 \
  @types/ws@^8
```

**`tsconfig.json` Empfehlung:**

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

**`package.json` Scripts:**

```jsonc
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p .",
    "start": "node dist/index.js",
    "install-daemon": "tsx scripts/install-daemon.ts",
    "uninstall-daemon": "tsx scripts/uninstall-daemon.ts"
  }
}
```

## Gather-Integration: Konkrete Pattern

Aus dem offiziellen Referenz-Repo `gathertown/mod-spotify-as-status` (TypeScript, MIT-Lizenz):

```typescript
import { Game } from "@gathertown/gather-game-client";
// global.WebSocket muss VOR dem Game-Import gesetzt sein:
import WS from "isomorphic-ws";
(globalThis as any).WebSocket = WS;

const game = new Game(SPACE_ID, () => Promise.resolve({ apiKey: API_KEY }));
game.connect();
game.subscribeToConnection((connected) => console.log("connected?", connected));

// Status setzen:
game.sendAction({
  $case: "setEmojiStatus",
  setEmojiStatus: { emojiStatus: "♫" },
});
game.sendAction({
  $case: "setTextStatus",
  setTextStatus: { textStatus: "Artist – Track" },
});

// Status leeren (Pause/nichts läuft):
game.sendAction({ $case: "setEmojiStatus", setEmojiStatus: { emojiStatus: "" } });
game.sendAction({ $case: "setTextStatus",  setTextStatus:  { textStatus:  "" } });
```

Die `SPACE_ID` ist das Format `wxyz1234abcd/space-name` (URL-encoded slash beachten, je nach Endpoint). Der `API_KEY` kommt aus `https://app.gather.town/apikeys`.

## Last.fm-Integration: Roll-your-own statt npm-Paket

**Empfehlung: Native `fetch` + 30-Zeilen-Wrapper, KEIN Last.fm-npm-Paket.**

### Das Last.fm-npm-Paket-Landschaft (verifiziert via `npm view`)

| Paket | Version | Letzter Release | Bewertung |
|-------|---------|-----------------|-----------|
| `lastfm-ts-api` | 2.6.2 | **vor 1 Monat** (aktiv!) | Einziges TypeScript-first Paket, MIT, keine Dependencies. **Falls** ein npm-Paket gewünscht ist, dann dieses. |
| `lastfm-node-client` | 2.2.0 | über 1 Jahr alt | MIT, keine Deps. Ordentlich, aber TS-Types nur via `.d.ts`-Drittquellen. |
| `lastfm` (jammus/lastfm-node) | 0.9.4 | über 1 Jahr alt | Streaming-API, ältester Klassiker. Code-Stil veraltet. |
| `lastfmapi` (maxkueng) | 0.1.1 | sehr alt | Wrapper um `lastfm`, doppelt verschachtelt. **Vermeiden.** |

### Warum Roll-your-own besser ist

Last.fm `user.getRecentTracks` ist **ein einziger HTTP-GET**:

```
https://ws.audioscrobbler.com/2.0/
  ?method=user.getrecenttracks
  &user=<username>
  &api_key=<key>
  &format=json
  &limit=1
  &extended=0
```

Das ist mit nativem `fetch` plus Zod-Validierung in 20 Zeilen erledigt. Ein npm-Paket bringt:
- Eine zusätzliche Dependency, die nichts versteckt, was nicht trivial ist
- Versions-Drift / Sicherheits-Updates verfolgen
- Bei `lastfm-ts-api`: kein Showstopper, aber Overhead

Für den Daemon brauchst du nur **eine** Methode. `fetch` reicht.

### Konkretes Code-Skelett

```typescript
import { z } from "zod";

const RecentTracksResponse = z.object({
  recenttracks: z.object({
    track: z.array(z.object({
      name: z.string(),
      artist: z.object({ "#text": z.string() }),
      "@attr": z.object({ nowplaying: z.literal("true") }).optional(),
    })),
  }),
});

export async function fetchNowPlaying(user: string, apiKey: string) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({
    method: "user.getrecenttracks",
    user, api_key: apiKey, format: "json", limit: "1",
  }).toString();

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Last.fm ${res.status}`);
  const data = RecentTracksResponse.parse(await res.json());

  const t = data.recenttracks.track[0];
  if (!t?.["@attr"]?.nowplaying) return null;
  return { artist: t.artist["#text"], track: t.name };
}
```

`AbortSignal.timeout()` ist seit Node 17.3 Standard — kein extra Timeout-Lib nötig.

## AppleScript-Fallback

```typescript
import { runAppleScript } from "run-applescript";

export async function getCurrentTrackFromMusicApp() {
  const script = `
    tell application "Music"
      if it is running then
        if player state is playing then
          set t to name of current track
          set a to artist of current track
          return a & " ||| " & t
        end if
      end if
      return ""
    end tell
  `;
  const out = await runAppleScript(script);
  if (!out) return null;
  const [artist, track] = out.split(" ||| ");
  return { artist, track };
}
```

**Warum `run-applescript`, nicht selbstgebauter Subprocess-Call:**
- Korrektes Escaping für Multiline-Scripts (Backticks/Anführungszeichen sind in AppleScript-Strings ein Albtraum)
- Promise-API
- Korrekte stderr-Behandlung
- ~10 Zeilen Source-Code, 0 Dependencies — kein Bloat

**Fallback-Variante ohne Drittpaket:** Node bietet `execFile` aus `node:child_process` (kein Shell-Interpolation, kein Injection-Risiko). Wenn man das nimmt, AppleScript in eine separate `.applescript`-Datei legen und mit `osascript /pfad/zur/datei.applescript` aufrufen — vermeidet Inline-Escaping vollständig. `run-applescript` bleibt aber bequemer.

**Warum nicht `MediaRemote` private framework / `nowplayable`:** macOS 14+ hat `MediaRemote` weitgehend dichtgemacht (siehe PITFALLS.md). AppleScript gegen Music.app ist offiziell und stabil.

## launchd-Plist

**Modernes Pattern (`bootstrap`/`bootout`, nicht das deprecated `load`/`unload`):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>           <string>de.lorenz.gatherapplemusicbridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/plorenz/.../dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/plorenz/.../gatherAppleMusicBridge</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>      <string>production</string>
    <key>PATH</key>          <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>       <true/>
  <key>KeepAlive</key>       <true/>
  <key>StandardOutPath</key> <string>/Users/plorenz/Library/Logs/gather-bridge.log</string>
  <key>StandardErrorPath</key><string>/Users/plorenz/Library/Logs/gather-bridge.err</string>
</dict>
</plist>
```

**Install-Script (`scripts/install-daemon.ts`):**

```bash
# Datei nach ~/Library/LaunchAgents/ schreiben
# dann:
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/de.lorenz.gatherapplemusicbridge.plist
launchctl enable    gui/$(id -u)/de.lorenz.gatherapplemusicbridge
launchctl kickstart gui/$(id -u)/de.lorenz.gatherapplemusicbridge
```

**Wichtig:**
- `bootstrap` (modern) statt `load -w` (deprecated seit macOS 10.10, könnte irgendwann entfernt werden)
- `gui/$(id -u)` ist die Domain für User-Agents (LaunchAgents in `~/Library/LaunchAgents`)
- `KeepAlive: true` -> launchd restartet bei Crash. **Warnung:** wenn der Daemon in Endlosschleife crasht, wirft launchd ihn ab Throttle-Schwelle raus (`ExitTimeOut` / 10s-Throttle). Logs prüfen.
- `node`-Pfad **absolut** (`/usr/local/bin/node` oder wo auch immer `which node` zeigt) — launchd hat keinen User-PATH.

**Process-Supervision: launchd reicht. Kein pm2.**

pm2 wäre Doppel-Supervision (launchd würde pm2 starten, pm2 würde Node starten). Macht den Setup komplexer ohne Mehrwert für ein Single-User-Tool. launchd kann KeepAlive, Throttling, Logs, Login-Start — alles, was hier gebraucht wird.

## Logging: pino

`pino` schreibt JSON nach stdout/stderr. launchd leitet das in `StandardOutPath`/`StandardErrorPath`. Lesen mit `pino-pretty`:

```bash
tail -f ~/Library/Logs/gather-bridge.log | npx pino-pretty
```

**Warum nicht winston:** winston ist okay, aber 3–5× langsamer und hat 11 Sub-Dependencies (vs. 11 bei pino, aber pinos sind alles offizielle pinojs-Module, bei winston eine Mischung). Für einen langlaufenden Daemon ohne UI ist die JSON-Performance von pino der bessere Default.

**Warum nicht plain `console.log`:** Du wirst Log-Levels (debug/info/warn/error) wollen, sobald du den Daemon eine Woche laufen lässt. pino kostet nichts, gibt dir aber sofort strukturierte Logs.

## HTTP-Client: native `fetch`

Node 22+ hat `fetch`/`undici` integriert und stabil. Für **einen** Last.fm-Endpoint mit 10s-Polling ist Performance kein Argument für undici-direkt.

**Wann undici (`npm i undici`) explizit installieren:** wenn du Connection-Pooling über tausende Requests/Sekunde brauchst, ProxyAgent, HTTP/2, oder eine bestimmte undici-Version. Hier nicht der Fall.

**Was nicht nehmen:**
- `node-fetch` (Legacy, war 2022 nötig, heute redundant)
- `axios` (große Lib, eigene API, nichts gewonnen — und Versions-Drift wie im veralteten `gather-game-client` zeigt es: axios kann zur Sicherheits-Stolperfalle werden)
- `got` (gut, aber zu viel für einen Endpoint)

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@gathertown/gather-game-client` (WS) | Gather HTTP-API direkt | Wenn du nur Maps/Räume bearbeiten willst — die HTTP-API kann **keinen** Live-Player-Status setzen. Hier nicht relevant. |
| native `fetch` | `lastfm-ts-api@2.6.2` | Wenn dir 1 Dependency mehr lieber ist als 30 Zeilen Code, und du andere Last.fm-Endpoints später dazunehmen willst (`getTopTracks` etc.). Aktiv gewartet, MIT, 0 Deps. |
| `run-applescript` | `execFile("osascript", ["/pfad/script.applescript"])` aus `node:child_process` | Wenn du Sindresorhus' Mikropakete grundsätzlich vermeidest. Dann AppleScript in eine separate Datei auslagern, kein Inline-Escaping nötig. |
| `dotenv` | Node 22 `--env-file=.env` | Ginge bei einfachen `.env`-Dateien. dotenv ist defensiver bei Sonderzeichen, multiline Strings, Quoting. |
| `pino` | `console.log` | OK für die ersten 24h. Ab dem Punkt, wo du Logs nach Level filtern willst, wechseln. Lieber gleich richtig machen. |
| TypeScript 5.7 | TypeScript 6.0 | Wenn das Projekt frisch ist und du gleich auf den 6.x-Zug aufspringen willst. Risiko: einzelne Tools (esbuild-Plugins, Type-Definitions) hinken hinterher. |
| `tsx` | `ts-node` | Wenn du Decorators / experimentelle TS-Features brauchst, die tsx (esbuild) nicht versteht. Hier nicht relevant. |
| launchd allein | `pm2` zusätzlich | Wenn du Multi-Process oder cluster-Mode willst. Nicht für Single-Daemon. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `lastfmapi@0.1.1` | Letzter Release uralt, ist ein Wrapper um den uralten `lastfm@0.9.4` — doppelte Bürde, unnötig | native `fetch` ODER `lastfm-ts-api` |
| `node-fetch` | Veraltet, mit Node 22 nutzlos | native `fetch` |
| `axios` (im Bridge-Code) | Größe, eigene API. **Achtung:** der `gather-game-client` zieht selbst `axios@~0.26.0` als Transitive — daran kannst du nichts ändern, das ist ein Code-Smell des Pakets, kein Grund, axios noch direkt zu nutzen | native `fetch` |
| `winston` | Langsamer als pino, weniger eindeutiger Stil | `pino` |
| `nodemon` | tsx hat `--watch` eingebaut | `tsx watch` |
| `pm2` | Doppel-Supervision mit launchd | nur launchd |
| `ts-node` (in neuen Projekten) | Langsamer Startup, weniger gepflegt als tsx | `tsx` |
| `MediaRemote` private framework | Auf macOS 14+ stark eingeschränkt, undokumentiert, kann jederzeit brechen | AppleScript gegen `Music.app` |
| `pkg`, `nexe`, `ncc` Single-Binary | Out of Scope laut PROJECT.md, würde launchd-Setup komplizierter machen | npm + tsc + launchd |
| TypeScript 6.0.x | Brandneu (Q1 2026), Tool-Ökosystem holt erst auf | TypeScript 5.7.x |

## Stack Patterns by Variant

**Wenn NepTunes irgendwann wegfällt / nicht mehr scrobbelt:**
- Last.fm-Pfad gibt `null` zurück, Daemon fällt automatisch auf AppleScript zurück
- Keine Stack-Änderung nötig — die Architektur deckt das ab

**Wenn der Daemon später doch ein Tray-UI bekommt (Out of Scope v1, könnte v2 werden):**
- `electron` ist Overkill — Bündel-Größe ~150 MB
- Stattdessen `tray` (Rust) oder ein Mac-natives Swift-Wrapper-Tool, mit IPC zum Node-Daemon
- Aber: erstmal v1 ohne UI bauen

**Wenn die Bridge auf mehreren Macs laufen soll (Out of Scope v1):**
- launchd-Plist müsste pro Maschine generiert werden (Pfade absolut)
- Heute schon: Install-Script schreibt absolute Pfade aus `process.cwd()` in die Plist

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@gathertown/gather-game-client@43.0.1` | `isomorphic-ws@5.x`, `ws@8.x` | **Pflicht:** `global.WebSocket` setzen, bevor `Game`-Klasse importiert/instanziiert wird |
| `@gathertown/gather-game-client@43.0.1` | Node 18, 20, 22, 24 | Funktioniert in allen aktiven Node-Versionen — uralter Code, aber stabil |
| `@gathertown/gather-game-client@43.0.1` | `axios@~0.26.0` (transitiv) | **Bekannte Audit-Warnung:** alte axios-Version zieht ggf. CVE-Audit-Hits. Für Single-User-Tool tolerierbar, weil keine User-kontrollierten URLs. |
| `run-applescript@7.x` | Node 18+, ESM only | -> `"type": "module"` in package.json setzen |
| `tsx@4.21` | Node 20+ | Auf Node 22 LTS perfekt |
| `pino@10` | Node 18+ | Kompatibel |
| `dotenv@17` | alle Node-Versionen | Major 17 hat keine Breaking Changes für dieses Projekt |

## Security / Hygiene

- `.env` muss in `.gitignore` (steht in PROJECT.md, aber nochmal: **vor erstem Commit prüfen**)
- `npm audit` wird wegen `gather-game-client` -> `axios@0.26` und ggf. `protobufjs` warnen — kann hier ignoriert werden (lokales Tool, keine User-Inputs)
- Last.fm-API-Key ist read-only -> niedriges Risiko
- Gather-API-Key kann **alles** im Space — niemals committen, niemals loggen (`pino.redact: ["env.GATHER_API_KEY"]`)

## Sources

- npm registry (verified 2026-05-08 via `npm view`):
  - `@gathertown/gather-game-client@43.0.1` — über 1 Jahr alt, nicht aktiv weiterentwickelt, nicht deprecated [HIGH]
  - `lastfm-ts-api@2.6.2` — vor 1 Monat veröffentlicht, aktiv [HIGH]
  - `lastfm-node-client@2.2.0`, `lastfm@0.9.4`, `lastfmapi@0.1.1` — alle über 1 Jahr alt [HIGH]
  - `tsx@4.21.0`, `dotenv@17.4.2`, `pino@10.3.1`, `winston@3.19.0`, `undici@8.2.0`, `run-applescript@7.1.0`, `zod@4.4.3`, `ws@8.20.0`, `isomorphic-ws@5.0.0` [HIGH]
- [gathertown/mod-spotify-as-status](https://github.com/gathertown/mod-spotify-as-status) — offizielles Gather-Beispiel, zeigt `setEmojiStatus`+`setTextStatus` Action-Pattern via WebSocket [HIGH]
- [gathertown/api-examples](https://github.com/gathertown/api-examples) — bestätigt, dass HTTP-API für Räume/Maps zuständig ist, nicht Player-Status [HIGH]
- [Markkop/gather-town-websocket-examples](https://github.com/Markkop/gather-town-websocket-examples) — zeigt das WebSocket-Setup-Pattern und den Hinweis, Events in `node_modules/@gathertown/gather-game-common/src/events.proto` zu finden [HIGH]
- [@gathertown/gather-game-client docs](http://gather-game-client-docs.s3-website-us-west-2.amazonaws.com/) — offizielle TypeDoc-Doku zur 38.x-Linie (für 43.x noch gültig in Grundstruktur) [MEDIUM, da S3-Hosting nicht garantiert dauerhaft]
- [Gather Forum: HTTP API upgrade](https://forum.gather.town/t/http-api-upgrade/646) — Hinweis auf v1-zu-v2-API-Umstellung; nicht relevant für Player-Status, aber Kontext [LOW]
- [Gather Forum: protobufjs vulnerability](https://forum.gather.town/t/npm-vulnerability-protobuffjs-6-10-0-7-2-3/673) — bestätigt bekannte Audit-Warnung im gather-game-client [HIGH]
- [tsx FAQ](https://tsx.is/faq), [tsx vs ts-node Comparison (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/tsx-vs-ts-node/) [HIGH]
- [Node.js fetch / undici Docs](https://undici.nodejs.org/) — bestätigt nativer fetch in Node 22 ist Production-tauglich [HIGH]
- [launchctl bootstrap vs load (Homebrew PR #112)](https://github.com/Homebrew/homebrew-services/pull/112) — `bootstrap`/`bootout`/`kickstart` ist die moderne Variante [HIGH]
- [Apple Dev Docs: Creating Launch Daemons](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) — kanonische Plist-Reference [HIGH, älter aber inhaltlich gültig]
- [run-applescript GitHub](https://github.com/sindresorhus/run-applescript) — sindresorhus, MIT, ESM-only ab v6 [HIGH]

---
*Stack research for: Local macOS Node.js Daemon — Apple Music to Gather Status Bridge*
*Researched: 2026-05-08*
