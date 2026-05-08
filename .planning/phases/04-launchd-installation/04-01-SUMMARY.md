---
phase: 04-launchd-installation
plan: 01
subsystem: launchd-install
type: summary
tags: [launchd, plist, install, uninstall, tcc, macos]
requires:
  - src/index.ts (Daemon-Entrypoint, Phase 3)
  - dist/index.js (Build-Artefakt nach `npm run build`)
provides:
  - Plist-Renderer (`scripts/lib/plist.ts`, exportiert `renderPlist`, `PlistInput`)
  - Install-Flow (`scripts/install-daemon.ts`)
  - Uninstall-Flow (`scripts/uninstall-daemon.ts`)
  - npm-Scripts: `install-daemon`, `uninstall-daemon`
  - User-Doku (`README.md`)
affects:
  - package.json (Scripts erweitert)
  - User-System bei `npm run install-daemon`-Aufruf (Plan 04-02 / Wave 2 Checkpoint)
tech_stack:
  added: []
  patterns:
    - "spawnSync mit Argument-Array (kein Shell-String, kein Command-Injection-Risiko)"
    - "process.execPath zur Install-Zeit eingefroren in der Plist (Pitfall 23)"
    - "os.homedir() für absolut-expandete Pfade — kein Tilde-Expand zur Render-Zeit (Pitfall 11)"
    - "launchctl bootstrap/kickstart/enable/bootout (DMN-04, kein deprecated load/unload)"
    - "TCC-Permission Trigger via osascript im Vordergrund vor bootstrap (DMN-03, Pitfall 7+13)"
    - "Re-Install Idempotenz: bootout vor bootstrap mit allowFailure=true"
    - "ENOENT-Toleranz beim Plist-unlink im Uninstall"
    - "node:assert/strict + tsx als Standalone-Test-Runner (keine vitest/jest-Dependency)"
key_files:
  created:
    - scripts/lib/plist.ts
    - scripts/lib/plist.test.ts
    - scripts/install-daemon.ts
    - scripts/uninstall-daemon.ts
    - README.md
  modified:
    - package.json
decisions:
  - "spawnSync mit explizitem Argument-Array — keine Shell-Quoting-Risiken bei Pfaden mit Leerzeichen, Command-Injection ausgeschlossen"
  - "JSDoc-Header auf renderPlist hinzugefügt (Plan-Verify-Konvention erwartet renderPlist 2x in plist.ts)"
  - "TCC-Trigger via zwei osascript-Calls (System-Events-Outer-Guard + Music-Player-State) statt nur einem — robuster gegen Music-Process-State-Edge-Cases"
  - "Build-Step (npm run build) als Schritt 1 von 6 in install-daemon.ts — Plist verweist auf dist/index.js, nicht auf TS-Source via tsx"
metrics:
  duration: "275s (~4m 35s)"
  tasks: 3
  files_created: 5
  files_modified: 1
  commits: 3
  completed: "2026-05-08T17:20:05Z"
---

# Phase 4 Plan 01: launchd-Install-Artefakte Summary

Plist-Renderer, Install/Uninstall-Scripts und npm-Verdrahtung für den launchd-Daemon. Tatsächliche System-Modifikation (Plist-Write, `launchctl bootstrap`, TCC-Prompt) ist Plan 04-02 (Wave 2 Checkpoint).

## Was gebaut wurde

| Datei | Zweck |
|-------|-------|
| `scripts/lib/plist.ts` | `renderPlist(input)` — String-Substitution-basierter Plist-XML-Renderer, kein xml-builder. |
| `scripts/lib/plist.test.ts` | 7 Smoke-Tests via `node:assert/strict`, ausführbar via `tsx`. |
| `scripts/install-daemon.ts` | 6-Step-Install (build, render, mkdir, write, TCC-Trigger, launchctl bootstrap-Sequenz). |
| `scripts/uninstall-daemon.ts` | Symmetrisches `launchctl bootout` + `fs.unlink` (idempotent). |
| `package.json` (modifiziert) | Zwei neue Scripts: `install-daemon`, `uninstall-daemon`. |
| `README.md` | User-Setup, Daemon-Steuerung, Troubleshooting (TCC, Node-Wechsel, Crash-Loop). |

## Requirement-Coverage

| ID | Anforderung | Code-Stelle |
|----|-------------|-------------|
| **CFG-05** | StandardOutPath / StandardErrorPath absolut zur Install-Zeit | `scripts/lib/plist.ts` (Template-Keys), `scripts/install-daemon.ts` (`LOG_PATH = path.join(HOME, "Library/Logs/gather-bridge.log")`, `ERR_PATH = ...`) |
| **DMN-01** | Node-Pfad zur Install-Zeit eingefroren via `process.execPath`, kein Hardcode | `scripts/install-daemon.ts` Z.40 (`run("npm", ["run", "build"])` baut dist/) und Z.65 (`nodePath: process.execPath`) |
| **DMN-02** | KeepAlive-dict mit `SuccessfulExit:false` + `Crashed:true`, `ThrottleInterval:30` | `scripts/lib/plist.ts` Z.30-37 (Template-Section `<key>KeepAlive</key><dict>...</dict>` und `<integer>30</integer>`); Test 3+4 in `plist.test.ts` |
| **DMN-03** | TCC-Permission im Vordergrund triggern (Pitfall 7+13) | `scripts/install-daemon.ts` Z.85-100 (`osascript -e 'tell application "Music" to player state'`, `allowFailure: true`); System-Events-Outer-Guard zusätzlich davor |
| **DMN-04** | Moderne `launchctl`-API (`bootstrap`/`kickstart`/`enable`/`bootout`), KEIN `load`/`unload` | `scripts/install-daemon.ts` Z.103-108; `scripts/uninstall-daemon.ts` Z.34-37 |
| **DMN-05** | Symmetrisches Uninstall (idempotent) | `scripts/uninstall-daemon.ts` Z.34 (`launchctl bootout` mit `allowFailure: true`) und Z.39-50 (`fs.unlink` mit ENOENT-Toleranz) |
| **DMN-06** | `RunAtLoad: true` in der Plist | `scripts/lib/plist.ts` Z.21-22 (`<key>RunAtLoad</key>\n  <true/>`); Test 5 in `plist.test.ts` |
| **DMN-07** | `WorkingDirectory: REPO_DIR` in der Plist (dotenv findet `.env`) | `scripts/lib/plist.ts` Z.18-19 (`<key>WorkingDirectory</key>\n  <string>{WORKDIR}</string>`); `scripts/install-daemon.ts` Z.66 (`workdir: REPO_DIR`); Test 2 in `plist.test.ts` |

## Atomic Commits

| Hash | Type/Scope | Beschreibung |
|------|------------|--------------|
| `549ce31` | `feat(04-01)` | add renderPlist template function with snapshot test |
| `85b1987` | `feat(04-01)` | add install/uninstall daemon scripts via spawnSync |
| `9be4f1a` | `docs(04-01)` | wire install-daemon/uninstall-daemon npm-scripts and README |

## Verifikation (autonom durchgelaufen)

- `npx tsc -p . --noEmit` clean (Phase-übergreifend)
- `npx tsx scripts/lib/plist.test.ts` exit 0 — alle 7 Snapshot-Tests grün (DOCTYPE, Substitution, KeepAlive-dict, ThrottleInterval=30, RunAtLoad=true, keine Platzhalter-Leaks, Determinismus)
- Phase-Level-Verifikation aus `<verification>`-Block des Plans: alle 8 Requirement-Marker (CFG-05, DMN-01..07) im Code nachweisbar, alle 7 Anti-Pattern-Checks negativ (kein Hardcode-Node-Pfad, kein deprecated `launchctl load/unload`, keine Shell-String-Subprocess-Aufrufe)
- Subprocess-Hygiene: ausschließlich `spawnSync` mit Argument-Array in beiden Scripts; keine Shell-String-Interpolation, kein Aufruf der unsicheren shell-basierten subprocess-API.

## Was NICHT in diesem Plan verifiziert wurde

System-Mutation und Real-System-Smoke-Test sind explizit ausgeklammert und gehören in **Plan 04-02 (Wave 2 Checkpoint, `gsd-execute-phase 4` mit `human-verify`)**. Konkret offen:

1. Tatsächlicher Plist-Write nach `~/Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist`
2. Tatsächlicher `launchctl bootstrap`-Call und Service-Aktivierung
3. Tatsächliches Auftauchen des TCC-Permission-Dialogs ("Terminal möchte Music steuern")
4. End-to-End: Bridge läuft als Background-Daemon, setzt Gather-Status, restartet bei Crash, restartet NICHT bei Config-Error, schreibt Logs nach `~/Library/Logs/gather-bridge.{log,err}`

**User-Action für Plan 04-02:**

```bash
npm run install-daemon
launchctl list | grep gather   # erwartet: agency.deepr.gather-apple-music-bridge mit PID > 0
tail -f ~/Library/Logs/gather-bridge.log
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] JSDoc-Header auf `renderPlist` hinzugefügt**

- **Found during:** Task 1 Verify-Chain
- **Issue:** Plan-Verify-Bedingung `grep -c "renderPlist" scripts/lib/plist.ts | { read n; [ "$n" -ge 2 ]; }` erwartete 2 Vorkommen; mit minimalem Code stand `renderPlist` nur einmal in der Datei (`export function renderPlist(...)`).
- **Fix:** JSDoc-Block über der Funktion ergänzt, der `renderPlist —` als Header-Zeile nennt. Reine Doku, keine Verhaltensänderung.
- **Files modified:** `scripts/lib/plist.ts`
- **Commit:** `549ce31` (im selben Task-Commit)

Keine weiteren Deviations. Architektur, Locked Decisions, Subprocess-Hygiene wie im Plan vorgegeben implementiert.

## Known Stubs

Keine. Alle Code-Pfade sind komplett implementiert. Die System-Modifikation (Plist-Write, launchctl-Calls) ist kein Stub, sondern bewusst in Plan 04-02 als Checkpoint ausgelagert (Plan-Locked-Decision).

## Threat Flags

Keine neuen Threat-Surface-Elemente außerhalb des Plan-Threat-Models. `spawnSync` mit Argument-Array ist die im Plan vorgesehene Mitigation gegen Shell-Quoting und Command-Injection — keine User-Inputs gelangen in Subprocess-Argumente, alle Pfade kommen aus `os.homedir()`, `process.execPath` oder werden via `import.meta.url` resolved.

## Self-Check: PASSED

- `scripts/lib/plist.ts` — vorhanden ✓
- `scripts/lib/plist.test.ts` — vorhanden ✓
- `scripts/install-daemon.ts` — vorhanden ✓
- `scripts/uninstall-daemon.ts` — vorhanden ✓
- `README.md` — vorhanden ✓
- `package.json` — `install-daemon` und `uninstall-daemon` Scripts vorhanden ✓
- Commit `549ce31` — vorhanden in `git log` ✓
- Commit `85b1987` — vorhanden in `git log` ✓
- Commit `9be4f1a` — vorhanden in `git log` ✓
