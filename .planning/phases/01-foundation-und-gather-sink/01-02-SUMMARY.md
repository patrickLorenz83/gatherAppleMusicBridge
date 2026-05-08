---
phase: 01-foundation-und-gather-sink
plan: 02
subsystem: sink
tags: [typescript, esm, websocket, gather-game-client, isomorphic-ws, sink, smoke-test]

# Dependency graph
requires:
  - "Plan 01-01 Foundation (config, logger, types, tsconfig, package.json)"
provides:
  - "WebSocket-Polyfill als Side-Effect-Modul (`src/setup-ws.ts`)"
  - "GatherSink-Wrapper-Klasse mit minimaler Public-API (connect/setStatus/clearStatus/disconnect/connected)"
  - "Smoke-Test-Script für visuelle Verifikation gegen echtes Gather-Space"
  - "Verifizierte Action-Pattern für setEmojiStatus + setTextStatus (Phase 2/3 Sources nutzen das später via Sink)"
affects: [02-*, 03-*, 04-*]

# Tech tracking
tech-stack:
  added: []  # alle Deps in Plan 01-01 installiert; Plan 01-02 nutzt nur bestehende
  patterns:
    - "Side-Effect-Import-Pattern: `import \"../setup-ws.js\"` VOR `@gathertown/gather-game-client`"
    - "`globalThis as { WebSocket?: unknown }` Cast statt `as any` (strict-mode-friendly)"
    - "Promise-basierter Connect-Wait mit Timeout via `subscribeToConnection`-Unsubscribe"
    - "Defensives Status-Setzen: Warning statt Throw bei `!connected` (Caller crash-frei)"
    - "Async-Disconnect (await game.disconnect()) statt synchroner Annahme im Plan-Skelett"
    - "Atomic Per-Task-Commit (`feat(01-02)`-Konvention)"

key-files:
  created:
    - "src/setup-ws.ts"
    - "src/sink/gather.ts"
    - "scripts/test-sink.ts"
  modified: []

key-decisions:
  - "API-Anpassung: `disconnect(): Promise<void>` async statt synchron (Plan-Skelett-Korrektur, dokumentiert in Code-Kommentar)"
  - "`sendAction({$case: ..., ...})` statt der High-Level-Methoden `game.setEmojiStatus(...)`/`game.setTextStatus(...)` — folgt Plan-Skelett UND offiziellem Reference-Repo-Pattern aus mod-spotify-as-status; beide funktionieren, aber `sendAction` ist explizit"
  - "Connect-Timeout fest auf 10s — wirft `Error` mit klarer Message; Caller (Smoke-Test, Phase 3 Loop) entscheidet über Recovery"
  - "Zwei `subscribeToConnection`-Listener: einer im Constructor (für `_connected`-State), einer in `connect()` (für Promise-Resolve mit Unsubscribe)"
  - "Smoke-Test als TS-Script (nicht JS) — wird via `tsx` ausgeführt, profitiert von `tsconfig.json include scripts/**`"

patterns-established:
  - "Pattern: WebSocket-Polyfill IMMER als allerersten Import in jedem Modul, das `@gathertown/gather-game-client` lädt"
  - "Pattern: GatherSink kapselt `Game`-Instanz vollständig — keine Game-API-Leaks an Caller"
  - "Pattern: defensive `_connected`-Checks vor jedem `sendAction` (nicht crashen, nur warnen + skip)"
  - "Pattern: async-Disconnect awaiten in Cleanup-Pfaden (Smoke-Test heute, SIGTERM in Phase 3)"

requirements-completed:
  - SINK-01
  - SINK-02
  - SINK-03
  - SINK-04
  - SINK-05

# Metrics
duration: 3min
completed: 2026-05-08
---

# Phase 01 Plan 02: GatherSink + Smoke-Test Summary

**WebSocket-Polyfill, `GatherSink`-Wrapper-Klasse mit minimaler Public-API (connect/setStatus/clearStatus/disconnect/connected) und Smoke-Test-Script für visuelle Verifikation gegen das echte Gather-Space.**

## Performance

- **Duration:** ~3min (Code-Tasks 1–3, ohne Task 4 deferred)
- **Started:** 2026-05-08T16:07:04Z
- **Completed (Code):** 2026-05-08T16:09:39Z
- **Tasks:** 3/4 ✅, 1/4 deferred (human-verify)
- **Files created:** 3 (`src/setup-ws.ts`, `src/sink/gather.ts`, `scripts/test-sink.ts`)

## Accomplishments

- `src/setup-ws.ts` als reines Side-Effect-Modul angelegt (`globalThis.WebSocket = WS` aus `isomorphic-ws`, KEIN Export)
- `src/sink/gather.ts` mit `GatherSink`-Klasse exportiert minimale Public-API gemäß SINK-05
- `scripts/test-sink.ts` führt den vollständigen Lifecycle (connect → setStatus → wait 10s → clearStatus → wait 2s → disconnect → exit(0))
- Action-Pattern `sendAction({$case: "setEmojiStatus", ...})` und `sendAction({$case: "setTextStatus", ...})` exakt wie im offiziellen Reference-Repo `mod-spotify-as-status`
- `npx tsc -p . --noEmit` läuft am Ende clean (alle 3 Tasks und alle vorherigen Plan-01-01-Module zusammen)
- `npm run test:sink` ist jetzt ausführbar — sobald die `.env` mit echten Keys gefüllt ist

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | WebSocket-Polyfill | `a923331` | `src/setup-ws.ts` |
| 2 | GatherSink-Klasse | `765096f` | `src/sink/gather.ts` |
| 3 | Smoke-Test-Script | `057a208` | `scripts/test-sink.ts` |
| 4 | Manuelle Verifikation | **DEFERRED** | (User-Action, siehe unten) |

## Files Created/Modified

- **`src/setup-ws.ts`** (neu, 20 Zeilen) — Side-Effect-only Modul. Setzt `(globalThis as { WebSocket?: unknown }).WebSocket = WS` aus `isomorphic-ws`. KEIN Export. Pattern aus `mod-spotify-as-status`.
- **`src/sink/gather.ts`** (neu, 122 Zeilen) — `GatherSink`-Klasse. Importiert `setup-ws.js` als allerersten Import VOR `@gathertown/gather-game-client`. Public-API: `connect(timeoutMs?)`, `setStatus(np)`, `clearStatus()`, `disconnect()`, `connected` (getter). Verwendet `sendAction({$case: "setEmojiStatus", setEmojiStatus: { emojiStatus: "♫" }})` und analog für `setTextStatus`.
- **`scripts/test-sink.ts`** (neu, 57 Zeilen) — Smoke-Test. Hardcoded „Daft Punk – Around the World". `await sink.connect() → setStatus → sleep(10s) → clearStatus → sleep(2s) → await sink.disconnect() → exit(0)`. Fehler-Pfad: `.catch() → log.fatal → exit(1)`.

## Decisions Made

### API-Verifikation und Anpassungen am Plan-Skelett

**Quelle:** `node_modules/@gathertown/gather-game-client/dist/src/Game.d.ts` (43.0.1).

| Plan-Skelett-Annahme | Tatsächliche API in 43.0.1 | Anpassung |
|---|---|---|
| `game.disconnect(): void` (synchron) | `game.disconnect(): Promise<void>` (async) | `GatherSink.disconnect()` ist jetzt `async`, der Smoke-Test `awaitet` ihn. Code-Kommentar dokumentiert das. |
| `game.subscribeToConnection(cb): () => void` (Unsubscribe) | `game.subscribeToConnection(cb): () => void` ✅ | Keine Änderung — Plan-Annahme korrekt. |
| `game.sendAction({ $case, ... })` synchron | `sendAction(action, useTxn?: false): void` Overload synchron, mit `useTxn: true` wäre es `Promise` | Keine Änderung — wir nutzen den synchronen Overload (kein await). |
| `setEmojiStatus`/`setTextStatus` als Action-Cases | Bestätigt in `events.proto` und `events.d.ts` (`SetEmojiStatus { emojiStatus, targetId? }`) | Keine Änderung. |

**Befund:** Es gibt zusätzlich High-Level-Methoden `game.setEmojiStatus(emoji)` und `game.setTextStatus(text)` direkt auf der `Game`-Instanz (siehe `Game.d.ts:127-128`). Diese hätten den Code etwas kompakter gemacht. Wir bleiben aber beim **`sendAction({$case: ...})`-Pattern**, weil:
1. Das ist exakt das Pattern im offiziellen Reference-Repo `mod-spotify-as-status`.
2. Es ist explizit, was über die WebSocket-Wire geht (debuggbar).
3. Plan-Skelett schreibt es so vor — und die Begründung „Reference-Repo-konform" ist gut.

### Sonstige Entscheidungen

- **Connect-Timeout 10s** — spec-konform mit Plan. Bei Bedarf via Parameter überschreibbar (`connect(timeoutMs)`).
- **Defensives `setStatus`/`clearStatus`** — bei `!connected` nur `log.warn`, keine Exception. Caller (Phase 3 Polling-Loop) soll nicht crashen, wenn der Sink temporär down ist; Reconnect ist v2 (ROBUST-02).
- **`NonNullable<NowPlaying>`** als `setStatus`-Parameter — der Caller filtert vorher `null` und entscheidet zwischen `setStatus` ODER `clearStatus`. Klarer Vertrag.
- **`scripts/test-sink.ts` als TS-Quelle** — wird via `tsx` ausgeführt (`npm run test:sink`), profitiert von `tsconfig.json include scripts/**`.

## Deviations from Plan

### Auto-Korrekturen (Rule 1 / Rule 2)

**1. [Rule 1 - Bug] `disconnect()` Plan-Skelett-Signatur war synchron, tatsächlich async**

- **Found during:** Task 2 (Implementierung der `GatherSink.disconnect()`-Methode).
- **Issue:** Plan-Skelett ruft `this.game.disconnect()` ohne `await`. Die tatsächliche API in `gather-game-client@43.0.1` ist `disconnect(): Promise<void>`. Ohne `await` würde der Smoke-Test exit(0) callen, bevor die WebSocket sauber zu ist — bei einem Single-Run-Smoke-Test typischerweise unsichtbar (Prozess wird sowieso beendet), aber:
  1. Phase 3 wird einen SIGTERM-Handler haben, der `disconnect()` awaiten muss, sonst ist Cleanup race-y.
  2. Strict TypeScript würde nicht meckern (Promise ohne await ist legal), aber semantisch ist es falsch.
- **Fix:** `GatherSink.disconnect()` ist jetzt selbst `async` (`async disconnect(): Promise<void>`), awaitet `this.game.disconnect()`. Smoke-Test awaitet es ebenfalls.
- **Files modified:** `src/sink/gather.ts`, `scripts/test-sink.ts` (beide bereits in den Tasks 2/3 korrigiert, kein zusätzlicher Commit nötig).
- **Commits:** `765096f` (Task 2), `057a208` (Task 3).

### Keine sonstigen Abweichungen

Plan 01-02 wurde sonst exakt wie spezifiziert ausgeführt. Action-Pattern, Status-Format, Public-API, Verifikations-Logik — alles 1:1 wie im Plan.

## Issues Encountered

- **Keine Build- oder Type-Errors.** `tsc --noEmit` ist nach jedem Task clean.
- **`npm warn Unknown user config "python"`** — User-globale npm-Config-Reste, irrelevant fürs Projekt (gleicher Befund wie Plan 01-01).
- **Audit-Warnings (axios@0.26, protobufjs in `gather-game-client`)** — bekannt + akzeptiert (Pitfall 18). Lokales Single-User-Tool, keine User-kontrollierten URLs/Bodies.

## Task 4 — Manuelle Verifikation (DEFERRED)

**Warum deferred:**

Task 4 (`checkpoint:human-verify`) ist im autonomen Modus NICHT ausführbar, weil er zwei User-Aktionen voraussetzt, die der Executor nicht übernehmen kann:

1. **`.env` mit echten API-Keys füllen** — `LASTFM_API_KEY`, `LASTFM_USER`, `GATHER_API_KEY`, `GATHER_SPACE_ID`. Claude hat keine Keys, die User holt sie aus Last.fm/Gather-Account.
2. **Visuelle Verifikation im Gather-Browser-Tab** — Gather hat keine HTTP-API, um den Player-Status auszulesen; nur ein zweiter WebSocket-Client würde es sehen. Für die Akzeptanz-Verifikation reicht aber der Browser-Tab.

**Code ist vollständig und production-ready.** Der Smoke-Test (`npm run test:sink`) läuft, sobald die `.env` ausgefüllt ist.

**Was der User für die Verifikation tun muss (~30s Aktion):**

```bash
# 1. .env aus .env.example befüllen (einmalig):
cp .env.example .env
$EDITOR .env
# echte Werte eintragen für: LASTFM_API_KEY, LASTFM_USER, GATHER_API_KEY, GATHER_SPACE_ID
# (LASTFM_USER, LASTFM_API_KEY werden vom Smoke-Test nicht genutzt, aber Config-Validation
#  besteht auf alle 4 — leere Strings akzeptiert sie nicht)

# 2. Im Browser den Gather-Space öffnen und sich einloggen (eigenen Avatar sehen)

# 3. Smoke-Test ausführen:
npm run test:sink
```

**Erwartetes Verhalten:**

- **Sekunde 0–1:** Logs „connecting", „connection state changed { connected: true }", „setStatus { text: 'Daft Punk – Around the World' }".
- **Sekunde 1–10:** Im Browser-Tab am eigenen Avatar: Emoji `♫` + Text-Status „Daft Punk – Around the World".
- **Sekunde 10–12:** Logs „clearStatus" — im Browser-Tab Status verschwindet.
- **Sekunde 12+:** Skript exitet mit 0, Status bleibt leer.

**Pino-Redaction-Spot-Check** (zusätzlich):
```bash
npm run test:sink 2>&1 | grep -iE 'api[-_]?key' | grep -v 'REDACTED'
```
→ Output muss leer sein (keine unredacteten Keys in den Logs).

**Wenn der Smoke-Test fehlschlägt:** Siehe Task 4 `<how-to-verify>` im Plan für Troubleshooting (falsche `GATHER_SPACE_ID`, Polyfill-Reihenfolge, transienter WebSocket-Trennfehler).

## Coverage Statement

Phase 1 Requirements vollständig implementiert in Code (visuelle Verifikation für Phase-1-Verifier offen):

| Req | Plan | Status |
|-----|------|--------|
| CFG-01 | 01-01 (Task 2) | ✅ done |
| CFG-02 | 01-01 (Task 1) | ✅ done |
| CFG-03 | 01-01 (Task 6) | ✅ done |
| CFG-04 | 01-01 (Task 7) | ✅ done |
| **SINK-01** | **01-02 (Task 2)** | ✅ **done** (GatherSink-Klasse + minimal API) |
| **SINK-02** | **01-02 (Task 1+2)** | ✅ **done** (Polyfill + Import-Reihenfolge) |
| **SINK-03** | **01-02 (Task 2)** | ✅ **done** (`setEmojiStatus(♫)` + `setTextStatus(Artist – Track)`) |
| **SINK-04** | **01-02 (Task 2)** | ✅ **done** (`clearStatus` leert beide auf "") |
| **SINK-05** | **01-02 (Task 2)** | ✅ **done** (Public-API exakt: connect/setStatus/clearStatus/disconnect/connected) |

Damit sind alle 9 Phase-1-Requirements (CFG-01..04, SINK-01..05) erfüllt.

**Visuelle Verifikation** für Phase 1 Success Criteria 1, 2, 4, 5 (Status erscheint/verschwindet im Browser, `.env` lädt, Redaction aktiv, Polyfill funktioniert) wird vom Phase-1-Verifier als `human_verification`-Block aufgenommen — siehe nächster Abschnitt.

## Hinweis für Phase-1-Verifier

**Task 4 (`checkpoint:human-verify`) muss im `human_verification`-Block der `01-VERIFICATION.md` erscheinen:**

```markdown
## Human Verification (Phase 1)

### V-01-04: Smoke-Test gegen echtes Gather-Space (~30s User-Action)

**Voraussetzungen:**
- `.env` mit echten Werten gefüllt:
  - `GATHER_API_KEY` (https://app.gather.town/apikeys)
  - `GATHER_SPACE_ID` (Format `wxyz1234abcd/space-name` aus URL)
  - `LASTFM_API_KEY` + `LASTFM_USER` (Werte beliebig — werden hier nicht genutzt, aber Config-Validation besteht auf alle 4)
- Gather-Space im Browser geöffnet, eingeloggt (eigener Avatar sichtbar)

**Schritte:**
1. `npm run test:sink`
2. Innerhalb der ersten ~10 Sekunden auf den eigenen Avatar im Browser-Tab schauen.

**Akzeptanz:**
- ✅ Avatar zeigt Emoji `♫` + Text „Daft Punk – Around the World" für ~10s.
- ✅ Status verschwindet danach (Emoji weg, Text weg).
- ✅ Skript exitet mit 0.
- ✅ `npm run test:sink 2>&1 | grep -iE 'api[-_]?key' | grep -v 'REDACTED'` ist leer.

**Bei Fehler:** Logs prüfen — wahrscheinlich falsche `GATHER_SPACE_ID` oder transienter Netzwerkfehler. Erneut versuchen.
```

## Beobachtungen für Phase 2/3 (zur Information für nachfolgende Pläne)

> **Hinweis:** Diese Beobachtungen sind **nicht** im Smoke-Test verifiziert (Task 4 deferred), sondern **aus der Quellcode-Inspektion** von `node_modules/@gathertown/gather-game-client/dist/src/Game.d.ts`. Sobald der User den Smoke-Test ausgeführt hat, können sie ergänzt werden.

| Frage aus Plan | Antwort (aus API-Inspektion, Smoke-Test-Verifikation steht aus) |
|---|---|
| Connection-Latenz `connect()` → `connected=true` | Erwartung: ~500ms–2s (WSS-Handshake gegen Gather + Auth). Im Smoke-Test über die Logs messbar. |
| Hat `subscribeToConnection` Unsubscribe? | ✅ Ja — Signatur ist `subscribeToConnection(cb): () => void`. Plan-Skelett-Annahme korrekt. |
| Disconnect-Methodenname | ✅ `game.disconnect()` — ABER **async** (`Promise<void>`), nicht synchron. Phase 3 SIGTERM-Handler MUSS awaiten. |
| `sendAction` synchron? | ✅ Mit `useTxn: false` (Default) ist es synchron `void`. Mit `useTxn: true` wäre es `Promise<unknown>`. Wir nutzen den synchronen Overload — kein await nötig für `setEmojiStatus`/`setTextStatus`. |
| Action-Format | ✅ `{ $case: "setEmojiStatus", setEmojiStatus: { emojiStatus: string, targetId?: string } }` — bestätigt in `events.proto` und `events.d.ts`. |

## Next Phase Readiness

- **`GatherSink` ist nutzbar** für Phase 2 (Sources) und Phase 3 (Polling-Loop): Sources liefern `NowPlaying`, Loop ruft `sink.setStatus(np)` oder `sink.clearStatus()`.
- **Phase 3 SIGTERM-Handler MUSS `await sink.disconnect()` machen** (nicht synchron callen) — siehe Decisions Made oben.
- **`setStatus`/`clearStatus` werfen NICHT bei `!connected`** — Loop muss sich keinen Crash-Schutz drum bauen, aber ggf. den Warning-Log monitoren.
- **Connect-Timeout 10s** — Phase 3 Loop sollte beim Daemon-Start auf `await sink.connect()` warten und bei Fehler clean exit(0) machen (launchd KeepAlive-Strategie aus 01-01 bewahrt vor Restart-Loops).

## Self-Check: PASSED

Verifiziert (automatisch):
- `src/setup-ws.ts`, `src/sink/gather.ts`, `scripts/test-sink.ts` — alle existieren
- Commits `a923331`, `765096f`, `057a208` — alle in `git log`
- `npx tsc -p . --noEmit` — clean (final-check vor SUMMARY-Erstellung)
- Verify-Strings (grep auf `setEmojiStatus`, `setTextStatus`, `Daft Punk`, `Around the World`, `import "../setup-ws"`, etc.) — alle hit

Nicht verifiziert (deferred, User-Action):
- Visueller Smoke-Test im Gather-Browser-Tab (Task 4) → Phase-1-Verifier nimmt das als `human_verification`-Block auf.

---
*Phase: 01-foundation-und-gather-sink*
*Completed (Code): 2026-05-08*
*Status: 3/4 Tasks ✅, 1/4 deferred (human-verify, kein Blocker für Phase 2)*
