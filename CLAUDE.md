<!-- GSD:project-start source:PROJECT.md -->
## Project

**gatherAppleMusicBridge**

Ein lokaler macOS-Background-Daemon (Node.js/TypeScript), der den aktuell in Apple Music laufenden Track in den Gather-Status schreibt. Da Apple Music keinen "now playing"-Endpoint anbietet, holt die Bridge die Live-Daten primär aus Last.fm (gespeist durch NepTunes als Scrobbler) und nutzt AppleScript gegen Music.app als Fallback. Single-User-Tool für Patrick Lorenz, das die fehlende Apple-Music-Integration in Gather kompensiert.

**Core Value:** Wenn ich in Gather online bin, sehen meine Kollegen, was ich gerade höre, ohne dass ich von Apple Music auf Spotify wechseln muss.

### Constraints

- **Tech Stack**: Node.js/TypeScript — passt zum Vorbild `mod-spotify-as-status`, gute Last.fm- und Gather-HTTP-Libs verfügbar
- **Plattform**: nur macOS — AppleScript-Fallback und launchd-Integration sind Mac-spezifisch
- **Sicherheit**: API-Keys nicht in Repo — `.env` muss in `.gitignore`, niemals committen
- **Rate-Limit**: Last.fm erlaubt 5 Calls/Sekunde pro IP — 10s-Polling ist weit drunter, aber Cap nicht überschreiten
- **Abhängigkeit**: NepTunes muss laufen, damit Last.fm-Daten ankommen — Fallback auf AppleScript fängt das auf
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Recommendation (TL;DR)
- **Node.js 22 LTS** + **TypeScript 5.7** (nicht 6.0.3, siehe unten) + **tsx 4.21** (Dev) + **`tsc` build to dist/** (Prod)
- **`@gathertown/gather-game-client@43.0.1` via WebSocket** (NICHT die HTTP-API — siehe Korrektur unten) für `setEmojiStatus` und `setTextStatus`
- **Native `fetch` (Node 22+)** für Last.fm — kein Drittpaket nötig
- **`run-applescript@7`** von sindresorhus für AppleScript-Fallback
- **`dotenv@17`** für Konfiguration
- **`pino@10`** als Logger (JSON-Logs nach stderr, launchd schreibt sie in Datei)
- **launchd** allein als Process-Supervisor — kein pm2
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
# Core (Runtime-Dependencies)
# Dev-Dependencies
## Gather-Integration: Konkrete Pattern
## Last.fm-Integration: Roll-your-own statt npm-Paket
### Das Last.fm-npm-Paket-Landschaft (verifiziert via `npm view`)
| Paket | Version | Letzter Release | Bewertung |
|-------|---------|-----------------|-----------|
| `lastfm-ts-api` | 2.6.2 | **vor 1 Monat** (aktiv!) | Einziges TypeScript-first Paket, MIT, keine Dependencies. **Falls** ein npm-Paket gewünscht ist, dann dieses. |
| `lastfm-node-client` | 2.2.0 | über 1 Jahr alt | MIT, keine Deps. Ordentlich, aber TS-Types nur via `.d.ts`-Drittquellen. |
| `lastfm` (jammus/lastfm-node) | 0.9.4 | über 1 Jahr alt | Streaming-API, ältester Klassiker. Code-Stil veraltet. |
| `lastfmapi` (maxkueng) | 0.1.1 | sehr alt | Wrapper um `lastfm`, doppelt verschachtelt. **Vermeiden.** |
### Warum Roll-your-own besser ist
- Eine zusätzliche Dependency, die nichts versteckt, was nicht trivial ist
- Versions-Drift / Sicherheits-Updates verfolgen
- Bei `lastfm-ts-api`: kein Showstopper, aber Overhead
### Konkretes Code-Skelett
## AppleScript-Fallback
- Korrektes Escaping für Multiline-Scripts (Backticks/Anführungszeichen sind in AppleScript-Strings ein Albtraum)
- Promise-API
- Korrekte stderr-Behandlung
- ~10 Zeilen Source-Code, 0 Dependencies — kein Bloat
## launchd-Plist
# Datei nach ~/Library/LaunchAgents/ schreiben
# dann:
- `bootstrap` (modern) statt `load -w` (deprecated seit macOS 10.10, könnte irgendwann entfernt werden)
- `gui/$(id -u)` ist die Domain für User-Agents (LaunchAgents in `~/Library/LaunchAgents`)
- `KeepAlive: true` -> launchd restartet bei Crash. **Warnung:** wenn der Daemon in Endlosschleife crasht, wirft launchd ihn ab Throttle-Schwelle raus (`ExitTimeOut` / 10s-Throttle). Logs prüfen.
- `node`-Pfad **absolut** (`/usr/local/bin/node` oder wo auch immer `which node` zeigt) — launchd hat keinen User-PATH.
## Logging: pino
## HTTP-Client: native `fetch`
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
- Last.fm-Pfad gibt `null` zurück, Daemon fällt automatisch auf AppleScript zurück
- Keine Stack-Änderung nötig — die Architektur deckt das ab
- `electron` ist Overkill — Bündel-Größe ~150 MB
- Stattdessen `tray` (Rust) oder ein Mac-natives Swift-Wrapper-Tool, mit IPC zum Node-Daemon
- Aber: erstmal v1 ohne UI bauen
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
