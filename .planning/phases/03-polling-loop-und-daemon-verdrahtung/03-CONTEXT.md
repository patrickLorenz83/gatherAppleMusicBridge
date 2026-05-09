---
phase: 3
phase_name: Polling-Loop und Daemon-Verdrahtung
gathered: 2026-05-08
status: ready_for_planning
mode: auto-generated (skip_discuss=true)
---

# Phase 3: Polling-Loop und Daemon-Verdrahtung — Context

<domain>
## Phase Boundary

**Goal:** Daemon läuft im Foreground (`tsx src/index.ts`) als End-to-End-Bridge: alle 10 Sekunden pollen, bei Track-Wechsel Status setzen, bei Pause leeren, sauberer Shutdown bei SIGTERM/SIGINT.

**Requirements (5):** LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05

**Success Criteria:**
1. Während Music.app spielt, aktualisiert sich der Gather-Status innerhalb von ~10-15 Sekunden bei Track-Wechsel; bei gleichbleibendem Track wird kein redundantes setStatus gesendet.
2. Wenn Apple Music pausiert wird, ist der Gather-Status innerhalb eines Polling-Tick leer.
3. Ein einzelner Last.fm-503 oder AppleScript-Permission-Fehler crasht den Daemon nicht — der nächste Tick läuft normal weiter.
4. Ctrl-C im Foreground oder `kill -TERM <pid>` führt zu sauberem Shutdown: Status wird mit 5s-Timeout-Race geleert, Prozess exited mit 0.
5. Eine unhandled Promise Rejection oder uncaughtException schreibt einen synchronen Last-Word-Log (via `pino.final()`), bevor der Prozess terminiert — kein stiller Tod.
</domain>

<decisions>
## Implementation Decisions (Locked)

- **Loop-Pattern:** Rekursives `setTimeout` mit `AbortController` (NICHT `setInterval`). Begründung: setInterval überlappt bei langen Tasks, setTimeout-Recursion garantiert sequentielle Ticks. AbortController erlaubt sauberen Cancel beim Shutdown.
- **Track-Diff-Key:** `${artist}|${track}` (lowercase, trimmed). Composite-Key prevents false-positive on case-changes (z.B. "Daft Punk" → "DAFT PUNK").
- **Polling-Intervall:** 10 Sekunden hardcoded (kein Env-Var in v1; QOL-Erweiterung in v2).
- **Tick-Try/Catch:** Jeder Tick komplett umschlossen. Single source-error oder sink-error → log + skip-tick, kein Daemon-Crash.
- **SIGTERM/SIGINT-Handler:** `process.on('SIGTERM')` und `process.on('SIGINT')` registrieren. Beide rufen `shutdown(signal)`. Shutdown:
  1. AbortController abort → laufender Tick wird beim nächsten check abgebrochen
  2. Promise.race([sink.clearStatus + sink.disconnect, sleep(5_000)]) — 5s-Timeout-Race
  3. `process.exit(0)`
- **`unhandledRejection` und `uncaughtException`:** beide via `pino.final()` synchron loggen, dann `process.exit(1)` (Crash → launchd kann später entscheiden — Phase 4).

### Module-Layout

- `src/loop.ts` — `runLoop(sink, getNowPlaying, abortController)` mit Recursive-setTimeout
- `src/diff.ts` — `nowPlayingKey(np: NowPlaying)` → string|null
- `src/index.ts` — Entrypoint: connect sink → register handlers → start loop
- Erweitere `src/sink/gather.ts` falls nötig: bestehender `disconnect()` ist async (aus Phase 1 Deviation), passt für SIGTERM-Race

### Loop-Flow (Pseudocode)

```typescript
async function runLoop(sink, getNowPlaying, abort) {
  let lastKey: string | null = null;
  
  async function tick() {
    if (abort.signal.aborted) return;
    try {
      const np = await getNowPlaying();
      const key = nowPlayingKey(np);
      if (key !== lastKey) {
        if (np === null) sink.clearStatus();
        else sink.setStatus(np);
        lastKey = key;
        log.info({ from: lastKey, to: key }, "[loop] track changed");
      }
    } catch (err) {
      log.error({ err }, "[loop] tick failed");
    }
    if (!abort.signal.aborted) {
      setTimeout(tick, 10_000);
    }
  }
  
  tick();
}
```

### Shutdown-Flow

```typescript
async function shutdown(signal: string, abort: AbortController, sink: GatherSink) {
  log.info({ signal }, "[shutdown] received");
  abort.abort();
  try {
    await Promise.race([
      (async () => {
        sink.clearStatus();
        await sink.disconnect();
      })(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("shutdown timeout")), 5_000)),
    ]);
  } catch (err) {
    log.warn({ err }, "[shutdown] cleanup did not complete in 5s");
  }
  process.exit(0);
}
```

### Last-Word-Log

```typescript
const finalLog = pino.final(log);
process.on("unhandledRejection", (reason) => {
  finalLog.fatal({ reason }, "[fatal] unhandled rejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  finalLog.fatal({ err }, "[fatal] uncaught exception");
  process.exit(1);
});
```
</decisions>

<code_context>
## Existing Code (aus Phase 1+2)

**Phase 1:** `src/types.ts`, `src/config.ts`, `src/logger.ts`, `src/setup-ws.ts`, `src/sink/gather.ts` (mit async `disconnect()`), `scripts/test-sink.ts`

**Phase 2:** `src/sources/types.ts`, `src/sources/lastfm.ts`, `src/sources/applescript.ts`, `src/sources/chain.ts` mit `getNowPlaying(): Promise<NowPlaying>`

Verfügbar:
- `getNowPlaying()` — Source-Chain
- `new GatherSink(spaceId, apiKey)` — Sink
- `sink.connect()`, `sink.setStatus(np)`, `sink.clearStatus()`, `sink.disconnect()` (async!)
- `log` — pino mit Redaction
- `config` — alle 4 Env-Vars validiert
</code_context>

<specifics>
## Specific Notes

- **AbortController + setTimeout:** Wenn `abort.signal.aborted === true`, NICHT mehr `setTimeout(tick, ...)` registrieren. Beim Shutdown nach abort wird der bereits laufende Timer ggf. via `clearTimeout` aufgeräumt — aber einfacher: Timer-Handle speichern und beim shutdown clearTimeout.
- **Pino Final-Log:** `pino.final(log)` liefert einen sync-flushed-logger. Bei `pino` mit Standard-stdout (synchroner sink) ist das overkill, aber defensiv für Phase 4 (launchd routet zu Datei via async sink).
- **Shutdown-Race-Pattern:** 5s ist großzügig — Gather-Disconnect sollte in <2s erfolgen. Falls Gather-WSS hängt, bricht der Race ab und exit(0) trotzdem.
- **`process.exit(0)` nach Shutdown:** Auch bei Cleanup-Fehler exit(0) — wir wollen NICHT, dass launchd in Phase 4 als Crashed wertet.
- **`process.exit(1)` bei unhandled Rejection/Exception:** Hier gewünscht — launchd entscheidet via KeepAlive-Strategy ob Restart (Crashed=true triggert Restart). Phase-4-Konstrukt.

### Status-Format

Wir nutzen die Phase-1-Sink-API: `sink.setStatus({artist, track})`. Das Format `♫ Artist – Track` macht der Sink, NICHT der Loop.

### Track-Diff-Logic

```typescript
function nowPlayingKey(np: NowPlaying): string | null {
  if (np === null) return null;
  return `${np.artist.trim().toLowerCase()}|${np.track.trim().toLowerCase()}`;
}
```

`null` (= nichts spielt) und `"artist|track"` sind die Keys. Vergleich mit `===` gegen `lastKey` deckt alle 4 Übergänge ab:
- null → null: kein Action
- null → key: setStatus
- key → null: clearStatus
- key1 → key2: setStatus (ohne explizit clear)
- key → key (gleich): kein Action (idempotent)
</specifics>

<deferred>
## Deferred to Later Phases

- launchd-Plist mit absolutem `process.execPath` → Phase 4
- TCC-Trigger im Install-Script → Phase 4
- Logs nach `~/Library/Logs/...` → Phase 4 (über Plist-Routing)
- Heartbeat-Status (jede 60s erneut senden, falls Gather-WSS idle stirbt) → v2 (ROBUST-01)
- Reconnect-Logik bei Gather-Trennung → v2 (ROBUST-02)
- Exponential-Backoff bei Source-Fehlern → v2 (ROBUST-03)
- LOG_LEVEL-Env, Status-Längen-Cap → v2 (QOL-*)
</deferred>
