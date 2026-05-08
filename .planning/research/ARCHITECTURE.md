# Architecture Research

**Domain:** Local macOS Background-Daemon (Node.js/TypeScript) — Music-Status-Bridge
**Researched:** 2026-05-08
**Confidence:** HIGH (Komponenten-Schnitt aus Stack-Recherche und Referenz-Repo `mod-spotify-as-status` abgeleitet; Polling- und Lifecycle-Pattern Standard-Node-Idiome; launchd-Verhalten anhand offizieller Dokumentation und gängiger Praxis verifiziert)

## Executive Recommendation (TL;DR)

Drei harte Komponenten-Grenzen, alles dazwischen ist trivial:

1. **Sources** (`src/sources/`) — pollen externe Systeme, geben `Track | null` zurück. Last.fm primär, AppleScript Fallback. **Mit gemeinsamer Interface — nicht over-engineered, sondern genau die Abstraktion, die das Fallback-Verhalten erst sauber macht.**
2. **Sink** (`src/sink/`) — dünner Wrapper um `@gathertown/gather-game-client`, exponiert nur `setStatus(track | null)`.
3. **Loop/Orchestrator** (`src/index.ts` + `src/loop.ts`) — `setTimeout`-rekursiv (nicht `setInterval`), mit Diff-Logik gegen "letzten gesetzten Status" und SIGTERM-Handler, der vor `process.exit` den Status leert.

**Alle Antworten auf einen Blick:**

| Frage | Antwort |
|---|---|
| Polling-Pattern | `setTimeout`-rekursiv mit `AbortController` für Shutdown — kein `setInterval`, kein `async generator` |
| Source-Interface | Ja, `NowPlayingSource` mit einer Methode — Vorteil > Kosten, weil das Fallback ohne sie unsauber wird |
| Track-Diff-Schlüssel | `${artist}|${track}` (lowercase, getrimmt) — keine `mbid`/`@attr`-Magie nötig |
| Sink-Abstraktion | Ja, dünner Wrapper, weil das Connect/Reconnect-Lifecycle des Game-Clients sonst in die Loop blutet |
| SIGTERM | `signal.addEventListener("abort", ...)` -> Status leeren -> Game-Client `disconnect()` -> `process.exit(0)`, mit 5s-Timeout-Fallback |
| Error-Boundaries | Pro Source/Sink eigener `try/catch` plus Exponential-Backoff-State; **kein** Circuit-Breaker (overkill) |
| `.env` & launchd | **`.env` aus `WorkingDirectory` per `dotenv` laden**, nicht in der Plist hardcoden — Plist liefert nur `PATH`, `NODE_ENV`, `WorkingDirectory` |
| Logging | `pino` -> stderr -> launchd `StandardErrorPath` -> `~/Library/Logs/gather-bridge.err` |
| Build-Boundary | TS-Quellen in `src/` -> `tsc` -> `dist/` (committet? nein, nur lokal). Plist-Template in `scripts/`, generiert beim Install |
| Build-Order | Sink zuerst (riskantestes Stück), dann Sources, dann Loop, dann Install-Script |

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        macOS User Session                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐                       ┌──────────────────┐         │
│   │  Music.app  │ ── scrobble (HTTP) ─► │  NepTunes        │         │
│   └──────┬──────┘                       └────────┬─────────┘         │
│          │                                       │                   │
│          │ AppleScript                           │ Last.fm Scrobble  │
│          │ (osascript IPC)                       ▼                   │
│          │                              ┌──────────────────┐         │
│          │                              │  Last.fm Cloud   │         │
│          │                              └────────┬─────────┘         │
│          │                                       │                   │
│          │                                       │ HTTPS (fetch)     │
│          │                                       │                   │
└──────────┼───────────────────────────────────────┼───────────────────┘
           │                                       │
           │   ┌────────────────────────────────┐  │
           └──►│         Bridge Daemon          │◄─┘
               │  (node dist/index.js, launchd) │
               │                                │
               │  ┌──────────────────────────┐  │
               │  │   Loop (orchestrator)    │  │
               │  │   - tick every 10s       │  │
               │  │   - last-track diff      │  │
               │  │   - SIGTERM handler      │  │
               │  └────┬───────────────┬─────┘  │
               │       │               │        │
               │  ┌────▼─────┐    ┌────▼─────┐  │
               │  │ Sources  │    │   Sink   │  │
               │  │ (chain)  │    │ (Gather) │  │
               │  └────┬─────┘    └────┬─────┘  │
               └───────┼───────────────┼────────┘
                       │               │
                       │               │ WebSocket (game-client)
                       │               ▼
                       │       ┌──────────────────┐
                       │       │  Gather Cloud    │
                       │       │  (Space Status)  │
                       │       └──────────────────┘
                       │
                       │ stderr (pino JSON)
                       ▼
               ┌────────────────────────────────┐
               │  ~/Library/Logs/               │
               │  gather-bridge.err             │
               │  (launchd StandardErrorPath)   │
               └────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Concrete File |
|-----------|----------------|---------------|
| **Loop** | Tickt alle 10 s, ruft Source-Chain, vergleicht mit letztem Track, ruft Sink. Lifecycle (start/stop/abort). | `src/loop.ts` |
| **Source: Last.fm** | HTTP an `ws.audioscrobbler.com`, Zod-validiert, gibt `{artist, track} \| null` zurück | `src/sources/lastfm.ts` |
| **Source: AppleScript** | `runAppleScript` gegen `Music.app`, parst Output, gibt `{artist, track} \| null` | `src/sources/appleScript.ts` |
| **Source-Chain** | Probiert Last.fm zuerst, fällt bei `null` (oder Error) auf AppleScript zurück | `src/sources/chain.ts` |
| **Sink: Gather** | Wrapper um `@gathertown/gather-game-client`. Kümmert sich um Connect, Reconnect, `setEmojiStatus` + `setTextStatus`, `clearStatus()` | `src/sink/gather.ts` |
| **Config** | Lädt `.env`, validiert Pflicht-Variablen mit Zod, wirft mit klarer Message bei Fehlen | `src/config.ts` |
| **Logger** | Konfiguriert `pino` mit Redaction für API-Keys | `src/logger.ts` |
| **Entry** | Lädt Config, instanziiert Logger, Sources, Sink, Loop. Verdrahtet Signal-Handler. | `src/index.ts` |
| **Install-Script** | Generiert Plist mit absoluten Pfaden, schreibt nach `~/Library/LaunchAgents/`, ruft `launchctl bootstrap` | `scripts/install-daemon.ts` |
| **Uninstall-Script** | `launchctl bootout`, löscht Plist | `scripts/uninstall-daemon.ts` |

## Recommended Project Structure

```
gatherAppleMusicBridge/
├── src/
│   ├── index.ts                  # Entry: load config, wire components, handle signals
│   ├── config.ts                 # Load + validate .env via Zod
│   ├── logger.ts                 # pino factory with redact for API keys
│   ├── loop.ts                   # Recursive setTimeout poll loop, diff, sleep, abort
│   ├── types.ts                  # Track, NowPlayingSource interfaces
│   ├── sources/
│   │   ├── lastfm.ts             # Last.fm fetch + Zod
│   │   ├── appleScript.ts        # runAppleScript wrapper
│   │   └── chain.ts              # Try-in-order composition
│   └── sink/
│       └── gather.ts             # Game-client wrapper: connect, setStatus, clearStatus
├── scripts/
│   ├── install-daemon.ts         # Generate plist + launchctl bootstrap
│   ├── uninstall-daemon.ts       # launchctl bootout + rm plist
│   └── plist.template.xml        # Plist template with ${PLACEHOLDERS}
├── dist/                         # Compiled JS (gitignored, tsc output)
├── .env                          # Secrets (gitignored)
├── .env.example                  # Template for setup (committed)
├── package.json
├── tsconfig.json
└── .planning/                    # GSD docs
```

### Structure Rationale

- **`src/sources/` und `src/sink/` als getrennte Ordner:** macht die Asymmetrie sichtbar — viele Sources, eine Sink. Erlaubt später trivial eine dritte Source (z. B. `src/sources/musicKit.ts`) ohne Refactoring.
- **`src/types.ts` separat:** zentrales `Track`-Interface, das Sources und Sink teilen. Keine zirkuläre Abhängigkeit, kein Bauchnabel-Schauen.
- **`scripts/` außerhalb von `src/`:** Install-Scripts laufen mit `tsx`, nicht aus `dist/` — sie sind Setup, kein Daemon-Code.
- **`plist.template.xml` als Datei, nicht inline-String:** eine 30-Zeilen-XML-Datei in einem Template-Literal ist hässlich und schwer zu reviewen. Externe Datei + simple `String.replace`-Substitution ist klarer.
- **Kein `lib/` oder `utils/` Ordner:** widerstehe der Versuchung. Bei einem 800-Zeilen-Daemon erzeugt `lib/` nur unsichere Abladestellen für Code, der eigentlich in `loop.ts` oder `sink/gather.ts` gehört.

## Architectural Patterns

### Pattern 1: Recursive `setTimeout` mit `AbortController`

**Was:** Statt `setInterval(tick, 10_000)` wird `tick()` rekursiv über `setTimeout` aufgerufen. Ein `AbortController` signalisiert Shutdown.

**Warum nicht `setInterval`:**
- **Drift:** Wenn ein `tick` länger als 10 s dauert (z. B. Last.fm-Timeout 5 s + AppleScript 2 s + Gather-Reconnect 4 s = 11 s), feuert `setInterval` overlappend — zwei `tick`s laufen gleichzeitig, Sink bekommt zwei `setStatus`-Calls fast zeitgleich, Reihenfolge nicht garantiert.
- **Process keeps alive:** `setInterval` ist ref'd by default — falls eine andere Codebahn `process.exit` ohne `clearInterval` aufruft, bleibt der Prozess hängen.
- **Backoff schwer:** Bei Last.fm-Outage will man die Polling-Frequenz halbieren; `setInterval` macht das hässlich (clear+create), `setTimeout`-rekursiv ist trivial.

**Warum nicht `async generator`:**
- Charmant, aber pures Boilerplate für einen einzigen Konsumenten. Keine zweite Codestelle iteriert über die Ticks. Generator gibt keine Vorteile, nur Indirection.

**Trade-offs:** `setTimeout`-rekursiv hat keinen Stack-Overflow-Risk (jede Iteration startet vom Event-Loop), aber man muss daran denken, den nächsten `setTimeout` **immer** zu schedulen — auch im Error-Pfad. `try/finally` ist Pflicht.

**Code-Skelett:**

```typescript
// src/loop.ts
export async function runLoop(opts: {
  source: NowPlayingSource;
  sink: GatherSink;
  intervalMs: number;
  signal: AbortSignal;
  log: pino.Logger;
}) {
  let lastKey: string | null = null;
  let consecutiveErrors = 0;

  const tick = async (): Promise<void> => {
    if (opts.signal.aborted) return;

    try {
      const track = await opts.source.getNowPlaying();
      const key = track ? `${track.artist}|${track.track}`.toLowerCase().trim() : null;

      if (key !== lastKey) {
        if (track) await opts.sink.setStatus(track);
        else await opts.sink.clearStatus();
        lastKey = key;
        opts.log.info({ track }, "status updated");
      }
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      opts.log.error({ err, consecutiveErrors }, "tick failed");
    } finally {
      if (!opts.signal.aborted) {
        const delay = Math.min(
          opts.intervalMs * Math.pow(2, Math.min(consecutiveErrors, 5)),
          5 * 60_000, // cap at 5 min
        );
        const timer = setTimeout(tick, delay);
        opts.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      }
    }
  };

  await tick();
}
```

### Pattern 2: Source-Chain (Strategie + Composition)

**Was:** Ein `NowPlayingSource`-Interface mit `getNowPlaying(): Promise<Track | null>`. Last.fm und AppleScript implementieren es. Eine `chain([lastfm, appleScript])` probiert sie der Reihe nach durch.

**Warum nicht inline `if (lastfm) ... else applescript()`:**
- Drei Verzweigungen werden aus zwei: `null` (Last.fm sagt "niemand spielt"), `Error` (Last.fm down), `Track`. Inline wird das ein `if/else if/try/catch`-Knoten, der kein Mensch reviewen will.
- Das **Verhalten "fehlerhafte Source ist wie leere Source"** soll im Chain-Wrapper zentral leben, nicht in der Loop. Die Loop will nicht wissen, ob Last.fm gerade `ECONNRESET` wirft.
- Dritter Source (`musicKit`?) wäre eine ein-Zeilen-Erweiterung der `chain`-Liste.

**Trade-off:** Zwei Dateien Boilerplate (`chain.ts`, `types.ts`) für ein Interface mit einer Methode. Aber: das Interface dokumentiert das Source-Contract gegenüber jeder zukünftigen Erweiterung. **Nicht over-engineered, weil das Fallback ohne diese Abstraktion unsauber wird.**

**Code-Skelett:**

```typescript
// src/types.ts
export type Track = { artist: string; track: string };
export interface NowPlayingSource {
  readonly name: string;
  getNowPlaying(): Promise<Track | null>;
}

// src/sources/chain.ts
export function chain(sources: NowPlayingSource[], log: pino.Logger): NowPlayingSource {
  return {
    name: "chain",
    async getNowPlaying() {
      for (const s of sources) {
        try {
          const t = await s.getNowPlaying();
          if (t) return t;
        } catch (err) {
          log.warn({ err, source: s.name }, "source failed, trying next");
        }
      }
      return null;
    },
  };
}
```

### Pattern 3: Sink als zustandsbehafteter Wrapper

**Was:** `GatherSink`-Klasse kapselt Game-Client-Lifecycle: lazy `connect()`, `setStatus(track)`, `clearStatus()`, `disconnect()`. Loop sieht keinen `Game`-Import.

**Warum nicht inline `game.sendAction(...)` in der Loop:**
- Game-Client braucht **Connect-Setup** (`global.WebSocket = WS` vor `import Game`, dann `game.connect()`, dann `subscribeToConnection`). Diese Sequenz hat **nichts** mit Polling zu tun.
- **Reconnect-Logik** (was tun, wenn `subscribeToConnection(false)` feuert?) ist Sink-internes Problem, nicht Loop-Problem.
- **Doppel-Action** (Emoji + Text in zwei `sendAction`-Calls) ist ein Implementierungsdetail. Loop will eine logische Operation: "setze Status auf diesen Track".

**Trade-off:** ~50 Zeilen mehr Code. Im Tausch: Loop bleibt 30 Zeilen lang und ist selbsterklärend. Sehr guter Tausch.

**Code-Skelett:**

```typescript
// src/sink/gather.ts
import WS from "isomorphic-ws";
(globalThis as { WebSocket?: unknown }).WebSocket = WS;
import { Game } from "@gathertown/gather-game-client";

export class GatherSink {
  private game: Game;
  private connected = false;

  constructor(spaceId: string, apiKey: string, private log: pino.Logger) {
    this.game = new Game(spaceId, () => Promise.resolve({ apiKey }));
  }

  async connect() {
    this.game.connect();
    this.game.subscribeToConnection((c) => {
      this.connected = c;
      this.log.info({ connected: c }, "gather connection state");
    });
    // simple readiness wait
    for (let i = 0; i < 50 && !this.connected; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!this.connected) throw new Error("gather connect timeout");
  }

  async setStatus(t: { artist: string; track: string }) {
    if (!this.connected) await this.connect();
    this.game.sendAction({ $case: "setEmojiStatus", setEmojiStatus: { emojiStatus: "♫" } });
    this.game.sendAction({
      $case: "setTextStatus",
      setTextStatus: { textStatus: `${t.artist} – ${t.track}` },
    });
  }

  async clearStatus() {
    if (!this.connected) return;
    this.game.sendAction({ $case: "setEmojiStatus", setEmojiStatus: { emojiStatus: "" } });
    this.game.sendAction({ $case: "setTextStatus", setTextStatus: { textStatus: "" } });
  }

  disconnect() {
    // gather-game-client has no public disconnect; rely on process exit
    this.connected = false;
  }
}
```

### Pattern 4: Diff via composite key

**Wie erkennt man "Track gewechselt"?**

Last.fm liefert manchmal `mbid` (MusicBrainz-ID), oft aber leer. `@attr.nowplaying` ist ein **Status-Flag** ("dies ist der aktuell laufende"), kein Identifikator.

**Lösung:** `key = ${artist}|${track}`, lowercase, getrimmt. Speichere im Loop-State als `lastKey`. Vergleich per `===`.

**Warum nicht `mbid`:**
- `mbid` ist optional und bei Apple-Music-Tracks häufig leer (Last.fm matcht den Scrobble nicht zuverlässig)
- AppleScript-Source kennt `mbid` gar nicht
- Composite-Key arbeitet **über beide Sources hinweg** — wenn Last.fm einen Track liefert und 10 s später AppleScript denselben Track liefert (NepTunes-Lag), erkennt man ihn als "gleich"

**Edge case:** Zwei Tracks mit gleichem Artist+Title, nur unterschiedliches Album. Bei Apple-Music-Nutzung praktisch irrelevant — und falls doch, ist die Konsequenz "Status wird nicht geupdatet", was harmlos ist.

**Trade-off vs. Album mit reinnehmen:** Last.fm-Response hat `album.#text`, AppleScript hat `album of current track`. Man kann den Key als `${artist}|${track}|${album}` bauen. **Empfehlung: nicht.** Album-Tagging ist die unzuverlässigste Metadaten-Spalte, schon eine Bindestrich-Differenz triggert dann unnötige Reconnect-Status-Updates.

### Pattern 5: SIGTERM-Handler mit Cleanup-Race-Guard

**Was passiert beim Logout:**

launchd schickt `SIGTERM`, wartet auf `ExitTimeOut` (Default 20 s, sollte man nicht ändern), dann `SIGKILL`. In den 20 s muss der Daemon: laufende Sink-Calls abbrechen, Status leeren, `process.exit(0)`.

**Code-Skelett:**

```typescript
// src/index.ts
const ac = new AbortController();
const sink = new GatherSink(cfg.GATHER_SPACE_ID, cfg.GATHER_API_KEY, log);
await sink.connect();

const shutdown = async (signal: string) => {
  log.info({ signal }, "shutdown requested");
  ac.abort();
  // race: 5 s for clear, then exit no matter what
  await Promise.race([
    sink.clearStatus().catch((err) => log.warn({ err }, "clear failed")),
    new Promise((r) => setTimeout(r, 5_000)),
  ]);
  log.info("shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await runLoop({ source, sink, intervalMs: 10_000, signal: ac.signal, log });
```

**Wichtig — Race-Guard:** Wenn `clearStatus()` hängt (Gather-WS hängt im Halb-Verbundenen-Zustand), darf nicht ewig gewartet werden. 5 s harter Timeout, dann `process.exit(0)` trotzdem. launchds 20 s sind großzügig, aber **du willst nicht in den `SIGKILL`-Pfad** — der lässt den Status stehen.

### Pattern 6: Konfigurations-Loading via `dotenv` aus `WorkingDirectory`

**Wie kommt `.env` zum launchd-Prozess?**

Das ist die Kern-Frage des Setups. Drei Ansätze, klare Empfehlung:

| Ansatz | Bewertung |
|---|---|
| **`.env` aus `process.cwd()` per `dotenv.config()` laden** | **EMPFOHLEN.** Plist setzt `WorkingDirectory` auf das Repo. `dotenv.config()` ohne Argumente lädt `./.env`. Secrets bleiben in einer Datei, die `.gitignore` rauswirft. Edit per `vim .env`, kein Plist-Reload nötig. |
| Alle Variablen direkt in `<EnvironmentVariables>` der Plist | Funktioniert, aber: Plist liegt in `~/Library/LaunchAgents/` — Klartext-Secrets in Standard-Backup-Pfad. Ändern erfordert `launchctl bootout` + neue Plist + `launchctl bootstrap`. Kein Standard-Editor-Workflow. |
| `~/.zshenv` / `launchctl setenv` | Kommt **nicht** durch zu launchd-Agents, weil launchd keinen Login-Shell startet. `launchctl setenv` ist Session-weit, Säuberungen sind frickelig, und Secrets werden allen Agents sichtbar. Vermeiden. |

**Konkret in `src/index.ts` ganz oben:**

```typescript
import "dotenv/config"; // implicitly calls dotenv.config(), reads ./.env
```

**Plist setzt nur:**
- `WorkingDirectory` -> Repo-Root (absolut)
- `EnvironmentVariables.PATH` -> `/usr/local/bin:/usr/bin:/bin` (damit Node spawned osascript findet)
- `EnvironmentVariables.NODE_ENV` -> `production` (rein konventionell)

**Antwort auf die Quality-Gate-Frage:** Der launchd-gestartete Prozess bekommt die `.env`-Werte, indem `dotenv` sie aus `${WorkingDirectory}/.env` zur Laufzeit einliest. **Plist liefert nur den Pfad, nicht die Secrets.**

### Pattern 7: Logging via pino-stderr -> launchd `StandardErrorPath`

```
pino.info(...)
   │
   ▼
process.stderr  (pino default für ERROR-Level: stderr; INFO: stdout — siehe Note unten)
   │
   ▼
launchd captures fd 2 -> StandardErrorPath
   │
   ▼
~/Library/Logs/gather-bridge.err  (rotated by you, not by launchd)
```

**Note zu pino-streams:** pino schreibt **alle** Level standardmäßig nach **stdout**, nicht stderr. Wenn du explizit nur einen Pfad willst, setze `StandardOutPath` und `StandardErrorPath` **beide** auf dieselbe Datei (oder zwei Dateien). Letzteres ist sauberer:

```xml
<key>StandardOutPath</key><string>/Users/plorenz/Library/Logs/gather-bridge.log</string>
<key>StandardErrorPath</key><string>/Users/plorenz/Library/Logs/gather-bridge.err</string>
```

Pinos JSON geht in `.log`, ungeplante Crashes (`console.error`-Stacktraces, AppleScript-Subprocess-stderr) gehen in `.err`. Tail mit `tail -f ... | npx pino-pretty`.

**Log-Rotation:** launchd hat keine eingebaute Rotation. Wenn die Logs >100 MB werden, manuell `truncate -s 0` oder ein simples cron-Script. Bei einem Single-User-Tool, das ein paar Zeilen pro Track-Wechsel loggt, ist das jahrelang kein Problem.

## Data Flow

### Tick Flow (1 Iteration der Loop)

```
[setTimeout fires after intervalMs]
    │
    ▼
[Loop.tick()]
    │
    ▼
[chain.getNowPlaying()]
    │
    ├─► [lastfm.getNowPlaying()] ──► HTTP GET ws.audioscrobbler.com
    │       │                              │
    │       │  ┌───────────────────────────┘
    │       │  │
    │       ▼  ▼
    │   {Track | null | throw}
    │
    │   if Track → return (Last.fm hit)
    │   if null  → try next source
    │   if throw → log + try next source
    │
    └─► [appleScript.getNowPlaying()] ──► run-applescript ──► osascript ──► Music.app
            │                                                                    │
            │  ┌─────────────────────────────────────────────────────────────────┘
            ▼  ▼
        {Track | null | throw}
            │
            ▼
[chain returns: Track | null]
    │
    ▼
[Loop: compute key, compare with lastKey]
    │
    ├─► key === lastKey → no-op (silent)
    │
    └─► key !== lastKey
            │
            ├─► track !== null → [sink.setStatus(track)] ──► game.sendAction × 2 ──► Gather WS
            │
            └─► track === null → [sink.clearStatus()] ──────► game.sendAction × 2 ──► Gather WS
    │
    ▼
[Loop: lastKey = key]
    │
    ▼
[Loop: schedule next tick via setTimeout]
```

### Lifecycle Flow

```
[launchd: KeepAlive=true, RunAtLoad=true]
    │
    ▼
[node dist/index.js spawned]
    │
    ▼
[index.ts: dotenv.config() → loads .env]
    │
    ▼
[index.ts: config.parse() → Zod validates env]
    │
    ▼
[index.ts: pino logger init]
    │
    ▼
[index.ts: GatherSink → game.connect() → wait connected]
    │
    ▼
[index.ts: chain([lastfm, appleScript])]
    │
    ▼
[index.ts: process.on(SIGTERM, shutdown)]
    │
    ▼
[index.ts: runLoop(...)] ◄────────────────────┐
    │                                          │
    │ (forever)                                │ tick scheduled by setTimeout
    │                                          │
    ▼                                          │
[loop.tick] ──────────────────────────────────┘
    
    ... user logs out ...

[launchd sends SIGTERM]
    │
    ▼
[shutdown handler: ac.abort()]
    │
    ▼
[loop.tick sees signal.aborted = true → returns without scheduling next]
    │
    ▼
[shutdown handler: sink.clearStatus() with 5s race]
    │
    ▼
[shutdown handler: process.exit(0)]
    │
    ▼
[launchd: process exited cleanly, no restart triggered (because we exited 0)]
```

**Wichtige Observation:** `KeepAlive: true` würde nach `exit(0)` neu starten, **außer** der Logout/Shutdown setzt das LaunchAgent-Domain-State. Beim User-Logout entlädt launchd alle GUI-Agents — `bootout` passiert implizit. **Beim manuellen `kill -TERM <pid>` während aktiver Session** würde `KeepAlive` allerdings re-spawnen — was im Test-Setup nervig ist, aber kein Production-Problem.

### Error Flow

```
[Last.fm returns 503]
    │
    ▼
[lastfm.ts: throws Error("Last.fm 503")]
    │
    ▼
[chain.ts: catches, logs warn, tries appleScript]
    │
    ▼
[appleScript.ts: returns {artist, track} (Music.app läuft)]
    │
    ▼
[chain returns Track]
    │
    ▼
[Loop continues normally]


[Both sources fail / Music.app closed / Last.fm down]
    │
    ▼
[chain returns null]
    │
    ▼
[Loop: key = null, lastKey was "...|..."]
    │
    ▼
[Loop: sink.clearStatus()]


[Gather WS drops mid-status-update]
    │
    ▼
[sink.setStatus throws "not connected"]
    │
    ▼
[Loop catch: consecutiveErrors++, exponential backoff]
    │
    ▼
[Next tick: sink.setStatus → connected check fails → reconnect]
    │
    ▼
[Either reconnect succeeds → status set, OR errors keep climbing]
    │
    ▼
[After 5+ failures: backoff hits 5min cap, daemon stays alive, retries every 5min]
```

**Kein Circuit-Breaker:** klassisches Pattern für Production-Services mit hoher Last und Cascading-Failure-Risiko. Hier irrelevant — eine Source, eine Sink, kein Down-Stream-Schaden, wenn 30 s lang nichts geht. Exponential-Backoff mit Cap reicht. Circuit-Breaker einzuführen wäre 200 LOC ohne Mehrwert.

## Build & Deploy Boundary

### Was wird kompiliert, was ist Runtime-Konfig, was geht wohin

| Artifact | Lebt in | Erzeugt durch | Installiert nach |
|---|---|---|---|
| TypeScript-Quellen | `src/` | Editor | nirgends (nur lokal) |
| Kompiliertes JS | `dist/` | `npm run build` (`tsc -p .`) | nirgends — **läuft aus dem Repo-Pfad**, nicht aus globalem Bin |
| `.env` | `<repo>/.env` | manuell, einmalig | nirgends — **`dotenv` liest aus `WorkingDirectory`** |
| `node_modules/` | `<repo>/node_modules` | `npm install` | nirgends — wird im Repo gehalten |
| Plist | `scripts/plist.template.xml` | committed | `~/Library/LaunchAgents/de.lorenz.gatherapplemusicbridge.plist` (gerendert beim Install) |
| Logs | nirgends | launchd | `~/Library/Logs/gather-bridge.{log,err}` |

**Schlüssel-Insight:** Es gibt **keine echte Installation in `/usr/local/lib/...` oder `/Applications/`**. Das Repo `~/Development/deepr/gatherAppleMusicBridge` **ist** die Installation. Die Plist verweist mit absoluten Pfaden auf:
- `/usr/local/bin/node` (Node binary)
- `${REPO}/dist/index.js` (Daemon entry)
- `${REPO}` als `WorkingDirectory` (für `.env` und `package.json`)

**Konsequenz:** Repo verschieben = Daemon kaputt. Akzeptabel für Single-User-Tool.

### Install-Script-Flow (`scripts/install-daemon.ts`)

```
1. Read repo path: process.cwd()
2. Read which node: execFileSync("which", ["node"]) → /usr/local/bin/node
3. Read plist template: fs.readFileSync("scripts/plist.template.xml", "utf8")
4. Substitute placeholders: ${NODE_BIN}, ${REPO}, ${USER}, ${UID}
5. Write to ~/Library/LaunchAgents/de.lorenz.gatherapplemusicbridge.plist
6. Run launchctl bootout (idempotent, swallow ENOENT)
7. Run launchctl bootstrap gui/${UID} <plist>
8. Run launchctl enable gui/${UID}/de.lorenz.gatherapplemusicbridge
9. Run launchctl kickstart gui/${UID}/de.lorenz.gatherapplemusicbridge
10. Print log paths and "tail -f"-Hinweis
```

**Voraussetzung:** `npm run build` muss vor `npm run install-daemon` gelaufen sein. Optional: `install-daemon` ruft `tsc` selbst auf, dann kann man's nicht vergessen.

## Suggested Build Order

Reihenfolge entlang **Risiko und Abhängigkeit**, nicht entlang Daten-Flow:

1. **`src/types.ts`** — `Track`, `NowPlayingSource`. **5 Minuten.** Nichts hängt funktional davon ab, aber jede andere Datei importiert es.
2. **`src/config.ts` + `src/logger.ts`** — Config-Parsing und pino-Setup. **30 Minuten.** Kleines Risiko, aber Loop und Sources brauchen den Logger.
3. **`src/sink/gather.ts`** — Gather-WebSocket-Wrapper. **Höchstes Risiko.** Hier kann am meisten schiefgehen: `global.WebSocket` Setup-Reihenfolge, `subscribeToConnection`-Race, `sendAction`-Schema. **Zuerst** bauen, weil:
   - Wenn der Sink nicht funktioniert, ist das Projekt tot
   - Mit Mock-Source (hardcoded Track im Test-Script) lässt sich der Sink isoliert testen
4. **`src/sources/lastfm.ts`** — Last.fm-Fetcher. **Niedriges Risiko.** REST + Zod, Standard-Pattern. Mit `curl` lässt sich vorher die Response-Shape prüfen, dann Code dazu schreiben.
5. **`src/sources/appleScript.ts`** — AppleScript-Wrapper. **Niedriges-mittleres Risiko.** Korrekte AppleScript-Syntax und Output-Parsing. Manuell mit `osascript -e '...'` testen, dann übernehmen.
6. **`src/sources/chain.ts`** — Komposition. **Trivial.** 15 Zeilen.
7. **`src/loop.ts`** — Polling-Loop. **Mittleres Risiko.** Diff-Logik und SIGTERM-Race sind die interessanten Teile.
8. **`src/index.ts`** — Verdrahtung. **Trivial**, wenn alle Komponenten stehen.
9. **`scripts/plist.template.xml` + `scripts/install-daemon.ts`** — Daemon-Installation. **Mittleres Risiko**, weil launchctl-Kommandos exit-codes haben, die man richtig mappen muss. Erst zum Schluss, weil bis dahin `tsx watch src/index.ts` für End-to-End-Test reicht.
10. **`scripts/uninstall-daemon.ts`** — symmetrisch. **Trivial.**

**Begründung für Sink-First:** Klassischer Build-Order-Fehler ist "von Quelle zu Senke" — man baut Last.fm-Fetcher, dann AppleScript, freut sich über `console.log(track)` — und stellt erst nach 80% Code fest, dass der Gather-Client mit Node-WebSockets im ESM-Kontext zickt. Sink-First eliminiert dieses Risiko in Stunde 1.

**Parallelisierungs-Hinweis:** Schritte 4 und 5 sind unabhängig. Wenn man Lust hat, AppleScript zuerst — beide unproblematisch.

## Scaling Considerations

Trifft auf einen Single-User-Daemon nicht zu. Trotzdem zur Vollständigkeit:

| Scale | Architektur-Anpassung |
|---|---|
| 1 User (heute) | Aktuelle Architektur. Funktioniert. |
| 10 User auf 10 Macs | Kein Refactoring — jeder läuft seine eigene Instanz. Plist-Templating bleibt gleich. |
| 100 User | Ab hier macht eine Cloud-Variante Sinn — aber dann ist es nicht mehr **diese** Bridge, sondern Spotify-Style "Gather Connect". Out of Scope. |

### Was bricht zuerst, falls überhaupt

1. **NepTunes wird eingestellt:** Last.fm-Source liefert dauerhaft `null`, Fallback-Pfad wird zum Hot-Path. AppleScript ist langsamer (~200 ms vs. 50 ms HTTP) und braucht Music.app im Vordergrund-Prozess (egal? evtl.). Reaktion: Polling-Intervall hoch auf 15 s, fertig.
2. **Apple ändert AppleScript-Schema von Music.app:** AppleScript-Source wirft, Last.fm fängt ab. Bei Last.fm-Outage gleichzeitig: Status leer. Reaktion: AppleScript-Code anpassen, bauen, deployen. Single-User-Tool — kein Drama.
3. **Gather migriert auf neue WS-API:** `gather-game-client@43` ist seit 2 Jahren ohne Update. Möglich, dass Gather irgendwann das Protokoll bricht. Reaktion: Pflege-Aufwand, kein Architektur-Problem.

## Anti-Patterns

### Anti-Pattern 1: Source-Calls im selben Tick parallelisieren

**Was Leute tun:** `Promise.all([lastfm(), appleScript()])` → "schneller!"

**Warum falsch:**
- Apple Music wird unnötig per AppleScript abgefragt, auch wenn Last.fm valide Daten liefert. AppleScript-IPC ist zwar schnell, aber Music.app cooperative-frontend-active ist eine Zustandsmaschine, die man nicht 8640× pro Tag stochern muss.
- Bei beiden Hits muss man "welcher gewinnt"-Logik bauen — die Source-Chain-Idee ist genau "primär gewinnt".

**Stattdessen:** Sequenzielle Chain mit Early-Return.

### Anti-Pattern 2: `.env`-Werte in der Plist hardcoden

**Was Leute tun:** Beim Setup `LASTFM_API_KEY=xxx` direkt in `<EnvironmentVariables>` schreiben.

**Warum falsch:**
- Plist-Datei kommt in TimeMachine-Backups als Klartext.
- Plist ändern = `bootout` + `bootstrap`. Die `.env` ändern = `vim .env` + `launchctl kickstart` (oder einfach abwarten bis nächster Auto-Restart).
- Mehrere Daemons zu betreiben würde duplizierte Secrets in N Plists bedeuten.

**Stattdessen:** `.env` aus `WorkingDirectory` per `dotenv` laden.

### Anti-Pattern 3: Status auf jeden Tick neu setzen

**Was Leute tun:** Loop ruft `sink.setStatus(track)` jede 10 s, auch wenn der Track gleich geblieben ist.

**Warum falsch:**
- Gather-API zwar nicht streng rate-limited für `setEmojiStatus`, aber 8640 unnötige WebSocket-Frames pro Tag sind Lärm.
- Logs werden unbrauchbar — jede Zeile sagt "set status: Artist – Track", ohne erkennen zu lassen, ob etwas Neues passiert.
- Wenn Gather mal bei 50% der Calls einen Re-Connect machen muss, hat man künstliche Last.

**Stattdessen:** Diff-Key in der Loop, `setStatus` nur bei Wechsel.

### Anti-Pattern 4: Daemon-Code im Install-Script

**Was Leute tun:** `npm run install-daemon` macht nicht nur Plist-Setup, sondern dependet auf `dist/`-Build und ruft `tsc` rein und ist eine Halbe Build-Pipeline.

**Warum falsch:**
- Vermischt Build (CI-/Lokal-Concern) mit Deploy (User-Setup-Concern).
- Bei jeder Code-Änderung muss man `install-daemon` neu laufen lassen, statt einfach `npm run build` und `launchctl kickstart`.

**Stattdessen:** `install-daemon` macht ausschließlich Plist-Generierung und launchctl-bootstrap. Der User ruft `npm run build` selbst, oder das `prebuild`-Hook in `package.json` macht's vor `install-daemon` automatisch.

### Anti-Pattern 5: Rotation-Logik im Daemon

**Was Leute tun:** `pino`-Streams mit `pino-rotating-file-stream` plus eigener Rotation.

**Warum falsch:**
- Single-User-Daemon mit moderater Log-Rate. Die Logfile bleibt ein Jahr lang einstellig MB.
- macOS hat `newsyslog` für Log-Rotation, das man auf `~/Library/Logs/gather-bridge.*` ansetzen könnte — aber selbst das ist Overkill.

**Stattdessen:** Plain stderr -> Datei. Wenn jemals Rotation nötig: 5-Zeilen-cron-Script.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Last.fm `getRecentTracks` | HTTPS GET, JSON, Zod-validated, 5s timeout | Rate-Limit 5 req/sec — bei 10s-Polling unkritisch |
| Apple Music (`Music.app`) | AppleScript via `run-applescript` | Music.app muss laufen; Daemon spawnt `osascript` als Child-Process |
| Gather Space | WebSocket via `@gathertown/gather-game-client@43` | `global.WebSocket = isomorphic-ws` Pflicht; Reconnect-Verhalten der Lib unklar — defensive `connected`-Flag im Sink |
| launchd | XML Plist + `launchctl bootstrap`/`bootout`/`kickstart` | User-Domain `gui/$(id -u)`, Plist in `~/Library/LaunchAgents/` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Loop ↔ Source-Chain | sync interface, awaitable `getNowPlaying()` | Loop kennt nur Interface, nicht Source-Implementations |
| Source-Chain ↔ einzelne Sources | sequenzielles try-loop, Errors gefangen | Chain wandelt Source-Errors in `null` (nächste Source) |
| Loop ↔ Sink | awaitable `setStatus` / `clearStatus` | Sink macht intern Connect-Lazy, Loop wartet nicht auf "ready" |
| Index ↔ Loop | `runLoop({ ..., signal })` | Single-call, never-returns-bis-abort. Errors innerhalb eines Ticks bleiben in der Loop. |
| Index ↔ Sink (für Shutdown) | `sink.clearStatus()` direkt im SIGTERM-Handler | Race mit 5s-Timeout, nicht abhängig von `runLoop` |

## Verification Notes

- **launchd `EnvironmentVariables` vs `.env`:** Standard-Empfehlung der macOS-Doku ist EnvironmentVariables in der Plist. **Aber** für Secrets ist Plist im User-`Library`-Pfad nicht ideal. `dotenv` aus `WorkingDirectory` ist die Praxis-bewährte Lösung in Node-Projekten und in Referenz-Repos. [HIGH — beide Pfade funktionieren mechanisch, Empfehlung basiert auf Hygiene-Argumenten]
- **`setInterval` vs rekursives `setTimeout`:** Standard-Node-Idiom. `setInterval`-Drift und Overlap-Risk sind dokumentierte Probleme; rekursives `setTimeout` ist die Production-Empfehlung der Node-Community. [HIGH]
- **Gather Game-Client Reconnect-Verhalten:** Der Client macht intern Reconnects bei WS-Drops, aber das exakte Verhalten ist nicht in der TypeDoc dokumentiert (Lib seit 2 Jahren ohne Updates). Der `subscribeToConnection`-Callback feuert bei State-Wechseln. **Defensive Annahme:** Sink trackt selbst `connected`, ruft bei `false` einen `connect()`-Retry. [MEDIUM — Verhalten via `mod-spotify-as-status`-Codebase und Lib-Source verifiziert, aber kein offizielles Reconnect-Doku]
- **`Game.disconnect()`:** Public API hat kein dokumentiertes `disconnect()`. Beim Process-Exit wird die WS vom Node-Process geschlossen, das reicht für Gather (Server merkt connection drop). [MEDIUM]
- **launchd `ExitTimeOut` Default:** 20 s laut Apple-Doku, aber bei manchen launchd-Versionen 30 s. 5 s eigener Cleanup-Timeout liegt **deutlich** drunter, also kein Risiko. [HIGH]

## Sources

- [Stack-Recherche `.planning/research/STACK.md`](./STACK.md) — Versionen, Lib-Setup, Plist-Skelett
- [HowTo: Set an Environment Variable in launchd.plist](https://www.dowdandassociates.com/blog/content/howto-set-an-environment-variable-in-mac-os-x-launchd-plist/) — bestätigt EnvironmentVariables-Pattern [HIGH]
- [launchd.info Tutorial](https://www.launchd.info/) — kanonische Plist-Reference [HIGH]
- [Apple Developer Forums: launchctl env](https://developer.apple.com/forums/thread/681550) — Hintergrund zu `launchctl setenv` Limitationen [MEDIUM]
- [Why setInterval Can Break Your App (DEV)](https://dev.to/silentwatcher_95/why-settimeout-returns-an-object-in-nodejs-and-why-setinterval-can-break-your-app-4jlj) — Drift- und Overlap-Argumentation [HIGH]
- [Repeated Events: Timeout or Interval (reallifejs)](https://reallifejs.com/brainchunks/repeated-events-timeout-or-interval/) — Polling-Pattern-Vergleich [HIGH]
- [Node.js Timers Doc](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick) — offiziell zu Timer-Refs und Process-Keep-Alive [HIGH]
- [gathertown/mod-spotify-as-status](https://github.com/gathertown/mod-spotify-as-status) — Referenz für Sink-Patterns, Game-Client-Setup-Reihenfolge [HIGH]

---
*Architecture research for: Local macOS Node.js Daemon — Apple Music to Gather Status Bridge*
*Researched: 2026-05-08*
