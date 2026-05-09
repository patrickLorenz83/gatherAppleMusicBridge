---
phase: 4
phase_name: launchd-Installation
gathered: 2026-05-08
status: ready_for_planning
mode: auto-generated (skip_discuss=true)
---

# Phase 4: launchd-Installation — Context

<domain>
## Phase Boundary

**Goal:** Bridge läuft als unsichtbarer Background-Daemon, der bei Login automatisch startet, bei Crash neu gestartet wird (aber nicht bei Config-Fehlern), und Logs in `~/Library/Logs/gather-bridge.{log,err}` schreibt.

**Requirements (8):** CFG-05, DMN-01, DMN-02, DMN-03, DMN-04, DMN-05, DMN-06, DMN-07

**Success Criteria:**
1. `npm run install-daemon` rendert Plist mit absolutem `process.execPath` für Node, schreibt nach `~/Library/LaunchAgents/`, ruft `launchctl bootstrap`/`enable`/`kickstart` und triggert TCC-Permission im Vordergrund.
2. Nach Login startet der Daemon automatisch (RunAtLoad), läuft im Hintergrund ohne UI und setzt Gather-Status während Apple-Music-Sessions.
3. Bei Config-Fehler exited der Daemon mit Code 0 und wird nicht in eine Endlosschleife restartet — `KeepAlive: { SuccessfulExit: false, Crashed: true }` plus `ThrottleInterval: 30`.
4. AppleScript-Fallback funktioniert auch unter dem launchd-spawned Daemon, weil das Install-Script die TCC-Automation-Permission im Vordergrund initial getriggert hat.
5. `npm run uninstall-daemon` ruft `launchctl bootout` und löscht die Plist; nach `bootout` setzt der Daemon keinen Gather-Status mehr und startet nicht beim nächsten Login.
</domain>

<decisions>
## Implementation Decisions (Locked)

- **Plist-Label:** `agency.deepr.gather-apple-music-bridge` (Reverse-Domain-Convention; deepr.agency = Patricks Domain)
- **Plist-Speicherort:** `~/Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist`
- **Build-Strategy:** Daemon läuft aus `dist/` (kompiliert via `tsc -p .`), NICHT via `tsx`. Begründung: production-mode, weniger Subprocess-Overhead, kein devdep-runtime in launchd-Kontext.
- **Node-Pfad:** Absolut via `process.execPath` zum Build-Zeitpunkt (z.B. `/Users/plorenz/.nvm/versions/node/v24.15.0/bin/node`). NICHT `/usr/local/bin/node` hardcoded.
- **WorkingDirectory:** Repo-Root (z.B. `/Users/plorenz/Development/deepr/gatherAppleMusicBridge`), damit `dotenv` die `.env` findet.
- **launchctl-API:** `bootstrap` und `bootout` (modern), NICHT `load -w`/`unload` (deprecated).
- **KeepAlive:** `{ SuccessfulExit: false, Crashed: true }` — config-Fehler (exit 0) werden NICHT geneu gestartet, Crashes (exit ≠ 0) schon. Plus `ThrottleInterval: 30` (mindestens 30s zwischen Restart-Attempts).
- **TCC-Trigger:** Install-Script führt `osascript -e 'tell application "Music" to player state'` im Vordergrund aus (Terminal als Apple-Event-Sender), so dass macOS den Permission-Prompt einmalig im sichtbaren Vordergrund anzeigt. Ohne diesen Trigger würde der launchd-spawned Daemon lautlos `errAEEventNotPermitted (-1743)` werfen, ohne dass der User je gefragt würde.
- **Logs:** `StandardOutPath` und `StandardErrorPath` in der Plist auf `~/Library/Logs/gather-bridge.log` (resp. `.err`). Tilde wird vom launchd-Plist-Parser nicht expanded → wir schreiben den absoluten User-Pfad zur Install-Zeit.

### Datei-Layout

- `scripts/install-daemon.ts` — TS-Script, baut Projekt, rendert Plist, schreibt sie nach LaunchAgents, ruft launchctl, triggert TCC
- `scripts/uninstall-daemon.ts` — bootout + Plist-Löschen
- `scripts/lib/plist.ts` — Plist-Template-Funktion `renderPlist({label, nodePath, scriptPath, workdir, logPath, errPath})`: returns String (XML)
- `package.json` — neue Scripts: `install-daemon`, `uninstall-daemon`, ggf. `prebuild`/`postinstall` als Helper
- `README.md` (optional kurz, kein Open-Source-Doku) — User-facing Setup-Steps

### Plist-Template (XML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>agency.deepr.gather-apple-music-bridge</string>
  
  <key>ProgramArguments</key>
  <array>
    <string>{NODE_PATH}</string>
    <string>{REPO_DIR}/dist/index.js</string>
  </array>
  
  <key>WorkingDirectory</key>
  <string>{REPO_DIR}</string>
  
  <key>RunAtLoad</key>
  <true/>
  
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  
  <key>ThrottleInterval</key>
  <integer>30</integer>
  
  <key>StandardOutPath</key>
  <string>{LOG_PATH}</string>
  
  <key>StandardErrorPath</key>
  <string>{ERR_PATH}</string>
  
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
</dict>
</plist>
```

Substitution per `String.replaceAll` (kein xml-builder lib nötig — überschaubar).

### Install-Flow

```typescript
async function install() {
  // 1. tsc build (dist/)
  await runShell('npm run build');
  
  // 2. Plist rendern
  const plistContent = renderPlist({
    label: 'agency.deepr.gather-apple-music-bridge',
    nodePath: process.execPath,
    scriptPath: path.join(REPO_DIR, 'dist/index.js'),
    workdir: REPO_DIR,
    logPath: path.join(os.homedir(), 'Library/Logs/gather-bridge.log'),
    errPath: path.join(os.homedir(), 'Library/Logs/gather-bridge.err'),
  });
  
  // 3. Plist-Pfad
  const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist');
  
  // 4. Plist schreiben
  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  await fs.writeFile(plistPath, plistContent, 'utf-8');
  
  // 5. Logs-Verzeichnis sicherstellen
  await fs.mkdir(path.join(os.homedir(), 'Library/Logs'), { recursive: true });
  
  // 6. TCC-Trigger im Vordergrund
  console.log('[install] Triggering AppleScript Automation permission...');
  console.log('[install] If a macOS dialog asks "Terminal möchte Music steuern" — click OK.');
  try {
    await runShell(`osascript -e 'tell application "System Events" to (exists application process "Music")'`);
    await runShell(`osascript -e 'tell application "Music" to player state' || true`);
  } catch (err) {
    console.warn('[install] AppleScript trigger failed — TCC permission may need manual grant via System Settings → Privacy → Automation.', err);
  }
  
  // 7. launchctl bootstrap
  const domain = `gui/${os.userInfo().uid}`;
  await runShell(`launchctl bootout ${domain} ${plistPath} 2>/dev/null || true`); // idempotent re-install
  await runShell(`launchctl bootstrap ${domain} ${plistPath}`);
  await runShell(`launchctl enable ${domain}/agency.deepr.gather-apple-music-bridge`);
  await runShell(`launchctl kickstart -k ${domain}/agency.deepr.gather-apple-music-bridge`);
  
  console.log('[install] Daemon installed.');
}
```

### Uninstall-Flow

```typescript
async function uninstall() {
  const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist');
  const domain = `gui/${os.userInfo().uid}`;
  
  await runShell(`launchctl bootout ${domain} ${plistPath} || true`); // idempotent
  
  try {
    await fs.unlink(plistPath);
    console.log('[uninstall] Plist removed:', plistPath);
  } catch (err: any) {
    if (err.code === 'ENOENT') console.log('[uninstall] No plist to remove.');
    else throw err;
  }
  
  console.log('[uninstall] Daemon uninstalled.');
}
```
</decisions>

<code_context>
## Existing Code (aus Phase 1-3)

Phase 1: Foundation, Sink
Phase 2: Sources
Phase 3: `src/index.ts` als Daemon-Entrypoint, kompiliert via `tsc` zu `dist/index.js`

`package.json` hat schon `build`-Script. Wir ergänzen `install-daemon` und `uninstall-daemon`.
</code_context>

<specifics>
## Specific Notes (PITFALLS)

- **Pitfall 11 — Tilde-Expansion:** launchd-Plist macht KEIN `~`-Expand. `~/Library/Logs/gather-bridge.log` MUSS zur Install-Zeit zu `/Users/plorenz/Library/Logs/gather-bridge.log` resolved werden.
- **Pitfall 13 — TCC im launchd-Context:** Daemon, der direkt von launchd gespawnt wird, kann den AppleScript-Permission-Prompt nicht im UI zeigen. Trigger MUSS im Vordergrund (Install-Script) laufen, BEVOR der Daemon je startet.
- **Pitfall 19 — Crash-Loop:** `KeepAlive: true` (boolean) würde bei jedem Exit restarten. Wir nutzen `KeepAlive: dict` mit `SuccessfulExit: false` (kein Restart bei sauberem Exit aka exit 0) und `Crashed: true` (Restart nur bei abnormalem Exit).
- **Pitfall 22 — `gui/<uid>`-Domain:** LaunchAgents leben im `gui/<uid>`-Domain (nicht `system/`). `os.userInfo().uid` liefert die UID.
- **Pitfall 23 — `process.execPath` hardcoded:** beim Install-Zeit wird `process.execPath` resolved. Wenn der User später Node updated (z.B. nvm auf 26), muss er `npm run install-daemon` erneut ausführen — Plist enthält dann den neuen Pfad. Dokumentiere das im README.

### TCC-Permission-Reset (für Re-Trigger)

Wenn der erste Trigger nicht geklappt hat (User hat den Dialog weggeklickt), kann er manuell zurückgesetzt werden:
```bash
tccutil reset AppleEvents
```
Danach `npm run install-daemon` erneut.

### Smoke-Test-Plan

1. Plist nach Install existiert: `ls ~/Library/LaunchAgents/agency.deepr.gather-apple-music-bridge.plist`
2. launchctl listet Service: `launchctl list | grep gather-apple-music`
3. Logs erscheinen: `tail -f ~/Library/Logs/gather-bridge.log`
4. Bei Pause/Play: Gather-Status reagiert binnen 10-15s
5. `npm run uninstall-daemon` → Service weg, Plist gelöscht
6. Neustart-Test: `launchctl kickstart -k gui/$(id -u)/agency.deepr.gather-apple-music-bridge` startet neu mit korrekten Logs
</specifics>

<deferred>
## Deferred to v2

- ROBUST-01..03: Heartbeat, Reconnect, Backoff
- QOL-01..04: Längen-Cap, Log-Level, Source-Labels, Format-Templates
- Auto-Update-Mechanismus (out of scope per PROJECT.md)
- Single-Binary-Distribution (out of scope per PROJECT.md)
</deferred>
