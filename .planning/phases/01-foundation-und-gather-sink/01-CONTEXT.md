---
phase: 1
phase_name: Foundation und Gather-Sink
gathered: 2026-05-08
status: ready_for_planning
mode: auto-generated (skip_discuss=true)
---

# Phase 1: Foundation und Gather-Sink — Context

<domain>
## Phase Boundary

**Goal:** Bridge kann sich mit echtem Gather-Space verbinden und einen hardcoded Track-Status setzen oder leeren, mit Secrets aus `.env` und redacted Logs.

**Requirements (9):** SINK-01, SINK-02, SINK-03, SINK-04, SINK-05, CFG-01, CFG-02, CFG-03, CFG-04

**Success Criteria:**
1. Im Gather-Space erscheint nach Smoke-Test-Run das Emoji `♫` plus Statustext `Artist – Track`, beim Stoppen wird der Status geleert.
2. `.env` mit `LASTFM_API_KEY`, `LASTFM_USER`, `GATHER_API_KEY`, `GATHER_SPACE_ID` lädt sauber, fehlende Variablen führen zu `process.exit(0)` mit klarer Fehlermeldung.
3. `.gitignore` ist im allerersten Commit enthalten und schließt `.env`, `dist/`, `node_modules/`, `*.log` aus, `.env.example` ist committet.
4. Pino-Logs zeigen niemals den `GATHER_API_KEY` oder `LASTFM_API_KEY` im Klartext (Redaction aktiv).
5. Polyfill `globalThis.WebSocket = WS` wird vor dem ersten Game-Client-Import gesetzt.
</domain>

<decisions>
## Implementation Decisions (Locked)

Aus CLAUDE.md (Tech-Stack-Recherche) und PROJECT.md sind folgende Entscheidungen gelockt:

- **Runtime:** Node.js 22 LTS
- **Sprache:** TypeScript 5.7.x
- **ESM:** `"type": "module"` in package.json (run-applescript ist ESM-only)
- **Dev-Runner:** `tsx@4.21` (kein ts-node)
- **Build:** `tsc -p .` nach `dist/`
- **Gather-Client:** `@gathertown/gather-game-client@43.0.1` (WebSocket, nicht HTTP)
- **WebSocket-Polyfill:** `isomorphic-ws@5` + `ws@8`
- **Config-Loader:** `dotenv@17` + `zod@4` für Validation
- **Logger:** `pino@10` mit Redaction für `GATHER_API_KEY`, `LASTFM_API_KEY`
- **Package-Manager:** `npm` (kein pnpm/yarn)

### Module-Layout

- `src/types.ts` — Shared `NowPlaying = { artist: string, track: string } | null`
- `src/config.ts` — Zod-Schema, lädt `.env`, exited bei Fehlern mit code 0
- `src/logger.ts` — Pino-Instanz mit Redaction
- `src/setup-ws.ts` — Side-Effect-Modul: `globalThis.WebSocket = WS`
- `src/sink/gather.ts` — `GatherSink`-Klasse mit `connect()`, `setStatus(np)`, `clearStatus()`, `disconnect()`
- `scripts/test-sink.ts` — Smoke-Test: connect → setStatus(hardcoded) → wait 5s → clearStatus → disconnect

### Smoke-Test-Flow

1. Test-Script läuft als `npx tsx scripts/test-sink.ts`
2. Setzt Status `♫ Daft Punk – Around the World` für 10 Sekunden
3. Räumt Status auf, exited mit 0
4. Manueller Check im Gather-Browser-Tab: Status erscheint und verschwindet
</decisions>

<code_context>
## Existing Code

Keine. Greenfield-Projekt — nur `.planning/` und `CLAUDE.md` existieren.

## Repo-Setup-Punkte

- `.gitignore` als allererster Schritt (vor `npm init`)
- `.env.example` mit allen 4 Keys ohne Werte
- `tsconfig.json` mit `module: "NodeNext"`, `target: "ES2022"`, `strict: true`
- `package.json` Scripts: `dev` (tsx watch src/index.ts), `build` (tsc -p .), `start` (node dist/index.js), `test:sink` (tsx scripts/test-sink.ts)
</code_context>

<specifics>
## Specific Notes (aus CLAUDE.md + PITFALLS-Recherche)

- **WebSocket-Polyfill-Pflicht:** `globalThis.WebSocket` muss gesetzt sein, **bevor** `@gathertown/gather-game-client` importiert wird. Lösung: separates `setup-ws.ts`-Modul, das als ALLERERSTER Import in `gather.ts` (und Smoke-Test) erscheint. Static-import-hoisting ist deterministisch — Side-Effect läuft vor Game-Client-Konstruktor.
- **Config-Failure exit(0):** Bei fehlenden Env-Vars darf der Daemon NICHT mit Exit-Code 1 sterben. Sonst restartet launchd in Endlosschleife (auch wenn KeepAlive nur bei Crashed=true triggert, ist exit(0) defensiver — siehe Phase 4 Constraint DMN-02).
- **GatherSink-Lifecycle:** `gather-game-client@43` hat `subscribeToConnection`-Callback. In Phase 1 nutze ich nur `connect()` + warte auf Connected-Event, dann `setEmojiStatus`/`setTextStatus`. Reconnect-Logik kommt erst in v2 (out of scope für Phase 1).
- **Pino-Redaction:** `redact: { paths: ['env.GATHER_API_KEY', 'env.LASTFM_API_KEY', '*.GATHER_API_KEY', '*.LASTFM_API_KEY'], censor: '[REDACTED]' }` — defensiv mit Wildcards.
- **Status-Format v1:** `Artist – Track` (Gedankenstrich `–` U+2013, NICHT Bindestrich, gemäß CLAUDE.md-Schreibregel "keine Schrägstriche oder Gedankenstriche als Trennzeichen" gilt für Prosa, nicht für Track-Anzeige).
  - **KORREKTUR:** CLAUDE.md sagt "keine Schrägstriche (/) oder Gedankenstriche (–) als Trennzeichen". Daher Format: `Artist - Track` mit normalem Bindestrich, oder `Artist | Track`. Plan-Phase entscheidet final.
</specifics>

<deferred>
## Deferred to Later Phases

- Source-Chain (Last.fm + AppleScript) → Phase 2
- Polling-Loop, SIGTERM-Handler, Track-Diff → Phase 3
- launchd-Plist, Install/Uninstall-Scripts → Phase 4
- Reconnect-Logik, Heartbeat → v2
- Status-Längen-Cap, Format-Templates → v2
</deferred>
