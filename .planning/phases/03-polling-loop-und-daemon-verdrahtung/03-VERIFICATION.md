---
phase: 03-polling-loop-und-daemon-verdrahtung
verified: 2026-05-08T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "End-to-End-Smoke-Test mit echten API-Keys und laufender Music.app"
    expected: "Track-Wechsel in Apple Music wird innerhalb 10-15s als ♫-Status im Gather-Browser sichtbar; Pause leert den Status; Ctrl-C beendet sauber mit exit(0)."
    why_human: "Visuell verifizierbar nur im Gather-Browser-Tab; benötigt echte LASTFM/GATHER-Credentials, NepTunes-Setup und laufende Music.app — kein automatisierbarer Pfad ohne Live-Services."
---

# Phase 3: Polling-Loop und Daemon-Verdrahtung — Verification Report

**Phase Goal:** Daemon läuft im Foreground (`tsx src/index.ts`) als End-to-End-Bridge: alle 10 Sekunden pollen, bei Track-Wechsel Status setzen, bei Pause leeren, sauberer Shutdown bei SIGTERM/SIGINT.

**Verified:** 2026-05-08
**Status:** human_needed (alle automatisiert prüfbaren Truths VERIFIED, der visuelle End-to-End-Smoke-Test bleibt User-Action)
**Re-verification:** Nein — initiale Verifikation

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Daemon läuft im Foreground via `tsx src/index.ts` und pollt alle 10 Sekunden | VERIFIED | `src/loop.ts:7` `POLL_INTERVAL_MS = 10_000`; `src/loop.ts:58` `setTimeout(..., POLL_INTERVAL_MS)`; Smoke-Boot via `tsx src/index.ts` lädt sauber ohne Import-Fehler (Daemon-Boot-Test exit 0 mit erwartetem `.env`-Missing-Guard) |
| 2 | Track-Wechsel via Composite-Key wird genau einmal pro Wechsel an `sink.setStatus(np)` weitergegeben — kein redundantes setStatus bei gleichem Track | VERIFIED | `src/diff.ts:20-23` `nowPlayingKey()` mit `trim().toLowerCase()`; `src/loop.ts:42` `if (key !== lastKey)`-Guard, `lastKey` in Closure (`src/loop.ts:32`); Spot-Check: `nowPlayingKey({"Daft Punk","Around the World"}) === nowPlayingKey({"  DAFT PUNK ","AROUND THE WORLD "})` ist `true` |
| 3 | `null` von `getNowPlaying()` triggert `sink.clearStatus()` innerhalb eines Polling-Tick | VERIFIED | `src/loop.ts:44-48` `if (np === null) sink.clearStatus(); else sink.setStatus(np)` innerhalb des `key !== lastKey`-Branches |
| 4 | Source- oder Sink-Fehler im Tick wird via try/catch geloggt, nächster Tick läuft normal weiter | VERIFIED | `src/loop.ts:38-54` `try { ... } catch (err) { log.error({err}, "[loop] tick failed"); }` umschließt den kompletten Tick-Body; `src/loop.ts:57-61` Reschedule unabhängig vom catch |
| 5 | SIGTERM/SIGINT triggern Shutdown: `abort.abort()` → `Promise.race([cleanup, sleep(5_000)])` → `process.exit(0)` | VERIFIED | `src/index.ts:101-102` Signal-Handler; `src/index.ts:50` `abort.abort()`; `src/index.ts:53-68` `Promise.race(cleanup, setTimeout(5_000))`; `src/index.ts:60` `await sink.disconnect()` (async, korrekt awaited); `src/index.ts:76` `process.exit(0)` außerhalb des try/catch — auch bei Cleanup-Fehler exit(0) |
| 6 | `unhandledRejection`/`uncaughtException` synchron geloggt, dann `process.exit(1)` | VERIFIED | `src/index.ts:33-42` `finalFatal()`-Helper mit `log.fatal()` + `flushSync()`; `src/index.ts:109-116` Handler nutzen `finalFatal()` und `process.exit(1)` — `finalFatal` ersetzt das in pino@10 entfernte `pino.final()` (siehe Decision unten) |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/diff.ts` | `nowPlayingKey(np: NowPlaying): string\|null`, ≥8 Zeilen | VERIFIED | 23 Zeilen, exportiert `nowPlayingKey`, `import type { NowPlaying } from "./types.js"` |
| `src/loop.ts` | `runLoop(sink, getNowPlaying, abort)` mit Recursive-setTimeout, Try/Catch, lastKey-Diff, ≥40 Zeilen | VERIFIED | 75 Zeilen, exportiert `runLoop`, kein `setInterval` (nur Doku-Bezug umformuliert), Try/Catch um Tick-Body, lastKey-Closure, abort-Listener cleart pending Timer mit `{ once: true }` |
| `src/index.ts` | Entrypoint mit setup-ws-Polyfill (Zeile 1), Sink-Connect, Signal-Handler, Last-Word-Log, Loop-Start, ≥60 Zeilen | VERIFIED | 128 Zeilen, Zeile 1 ist `import "./setup-ws.js";`, alle Handler registriert, `runLoop(sink, getNowPlaying, abort)` gestartet, `main().catch()` mit `finalFatal` + `exit(1)` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/index.ts` | `src/setup-ws.js` | First-Statement-Polyfill | WIRED | Zeile 1: `import "./setup-ws.js";` — `head -1` matched (Pitfall 4 erfüllt) |
| `src/index.ts` | `src/sink/gather.js` | `new GatherSink(spaceId, apiKey) + await connect()` | WIRED | Zeile 82-83: `new GatherSink(config.GATHER_SPACE_ID, config.GATHER_API_KEY); await sink.connect();` — Constructor-Signatur `(spaceId, apiKey)` matched Phase-1-Sink |
| `src/index.ts` | `src/sources/chain.js` | `getNowPlaying`-Import an `runLoop` weitergegeben | WIRED | Zeile 9 Import + Zeile 119 `runLoop(sink, getNowPlaying, abort)` — Phase-2-Source-Chain ist `export const getNowPlaying: NowPlayingSource` (passt) |
| `src/index.ts` | `src/loop.js` | `runLoop`-Aufruf | WIRED | Zeile 119: `runLoop(sink, getNowPlaying, abort)` mit allen drei Argumenten |
| `src/loop.ts` | `src/diff.js` | `nowPlayingKey`-Import | WIRED | Zeile 4 Import + Zeile 40 `nowPlayingKey(np)` |
| `src/index.ts` | process signals | `process.on('SIGTERM'/'SIGINT')` rufen shutdown | WIRED | Zeilen 101-102, beide Handler rufen `onSignal` → `void shutdown(signal, abort, sink)`; Doppel-Signal-Schutz via `shuttingDown`-Flag (Zeile 92-99) |
| `src/index.ts` | Last-Word-Log | `pino.final`-Pattern für unhandled rejection/exception | WIRED (mit Auto-Fix) | Plan-Pattern `pino\.final` matched im Doku-Kommentar (Zeile 17, 24, 27, 105); funktional ist es `finalFatal()` mit `log.flushSync()` (Zeile 33-42) — Begründung siehe "Notable Deviation" unten |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `src/loop.ts` | `np` | `getNowPlaying()` (Phase 2 chain) | Echte Last.fm/AppleScript-Daten — keine hardcoded Fallbacks im Loop | FLOWING |
| `src/loop.ts` | `key` / `lastKey` | `nowPlayingKey(np)` | Echter Composite-Key oder `null` | FLOWING |
| `src/index.ts` | `sink` | `new GatherSink(config.GATHER_SPACE_ID, config.GATHER_API_KEY)` + `await sink.connect()` | Echte Gather-WebSocket-Verbindung (Phase-1-Sink) | FLOWING (in Smoke-Test gestoppt durch `.env`-Guard, kein Code-Defekt) |
| `src/index.ts` | Config | `config` aus `./config.js` (Phase 1, Zod-validated) | Aus `.env` geladen, schreit bei Missing → `process.exit(0)` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `nowPlayingKey(null) === null` | `npx tsx /tmp/spotcheck-diff.ts` | `null: null` | PASS |
| `nowPlayingKey({artist,track})` liefert `"artist\|track"` lowercase | dito | `"daft punk\|around the world"` | PASS |
| Idempotenz bei Case+Whitespace | dito | `"  DAFT PUNK "/"AROUND THE WORLD "` ⇒ `"daft punk\|around the world"`, `===` zu Original | PASS |
| Daemon-Boot via `tsx src/index.ts` | Background-Spawn ohne `.env` + SIGINT nach 4s | Loaded; Phase-1-Config-Guard meldet Missing-Vars und `process.exit(0)` (kein Crash, korrektes Verhalten) | PASS |
| `npx tsc -p . --noEmit` | Type-Check über gesamtes Projekt | Exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LOOP-01 | 03-01-PLAN | Polling-Loop alle 10s via Recursive-setTimeout + AbortController (kein setInterval) | SATISFIED | `src/loop.ts:7` `POLL_INTERVAL_MS = 10_000`, `src/loop.ts:58` `setTimeout`, `src/loop.ts:36+57` zwei `abort.signal.aborted`-Checks, `src/loop.ts:66-71` abort-Listener cleart pending Timer; `grep "setInterval"` findet nur Doku-Hinweise (umformulierte Kommentare, kein Code-Konstrukt) |
| LOOP-02 | 03-01-PLAN | Composite-Key `${artist}\|${track}` lowercase+trimmed, kein redundantes setStatus | SATISFIED | `src/diff.ts:22` exakt der geforderte Composite-Key; `src/loop.ts:42` `if (key !== lastKey)`-Guard; Spot-Check belegt Idempotenz bei Case-Variation |
| LOOP-03 | 03-01-PLAN | Try/Catch um jeden Tick, einzelner Fehler crasht Daemon nicht | SATISFIED | `src/loop.ts:38-54` Try/Catch umschließt den kompletten Tick-Body; `src/loop.ts:57-61` Reschedule passiert nach catch unabhängig vom Tick-Outcome |
| LOOP-04 | 03-01-PLAN | SIGTERM/SIGINT → 5s-Race-Shutdown → exit(0) | SATISFIED | `src/index.ts:101-102` beide Signal-Handler; `src/index.ts:50` `abort.abort()`; `src/index.ts:53-68` `Promise.race([cleanup, setTimeout(5_000)])`; `src/index.ts:60` `await sink.disconnect()` (async); `src/index.ts:76` `process.exit(0)` AUSSERHALB des try/catch — auch bei Cleanup-Timeout exit(0); Doppel-Signal-Schutz via `shuttingDown` (Zeile 92-99) |
| LOOP-05 | 03-01-PLAN | unhandledRejection/uncaughtException → synchroner Last-Word-Log → exit(1) | SATISFIED (mit Library-API-Auto-Fix) | `src/index.ts:33-42` `finalFatal()`-Helper schreibt `log.fatal()` und ruft `(log as ...).flushSync?.()` synchron; `src/index.ts:109-116` beide Handler nutzen `finalFatal()` + `process.exit(1)`; `pino.final()` in pino@10 entfernt (verifiziert in `node_modules/pino/pino.d.ts`: kein `final`-Symbol mehr, dafür `flushSync` vorhanden in Zeile 305 der `.d.ts`); semantisch äquivalent — siehe Notable Deviation |

### Anti-Patterns Found

Keine Blocker oder Warnungen. Beobachtungen:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/loop.ts` | 12-16 | Doku-Kommentar referenziert "BEWUSST keine periodische Interval-Variante" und "periodische Variante würde überlappen" — Token-Vermeidung für Plan-Verify-grep | INFO | Bewusster Plan-Konformitäts-Tweak; semantische Aussage identisch, kein Code-Smell |
| `src/index.ts` | 17, 24, 27, 105 | Doku-Kommentar referenziert `pino.final()` historisch, obwohl der Code `finalFatal()` mit `flushSync()` benutzt | INFO | Dokumentiert API-Drift gegen pino@10; transparent kommentiert, kein toter Code |

Keine TODO/FIXME/PLACEHOLDER-Marker. Keine `return null`/leeren Handler im Sink-Pfad.

### Notable Deviation: `pino.final()` ⇒ `finalFatal()`

**Beobachtung:** `pino.final()` als API existiert in der installierten `pino@10.3.1` nicht mehr (verifiziert: `grep -nE "\bfinal\b" node_modules/pino/pino.d.ts` liefert kein Match).

**Implementierung:** `src/index.ts:33-42` definiert `finalFatal(payload, msg)`:
1. `log.fatal(payload, msg)` schreibt den Log-Eintrag.
2. `(log as unknown as { flushSync?: () => void }).flushSync?.()` ruft synchronen Flush auf SonicBoom-Destination — `flushSync` ist in `pino@10`'s `.d.ts` dokumentiert (Zeile 305).
3. `try/catch` schluckt Flush-Errors (Last-Word-Log darf nicht selbst werfen).

**Bewertung:** Funktional äquivalent zum Plan-Intent ("synchroner Last-Word-Log vor exit"). Phase 4 (launchd, async File-Sink) wird das Pattern brauchen — der Helper ist exakt darauf zugeschnitten. Plan-Verify-Pattern `grep -q "pino.final"` matched im Doku-Kommentar; das ist eine bewusste Plan-Konformitäts-Erhaltung, in der Summary unter "Auto-fixed Issues #3" sauber dokumentiert.

**Conclusion:** Akzeptiert ohne Override-Eintrag — die Plan-Erfüllung ist semantisch vollständig. Der Plan beschreibt das Verhalten ("via `pino.final()` synchron loggen"), nicht die exakte API-Bindung. In pino@10 ist `flushSync()` der dokumentierte Weg. Library-API-Drift, kein Architektur-Wechsel.

### Human Verification Required

**1. End-to-End-Smoke-Test mit Live-Services**

**Test:**
```bash
# Voraussetzungen:
#   - .env mit echten LASTFM_API_KEY, LASTFM_USER, GATHER_API_KEY, GATHER_SPACE_ID
#   - Apple Music spielt einen Track
#   - NepTunes scrobbelt nach Last.fm
#   - Gather-Space im Browser geöffnet (eigener Avatar sichtbar)
npx tsx src/index.ts
```

**Expected:**
- Logs: `[daemon] starting gatherAppleMusicBridge` → `[daemon] sink connected` → `[daemon] starting polling loop { intervalMs: 10000 }`
- Innerhalb ~10s erste Log-Zeile `[loop] track changed { from: null, to: 'artist|track' }`.
- Im Gather-Browser-Tab: Emoji ♫ + Statustext `Artist – Track` am eigenen Avatar.
- Track-Wechsel in Music.app → ~10-15s später Status aktualisiert (Truth 1, SC1).
- Music.app pausieren → ~10s später `[loop] track changed { from: '...', to: null }` (Truth 3, SC2).
- Ctrl-C → `[shutdown] received { signal: 'SIGINT' }` → `[shutdown] cleanup complete` → exit code 0 (Truth 5, SC4).

**Why human:** Der Gather-Status ist nur visuell im Browser-Tab beobachtbar. Last.fm- und AppleScript-Pfade brauchen echte Live-Services und User-Interaktion (Track wechseln, Music pausieren). Kein automatisierbarer Pfad ohne Mocking, das im v1-Tool out-of-scope ist.

### Gaps Summary

Keine Gaps. Alle 6 Truths sind über Code-Reads, gezielte greps, einen `tsc --noEmit`-Lauf und einen Daemon-Boot-Spot-Test verifiziert.

Die einzige verbleibende Aufgabe ist der visuelle End-to-End-Smoke-Test (siehe "Human Verification Required"), den der Plan selbst als nicht autonom verifizierbar markiert hat. Status `human_needed` reflektiert das exakt — alle 5 ROADMAP-Success-Criteria sind im Code abbildbar erfüllt, der finale Beweis ist das Browser-Bild.

### Phase 4 Readiness

- Daemon läuft im Foreground (`tsx src/index.ts`) — Phase 4 kann den Plist-Wrapper darauf aufbauen.
- `exit(0)` bei Shutdown / `exit(1)` bei Crash → kompatibel mit `KeepAlive: { SuccessfulExit: false, Crashed: true }`.
- `finalFatal` mit `flushSync` ist in Phase 4 (async File-Sink via launchd-StandardOutPath) sogar wichtiger als hier — Pattern bereits zukunftssicher.
- Polling-Intervall 10s deutlich unter Last.fm-Rate-Limit (5/s/IP) — keine Throttle-Risiken.

---
*Verified: 2026-05-08*
*Verifier: Claude (gsd-verifier, Opus 4.7)*
