---
phase: 5
phase_name: CDP-Bridge Refactor (Gather 2.0)
gathered: 2026-05-09
status: ready_for_planning
mode: spike-driven (skip_discuss=true)
---

# Phase 5: CDP-Bridge Refactor — Context

<domain>
## Phase Boundary

**Goal:** Bridge funktioniert mit Gather 2.0 (`app.v2.gather.town`). Statt `@gathertown/gather-game-client@43` (Gather 1.0 WS, seit 2023 unmaintained, gegen v2 → 404) nutzt der Sink jetzt Chrome-DevTools-Protocol gegen die lokal laufende GatherV2-Electron-App. Die App ruft selbst die interne `setCustomStatus`-Mutation auf, kein Reverse-Engineering der WS-Protokolle nötig.

**Hintergrund (aus Spike 2026-05-08):**
- Gather hat im September 2025 die v2-Plattform gelauncht. Komplett neuer Backend, UUID-basierte Space-IDs, kein offizielles SDK für Drittanbieter.
- `gather-game-client@43.0.1` letzter Release: 2023-08-16 (Codex und npm-Registry bestätigt).
- Spike-Erkenntnisse:
  - GatherV2 ist eine Electron-App (Electron 40.6.0, app.v2.gather.town als PWA).
  - Beim Start mit `--remote-debugging-port=9222` exposed sie CDP.
  - Im Renderer-Page existiert `window.gatherDev.Repos.gameSpace.currentSpaceUser.setCustomStatus({text, emoji?, clearCondition})`.
  - clearCondition: `{type: "Never"}` oder `{type: "DateTime", clearAt: Date}`.
  - clearCustomStatus() für Reset.
  - Live verifiziert: Status erscheint im UI und ist für andere User sichtbar.
- Schema (verifiziert):
  ```ts
  setCustomStatus({
    text?: string,         // max length: rf.MAX_CUSTOM_STATUS_LENGTH
    emoji?: string,        // unicode emoji, e.g. "🎵"
    clearCondition: {type: "Never"} | {type: "DateTime", clearAt: Date}
  })
  ```

**Success Criteria:**
1. `npm run test:sink` connected zu CDP auf `localhost:9222`, findet die GatherV2-Page und setzt `🎵 Daft Punk – Around the World` als Custom-Status. UI zeigt Emoji-Sticker `🎵` plus Text `Daft Punk – Around the World`.
2. `clearCustomStatus()` leert den Status; UI zeigt keinen Custom-Status mehr.
3. Beim Start prüft die Bridge ob CDP-Port erreichbar ist. Falls nicht: klare Fehlermeldung mit Setup-Hinweis (`open -a GatherV2 --args --remote-debugging-port=9222`), exit(0).
4. `.env` braucht weder `GATHER_API_KEY` noch `GATHER_SPACE_ID`. Beide werden aus der Pflicht-Liste entfernt (App selbst ist authentifiziert).
5. Wenn die GatherV2-App den Space wechselt oder nicht eingeloggt ist (kein `gatherDev`), liefert `setStatus` einen Fehler-Log und überspringt den Tick (kein Crash).
6. Daemon-Reconnect: wenn die App zwischendurch geschlossen wird, polling-loop crasht nicht — beim nächsten Tick wird der Connect erneut versucht.
</domain>

<decisions>
## Implementation Decisions (Locked)

### Tech-Stack-Anpassungen

- **Neu:** `chrome-remote-interface@^0.33.3` als Runtime-Dep (CDP-Client)
- **Entfernt:** `@gathertown/gather-game-client`, `isomorphic-ws`, `ws` (alle nur für Gather 1.0 nötig)
- **`src/setup-ws.ts`** wird gelöscht (kein WebSocket-Polyfill mehr nötig)
- **`src/sink/gather.ts`** wird komplett neu geschrieben (CDP-basiert, gleiche Public-API)

### Config-Anpassungen

- **Pflicht (nur noch):** keine — `.env` kann komplett leer sein (nur LASTFM-Keys optional)
- **`GATHER_API_KEY`** — entfernt (App nutzt eigene Auth)
- **`GATHER_SPACE_ID`** — entfernt (App ist im Space)
- **Optional neu:** `GATHER_CDP_PORT` (Default: 9222), `GATHER_PAGE_URL_FILTER` (Default: `app.v2.gather.town`)

### CDP-Connection-Strategie

- Bridge connected NICHT permanent. Bei jedem `setStatus`/`clearStatus`:
  1. `fetch('http://localhost:CDP_PORT/json')` — list pages
  2. Find target where `url.includes(GATHER_PAGE_URL_FILTER)`
  3. CDP-WS-Connect → `Runtime.enable` → `Runtime.evaluate({expression, awaitPromise: true})`
  4. Close client
- Begründung: persistent Connection = mehr Failure-Modes (CDP-Disconnect bei App-Restart, Race mit Polling-Tick). Per-Call ist robust, Latenz < 200ms ist akzeptabel bei 10s-Polling.

### Pre-Flight-Check

`scripts/check-cdp.ts` (neuer Helper, optional von User aufgerufen):
- Prüft ob CDP-Port erreichbar
- Listet Pages, prüft ob `app.v2.gather.town` Page existiert
- Wenn nicht: druckt Setup-Anleitung

### App-Auto-Start mit Flag (separat)

- **Out-of-Scope für Phase 5:** App-Wrapper-Script oder Plist die GatherV2 mit Flag startet.
- **In Scope:** README-Update mit klarer Setup-Anleitung. User startet App selbst korrekt.
- Optional v2.1 (eigene Phase): macOS-Login-Item das GatherV2 mit Debug-Flag startet.

### Public-API-Kompatibilität

`GatherSink`-Klasse behält dieselbe Public-API wie in Phase 1:
- `connect(): Promise<void>` — pre-flight-check (CDP erreichbar, Page gefunden)
- `setStatus(np): Promise<void>` — async jetzt (vorher sync)
- `clearStatus(): Promise<void>` — async jetzt
- `disconnect(): Promise<void>` — close any open CDP clients (no-op falls per-call)
- `connected: boolean` — getter, true wenn letzter CDP-Check OK

**Effekt auf Phase 3 (`src/loop.ts`, `src/index.ts`):** sehr klein. `setStatus`/`clearStatus` müssen ge-`await`-et werden (waren vorher sync). Loop ist schon `async`, einfach await ergänzen.

### Status-Format

Aus Spike: `emoji` und `text` sind separate Felder.
- emoji: `🎵` (oder anderes passendes Music-Note-Emoji)
- text: `${artist} – ${track}` (Gedankenstrich U+2013, ohne ♫-Prefix mehr)
- clearCondition: `{type: "Never"}` (Bridge cleart aktiv via clearCustomStatus, kein Auto-Clear)

### Error-Resilience

- CDP-Connect-Fehler (Port nicht offen, keine matching Page): log.warn, return ohne setzen. Caller (Loop) macht beim nächsten Tick neu. Kein Throw.
- `gatherDev` undefined (z.B. App ist auf Login-Page): log.warn, return.
- `setCustomStatus`-Throw (z.B. Permission-Fehler): log.warn, return.
- Top-Level Try/Catch um jeden Sink-Call.

### Smoke-Test Aktualisierung

`scripts/test-sink.ts` (existiert):
- Statt `new GatherSink(spaceId, apiKey)` → `new GatherSink(cdpConfig)` mit optional port + url-filter
- Nach `connect()` setzt es `{artist: "Daft Punk", track: "Around the World"}` mit emoji `🎵`
- Wartet 10s
- `clearStatus()`
- Disconnect + exit(0)
</decisions>

<code_context>
## Existing Code (alle Phasen 1-4)

### Wird komplett ersetzt
- `src/sink/gather.ts` — neue CDP-Implementierung
- `src/setup-ws.ts` — wird gelöscht

### Wird angepasst
- `src/config.ts` — entferne GATHER_API_KEY und GATHER_SPACE_ID Pflicht; ergänze optionale CDP-Settings
- `package.json` — Deps tauschen
- `scripts/test-sink.ts` — neue Sink-Konstruktor-Signatur, async clear/disconnect
- `src/index.ts` — minimal, nur await bei Sink-Calls falls noch nötig
- `src/loop.ts` — minimal, await sicherstellen
- `README.md` — Setup-Anweisungen für GatherV2-Flag

### Bleibt unverändert
- `src/types.ts`
- `src/logger.ts`
- `src/diff.ts`
- `src/sources/*` (Last.fm, AppleScript, Chain — alles unabhängig vom Sink)
- `scripts/install-daemon.ts`, `scripts/uninstall-daemon.ts` (launchd ist Sink-agnostisch)
- `scripts/lib/plist.ts`
</code_context>

<specifics>
## Concrete Code-Skeletons

### `src/sink/gather.ts` (neue Implementierung)

```typescript
import CDP from "chrome-remote-interface";
import type { NowPlaying } from "../types.js";
import { log } from "../logger.js";

interface CDPConfig {
  port: number;          // default 9222
  pageUrlFilter: string; // default "app.v2.gather.town"
}

export class GatherSink {
  private cfg: CDPConfig;
  private _connected = false;

  constructor(cfg: Partial<CDPConfig> = {}) {
    this.cfg = {
      port: cfg.port ?? 9222,
      pageUrlFilter: cfg.pageUrlFilter ?? "app.v2.gather.town",
    };
  }

  get connected() { return this._connected; }

  async connect(): Promise<void> {
    // Pre-flight check
    const targets = await this.fetchTargets();
    const page = targets.find(t => t.type === "page" && t.url.includes(this.cfg.pageUrlFilter));
    if (!page) {
      throw new Error(
        `[gather] no GatherV2 page found at localhost:${this.cfg.port}. ` +
        `Start the app with: open -a GatherV2 --args --remote-debugging-port=${this.cfg.port}`
      );
    }
    this._connected = true;
    log.info({ port: this.cfg.port, pageUrl: page.url }, "[gather] CDP pre-flight OK");
  }

  async setStatus(np: NonNullable<NowPlaying>): Promise<void> {
    const expr = `gatherDev.Repos.gameSpace.currentSpaceUser.setCustomStatus({` +
      `emoji: ${JSON.stringify("🎵")}, ` +
      `text: ${JSON.stringify(`${np.artist} – ${np.track}`)}, ` +
      `clearCondition: {type: "Never"}` +
    `})`;
    await this.runInPage(expr);
    log.info({ artist: np.artist, track: np.track }, "[gather] status set via CDP");
  }

  async clearStatus(): Promise<void> {
    await this.runInPage(`gatherDev.Repos.gameSpace.currentSpaceUser.clearCustomStatus()`);
    log.info("[gather] status cleared via CDP");
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  // --- internals ---
  private async fetchTargets(): Promise<Array<{type:string,url:string,webSocketDebuggerUrl:string}>> {
    const res = await fetch(`http://localhost:${this.cfg.port}/json`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`CDP /json HTTP ${res.status}`);
    return await res.json() as any;
  }

  private async runInPage(expression: string): Promise<void> {
    const targets = await this.fetchTargets();
    const page = targets.find(t => t.type === "page" && t.url.includes(this.cfg.pageUrlFilter));
    if (!page) throw new Error("[gather] no GatherV2 page available (app not running or not in space)");
    
    const client = await CDP({ target: page.webSocketDebuggerUrl });
    try {
      const { Runtime } = client;
      await Runtime.enable();
      const r = await Runtime.evaluate({ expression: `(async () => { ${expression}; })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        throw new Error(`[gather] runInPage failed: ${r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)}`);
      }
    } finally {
      await client.close().catch(() => {});
    }
  }
}
```

### Setup-Hinweis im README

```bash
# GatherV2 muss mit Debug-Flag laufen — entweder einmalig manuell:
open -a GatherV2 --args --remote-debugging-port=9222

# Oder als Login-Item: System Settings → General → Login Items → +
# und das Aliase mit Custom-Args setzen (komplizierter, aktuell out-of-scope).
```

### Optional Helper: `scripts/check-cdp.ts`

```typescript
const port = process.env.GATHER_CDP_PORT ?? "9222";
const filter = process.env.GATHER_PAGE_URL_FILTER ?? "app.v2.gather.town";
try {
  const r = await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(2000) });
  if (!r.ok) throw new Error(`CDP HTTP ${r.status}`);
  const targets = await r.json() as any[];
  const page = targets.find(t => t.type === "page" && t.url.includes(filter));
  if (!page) {
    console.error(`❌ CDP läuft, aber keine GatherV2-Page (${filter}) offen. Bist du eingeloggt im Space?`);
    process.exit(1);
  }
  console.log(`✅ GatherV2-Page erreichbar: ${page.url}`);
  process.exit(0);
} catch (e: any) {
  console.error(`❌ CDP nicht erreichbar auf localhost:${port}.`);
  console.error(`   Starte GatherV2 mit: open -a GatherV2 --args --remote-debugging-port=${port}`);
  console.error(`   Detail: ${e.message}`);
  process.exit(1);
}
```
</specifics>

<deferred>
## Deferred to Later (v2.1)

- **Auto-Start GatherV2 mit Flag** als Login-Item oder Wrapper-Script
- **Persistent CDP-Connection** mit Reconnect-Logic (statt per-call)
- **Multi-Space-Support:** zwischen Spaces wechseln (aktuell: nur ein Space, der gerade in der App offen ist)
- **CDP-Health-Check** im Polling-Loop (z.B. periodisch prüfen ob `gatherDev` noch da ist)
</deferred>
