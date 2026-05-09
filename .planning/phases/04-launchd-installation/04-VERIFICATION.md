---
phase: 04-launchd-installation
verified: 2026-05-08T17:27:26Z
status: human_needed
score: 6/6 must-haves statisch verifiziert (Code-Artefakte); 5 Live-System-Items deferred zu Plan 04-02
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "npm run install-daemon real ausführen"
    expected: "Plist landet in ~/Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist; launchctl listet den Service mit gültiger PID; TCC-Dialog erscheint einmalig"
    why_human: "Statische Analyse kann tatsächlichen FS-Write, launchctl-bootstrap-Effekt und macOS-TCC-Prompt nicht beobachten — verlangt Live-Mac-Session des Users (Plan 04-02 Task 1, Schritt 2 und 3)"
  - test: "RunAtLoad nach Login verifizieren"
    expected: "Nach Logout/Login (oder Reboot) listet launchctl den Service mit neuer PID; Daemon läuft, ohne dass User ihn manuell startet"
    why_human: "Login-Trigger ist ein OS-Lifecycle-Event, nicht reproduzierbar via grep oder Subprocess (Plan 04-02 Task 2 Schritt 5)"
  - test: "AppleScript-Fallback unter launchd-spawned Daemon"
    expected: "Bei Pause oder NepTunes-Quit feuert AppleScript-Source ohne errAEEventNotPermitted (-1743) im Log; Gather-Status reagiert binnen 10 bis 15 s"
    why_human: "TCC-Permission-Vererbung an launchd-Subprocess ist nur live testbar; -1743 manifestiert sich erst zur Laufzeit unter launchd-Domain (Plan 04-02 Task 1 Schritt 5)"
  - test: "Crash-Loop-Schutz mit kaputter Config"
    expected: "Mit GATHER_API_KEY=invalid-... exited der Daemon mit Code 0; launchctl-PID = '-' (kein Restart wegen SuccessfulExit:false); Daemon kommt nach Restore und kickstart wieder hoch"
    why_human: "KeepAlive-dict-Verhalten ist nur am laufenden launchd-Service messbar — Snapshot-Test prüft nur die XML-Form (Plan 04-02 Task 1 Schritt 4)"
  - test: "npm run uninstall-daemon real ausführen, idempotent"
    expected: "Plist gelöscht; launchctl listet keinen Service mehr; ps zeigt keinen Daemon-Prozess; zweiter Aufruf läuft mit Exit 0 durch (Idempotenz)"
    why_human: "Echter bootout-Effekt und FS-unlink nur am Live-System sichtbar (Plan 04-02 Task 2 Schritt 3 und 4)"
---

# Phase 4: launchd-Installation Verification Report

**Phase Goal:** Bridge läuft als unsichtbarer Background-Daemon (launchd), startet bei Login, restartet bei Crash aber nicht bei Config-Fehlern, Logs in `~/Library/Logs/gather-bridge.{log,err}`.

**Verified:** 2026-05-08T17:27:26Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                              | Status   | Evidence                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `scripts/lib/plist.ts` exportiert `renderPlist({label, nodePath, scriptPath, workdir, logPath, errPath})` und liefert validen Plist-XML                                                                                            | VERIFIED | `scripts/lib/plist.ts:69` `export function renderPlist(input: PlistInput): string`; Live-Render produziert vollständigen Plist-XML mit DOCTYPE, allen 6 substituierten Pfaden, KeepAlive-dict, ThrottleInterval=30, RunAtLoad=true (siehe Step 7 Live-Run) |
| 2   | `scripts/install-daemon.ts` orchestriert build, render, write, mkdir Logs, TCC-Trigger, bootout/bootstrap/enable/kickstart                                                                                                          | VERIFIED | `scripts/install-daemon.ts:62-106` ruft alle 6 Steps sequenziell mit Step-Logs; alle launchctl-Verben (`bootout`, `bootstrap`, `enable`, `kickstart`) per `spawnSync`-Argument-Array (Z.103-106)                                                       |
| 3   | `scripts/uninstall-daemon.ts` ruft `launchctl bootout` (idempotent) und löscht die Plist (idempotent bei ENOENT)                                                                                                                    | VERIFIED | `scripts/uninstall-daemon.ts:35` (`bootout` mit `allowFailure: true`); Z.39-49 (`fs.unlink` mit ENOENT-Catch und Restore-throw für andere Errors)                                                                                                       |
| 4   | `package.json` hat `install-daemon` und `uninstall-daemon` als npm-Scripts                                                                                                                                                          | VERIFIED | `package.json:17-18` exakt `"install-daemon": "tsx scripts/install-daemon.ts"` und `"uninstall-daemon": "tsx scripts/uninstall-daemon.ts"`                                                                                                              |
| 5   | `README.md` dokumentiert Setup-Steps, TCC-Troubleshooting und Log-Pfade                                                                                                                                                              | VERIFIED | `README.md` 124 Zeilen; Setup (Z.13-37), Daemon-Steuerung-Tabelle (Z.39-48), Logs (Z.50-65), Troubleshooting (Z.67-110, inkl. `tccutil reset AppleEvents`, exit code 78, Crash-Loop-Verhalten)                                                          |
| 6   | Plist enthält absoluten `process.execPath` für Node, KeepAlive-dict mit `SuccessfulExit:false` und `Crashed:true`, `ThrottleInterval:30`, `RunAtLoad:true`, `WorkingDirectory:REPO_DIR`, absolut-expandete Log-Pfade (keine Tilde) | VERIFIED | `scripts/install-daemon.ts:69` `nodePath: process.execPath`; Plist-Template `scripts/lib/plist.ts:31-49` enthält RunAtLoad/`<true/>`, KeepAlive-dict-with-SuccessfulExit-false-Crashed-true, ThrottleInterval=30; alle Pfade via `path.join(HOME, ...)` ohne Tilde |

**Score:** 6/6 statische (Code-)Truths verifiziert. Alle 6 must_haves aus `04-01-PLAN.md` frontmatter sind in der Codebase nachweisbar. Die 5 Live-System-Truths aus `04-02-PLAN.md` (Plist real auf Disk, Service real geladen, AppleScript-Fallback live, Crash-Loop-Verhalten, sauberer Removal) sind explizit zu Plan 04-02 Wave 2 als `checkpoint:human-verify` deferred.

### Required Artifacts

| Artifact                      | Expected                                                                                     | Status   | Details                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/lib/plist.ts`        | Plist-Template-Renderer mit String-Substitution (kein xml-builder), exportiert `renderPlist` | VERIFIED | 77 Zeilen; `renderPlist`-Export Z.69; Template-String mit allen 6 Platzhaltern; `String.replaceAll`-basiert, keine xml-builder-Dependency        |
| `scripts/install-daemon.ts`   | Komplettes Install-Flow inkl. TCC-Trigger und launchctl bootstrap (min 80 Zeilen)            | VERIFIED | 118 Zeilen (>80); `spawnSync`-Pattern, `process.execPath`, alle 6 Schritte plus 3 launchctl-Verben plus 2 osascript-Trigger                      |
| `scripts/uninstall-daemon.ts` | Symmetrisches Uninstall-Flow (bootout + plist unlink, min 25 Zeilen)                         | VERIFIED | 58 Zeilen (>25); bootout idempotent, fs.unlink mit ENOENT-Toleranz, ESM/NodeNext-konform                                                         |
| `package.json`                | npm-Scripts `install-daemon` und `uninstall-daemon` via tsx                                  | VERIFIED | Beide Scripts vorhanden; `tsx scripts/install-daemon.ts` resp. `tsx scripts/uninstall-daemon.ts`                                                |
| `README.md`                   | User-facing Setup, Troubleshooting, Log-Pfade (min 40 Zeilen)                                | VERIFIED | 124 Zeilen (>40); Voraussetzungen, Setup, Daemon-Steuerung, Logs, Troubleshooting (TCC, Node-Update, exit code 78, Crash-Loop), Architektur     |
| `scripts/lib/plist.test.ts`   | Standalone-Smoke-Test, läuft via tsx ohne Test-Framework                                     | VERIFIED | 55 Zeilen; 7 `node:assert/strict`-Tests; **Live-Run grün**: `[plist.test] all 7 tests passed`, exit 0                                          |

### Key Link Verification

| From                          | To                                                       | Via                                                              | Status | Details                                                                                                                                |
| ----------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/install-daemon.ts`   | `scripts/lib/plist.ts`                                   | `import { renderPlist } from "./lib/plist.js"`                   | WIRED  | `install-daemon.ts:23` Import; Z.67 Aufruf `renderPlist({...})`                                                                       |
| `scripts/install-daemon.ts`   | `process.execPath`                                       | Node-Pfad-Resolution zur Install-Zeit                            | WIRED  | `install-daemon.ts:57` Log; Z.69 in renderPlist-Aufruf als `nodePath`                                                                  |
| `scripts/install-daemon.ts`   | `osascript "tell application Music to player state"`     | TCC-Permission-Trigger im Vordergrund                            | WIRED  | `install-daemon.ts:96` `["-e", 'tell application "Music" to player state']`; allowFailure für Edge-Case Music nicht installiert      |
| `scripts/install-daemon.ts`   | `launchctl`                                              | bootout (idempotent), bootstrap, enable, kickstart               | WIRED  | `install-daemon.ts:103-106` alle 4 Verben in korrekter Reihenfolge per spawnSync; bootout mit allowFailure                            |
| `scripts/uninstall-daemon.ts` | `launchctl`                                              | bootout (idempotent)                                             | WIRED  | `uninstall-daemon.ts:35` `launchctl bootout` mit allowFailure                                                                          |
| `package.json`                | `scripts/install-daemon.ts`                              | `tsx scripts/install-daemon.ts`                                  | WIRED  | `package.json:17` exakt `"tsx scripts/install-daemon.ts"`                                                                              |

### Data-Flow Trace (Level 4)

Phase 4 produziert keinen UI-Renderer und keinen API-Endpoint. Die Artefakte sind Build- und Install-Scripts mit sequenzieller Subprocess-Choreographie. Level-4-Trace nicht anwendbar (keine dynamische Datenquelle, die in einen Renderer fließt). Datenfluss `process.execPath` -> `renderPlist` -> Plist-XML ist über Truth 6 statisch verifiziert.

### Behavioral Spot-Checks

| Behavior                                          | Command                                                                                                  | Result                                                                                                                                  | Status            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Plist-Snapshot-Test läuft durch                  | `npx tsx scripts/lib/plist.test.ts`                                                                       | `[plist.test] all 7 tests passed`, exit 0                                                                                                | PASS              |
| TypeScript clean (Phase-übergreifend)             | `npx tsc -p . --noEmit`                                                                                   | Exit 0, keine Errors                                                                                                                     | PASS              |
| package.json hat beide neuen Scripts              | `node -e "const p=require('./package.json'); ..."`                                                       | install-daemon: tsx scripts/install-daemon.ts; uninstall-daemon: tsx scripts/uninstall-daemon.ts                                          | PASS              |
| renderPlist produziert vollständigen Plist-XML  | `npx tsx -e "import('./scripts/lib/plist.ts').then(({renderPlist}) => console.log(renderPlist({...})))"` | DOCTYPE, alle 6 Substitutionen, KeepAlive-dict, ThrottleInterval=30, RunAtLoad=true, EnvironmentVariables NODE_ENV=production         | PASS              |
| Real-System-Install (`npm run install-daemon`)    | `npm run install-daemon`                                                                                  | nicht ausgeführt — System-Mutation, deferred                                                                                            | SKIP — Plan 04-02 |
| `launchctl list \| grep gather` zeigt Service      | manuelle Live-Verifikation                                                                                | nicht ausgeführt                                                                                                                         | SKIP — Plan 04-02 |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                                  | Status                                          | Evidence                                                                                                                                                                |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CFG-05**  | 04-01       | Logs gehen nach stderr/stdout, launchd routet zu `~/Library/Logs/gather-bridge.{log,err}`                                       | SATISFIED                                       | `scripts/install-daemon.ts:33-34` (`LOG_PATH`, `ERR_PATH` via `path.join(HOME, ...)`); `scripts/lib/plist.ts:45-49` (`StandardOutPath`/`StandardErrorPath`-Keys)        |
| **DMN-01**  | 04-01       | `npm run install-daemon` rendert Plist mit absolutem Node-Pfad (`process.execPath`), schreibt nach `~/Library/LaunchAgents/`    | SATISFIED                                       | `scripts/install-daemon.ts:69` `nodePath: process.execPath`; Z.32 `PLIST_PATH = path.join(HOME, "Library/LaunchAgents", ...)`; Z.83 `fs.writeFile(PLIST_PATH, ...)`     |
| **DMN-02**  | 04-01       | KeepAlive `{SuccessfulExit:false, Crashed:true}` plus ThrottleInterval=30 (kein Endlos-Loop bei exit(0))                       | SATISFIED                                       | `scripts/lib/plist.ts:34-43` (Template enthält KeepAlive-dict plus ThrottleInterval=30); plist.test.ts T3 plus T4 grün; Snapshot-Live-Run zeigt korrekte XML-Form     |
| **DMN-03**  | 04-01       | Install-Script triggert AppleScript-TCC-Permission im Vordergrund                                                                | SATISFIED — partial (Live-TCC-Prompt deferred)  | `scripts/install-daemon.ts:89-98` (zwei osascript-Calls inkl. Music-Player-State); Live-Verhalten = TCC-Dialog deferred zu Plan 04-02                                  |
| **DMN-04**  | 04-01       | Install-Script ruft modernes `launchctl bootstrap`/`enable`/`kickstart` (kein deprecated `load`)                                | SATISFIED                                       | `scripts/install-daemon.ts:103-106` alle 4 Verben; `grep "load"` in install-daemon.ts: kein Treffer (anti-pattern check sauber)                                       |
| **DMN-05**  | 04-01       | `npm run uninstall-daemon` ruft symmetrisches `launchctl bootout` und löscht die Plist                                          | SATISFIED                                       | `scripts/uninstall-daemon.ts:35` (bootout); Z.40 (`fs.unlink`); Z.44-46 (ENOENT-Toleranz)                                                                              |
| **DMN-06**  | 04-01       | Daemon startet automatisch beim Login (RunAtLoad in Plist)                                                                       | SATISFIED — partial (Login-Trigger deferred)    | `scripts/lib/plist.ts:31-32` (`<key>RunAtLoad</key>` plus `<true/>`); plist.test.ts T5 grün; Live-Login-Verhalten deferred zu Plan 04-02 Task 2 Schritt 5             |
| **DMN-07**  | 04-01       | Plist setzt `WorkingDirectory: <repo>` (dotenv findet `.env`)                                                                    | SATISFIED                                       | `scripts/lib/plist.ts:28-29` (`WorkingDirectory`-Key); `scripts/install-daemon.ts:71` `workdir: REPO_DIR` mit `REPO_DIR = path.resolve(__dirname, "..")`               |

**Coverage:** 8/8 Phase-4-Requirements im Code abgedeckt. DMN-03 und DMN-06 sind statisch erfüllt (Code-Pfad existiert), die Live-Verifikation des macOS-OS-Effekts (TCC-Prompt erscheint, Daemon startet nach Login) ist explizit zu Plan 04-02 deferred.

### Anti-Patterns Found

| File | Line | Pattern                                                                | Severity | Impact                                                                                                                                                                       |
| ---- | ---- | ---------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | —    | Hardcoded Node-Pfad (`/usr/local/bin/node`, `/opt/homebrew/bin/node`) | —        | Nicht gefunden. Install-Script nutzt `process.execPath` (Pitfall 23 mitigated)                                                                                              |
| —    | —    | Deprecated `launchctl load`/`unload`                                   | —        | Nicht gefunden. Beide Scripts nutzen ausschließlich `bootout`, `bootstrap`, `enable`, `kickstart`                                                                            |
| —    | —    | Shell-String-Subprocess-Aufruf (Command-Injection-Risiko)              | —        | Nicht gefunden. Beide Scripts nutzen `spawnSync(cmd, args[], {stdio: "inherit"})` mit explizitem Argument-Array — kein Shell-Interpreter, kein Quoting-Risiko             |
| —    | —    | TODO/FIXME/Placeholder-Marker im Phase-4-Code                          | —        | Nicht gefunden (einziger "placeholder"-String-Hit liegt in `plist.test.ts` Z.48 selbst — der Test stellt sicher, dass keine Platzhalter leaken; keine Stub-Indikation)    |
| —    | —    | Tilde in Plist-Pfaden (Pitfall 11)                                     | —        | Nicht gefunden. `LOG_PATH`/`ERR_PATH`/`PLIST_PATH` via `path.join(os.homedir(), ...)` absolut expanded                                                                     |

Phase 4 ist anti-pattern-frei.

### Human Verification Required

Phase 4 ist als Two-Wave-Phase geplant: Plan 04-01 = Code-Artefakte (autonom), Plan 04-02 = Real-System-Verifikation (`checkpoint:human-verify`). Plan 04-02 ist noch nicht abgehakt. Folgende 5 Live-Verifikationen MÜSSEN durch den User auf seinem Mac durchgeführt werden, bevor die Phase als geschlossen gelten kann:

#### 1. install-daemon real ausführen

**Test:**
```bash
cd /Users/plorenz/Development/deepr/gatherAppleMusicBridge
npm run install-daemon
```
**Expected:**
- 6-Step-Console-Output (`[install] step 1/6` bis `[install] DONE`)
- macOS-Dialog "Terminal möchte Music steuern" erscheint einmalig (bei Step 5/6) — User klickt "OK"
- `~/Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist` existiert nach dem Run
- `launchctl list | grep gather-apple-music` zeigt Eintrag mit gültiger PID (Zahl, nicht `-`)
- `launchctl print gui/$(id -u)/agency.deepr.gather-apple-music-bridge` zeigt `state = running`
- `~/Library/Logs/gather-bridge.log` enthält pino-JSON mit Daemon-Startup-Zeilen

**Why human:** FS-Write nach `~/Library/LaunchAgents/`, launchctl-bootstrap-Effekt, und macOS-TCC-Prompt sind nur am laufenden System sichtbar. Plan 04-02 Task 1, Schritte 2 und 3.

#### 2. RunAtLoad nach Login verifizieren (DMN-06 Live)

**Test:** Logout/Login (oder Reboot), danach
```bash
launchctl list | grep gather-apple-music
```
**Expected:** Service ist gelistet mit neuer PID — Daemon startet automatisch ohne manuellen Eingriff.
**Why human:** Login ist OS-Lifecycle-Event, nicht reproduzierbar via Subprocess oder grep. Plan 04-02 Task 2 Schritt 5 (optional, aber empfohlen).

#### 3. AppleScript-Fallback unter launchd-spawned Daemon (DMN-03 Live)

**Test:** Apple Music pausieren, NepTunes optional quitten, 30 s warten, dann
```bash
tail -50 ~/Library/Logs/gather-bridge.log | grep -i "applescript\|fallback\|nowplaying"
```
**Expected:** AppleScript-Fallback feuert ohne `errAEEventNotPermitted (-1743)`. Bei -1743 -> `tccutil reset AppleEvents` und `npm run install-daemon` erneut.
**Why human:** TCC-Permission-Vererbung an launchd-Subprocess ist nur live testbar. Plan 04-02 Task 1 Schritt 5.

#### 4. Crash-Loop-Schutz mit kaputter Config (DMN-02 Live)

**Test:**
```bash
cp .env .env.backup
sed -i.tmp 's/^GATHER_API_KEY=.*/GATHER_API_KEY=invalid-test-key-12345/' .env
launchctl kickstart -k gui/$(id -u)/agency.deepr.gather-apple-music-bridge
sleep 8
launchctl list | grep gather-apple-music
# Expected: PID = "-", exit code 0
mv .env.backup .env && rm -f .env.tmp
launchctl kickstart -k gui/$(id -u)/agency.deepr.gather-apple-music-bridge
```
**Expected:** Mit kaputter Config exited Daemon mit Code 0 (process.exit(0) im Config-Validator), KeepAlive `{SuccessfulExit:false}` blockiert Restart. Nach Restore plus kickstart läuft er wieder.
**Why human:** Live-launchd-Verhalten messbar nur am echten Service. Plan 04-02 Task 1 Schritt 4.

#### 5. uninstall-daemon real ausführen, idempotent

**Test:**
```bash
npm run uninstall-daemon
ls ~/Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist 2>&1
launchctl list | grep gather-apple-music
ps aux | grep -i gather-apple-music | grep -v grep
npm run uninstall-daemon  # zweiter Run, Idempotenz
echo "Exit code: $?"
```
**Expected:** Erste Plist gelöscht, Service entladen, kein Prozess mehr. Zweiter Run druckt "no plist to remove (already gone)" und exit 0.
**Why human:** Live-FS- und launchctl-Effekte. Plan 04-02 Task 2 Schritte 3 und 4.

### Gaps Summary

Keine echten Gaps. Phase 4 Plan 04-01 (Code-Artefakte) ist vollständig, korrekt, anti-pattern-frei. Alle 6 statischen must_haves aus dem Plan-Frontmatter sind in der Codebase nachweisbar. Die 5 deferred Live-Items sind Plan-Locked als `checkpoint:human-verify` in Plan 04-02 Wave 2 (`autonomous: false`, `gate: blocking`) — kein Verifier-Gap, sondern Plan-Design.

**Phase-Status nach User-Approval von Plan 04-02:** PASSED. Bis dahin: human_needed (Live-Tests pending).

---

_Verified: 2026-05-08T17:27:26Z_
_Verifier: Claude (gsd-verifier)_
