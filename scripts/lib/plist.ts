// scripts/lib/plist.ts
// Template-Funktion für launchd-Plist (XML).
// Substitution per String.replaceAll, kein xml-builder.
// Locked-Decisions: siehe 04-CONTEXT.md und 04-01-PLAN.md.

export interface PlistInput {
  label: string;
  nodePath: string;
  scriptPath: string;
  workdir: string;
  logPath: string;
  errPath: string;
}

const TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>{NODE_PATH}</string>
    <string>{SCRIPT_PATH}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>{WORKDIR}</string>

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
`;

/**
 * renderPlist — XML-Plist-Renderer für den launchd-LaunchAgent.
 *
 * Substituiert die sechs Platzhalter im statischen Template per `String.replaceAll`.
 * Kein XML-Builder, keine Dependencies. Output ist deterministisch und byte-stabil.
 *
 * @param input  PlistInput mit allen sechs Substitutions-Werten (alle absolut, kein Tilde-Expand zur Render-Zeit nötig).
 * @returns      Vollständiger Plist-XML-String, ready zum Schreiben nach `~/Library/LaunchAgents/<label>.plist`.
 */
export function renderPlist(input: PlistInput): string {
  return TEMPLATE
    .replaceAll("{LABEL}", input.label)
    .replaceAll("{NODE_PATH}", input.nodePath)
    .replaceAll("{SCRIPT_PATH}", input.scriptPath)
    .replaceAll("{WORKDIR}", input.workdir)
    .replaceAll("{LOG_PATH}", input.logPath)
    .replaceAll("{ERR_PATH}", input.errPath);
}

export interface GatherLauncherInput {
  label: string;
  appPath: string;     // absolute, z.B. /Applications/GatherV2.app
  debugPort: number;   // z.B. 9222
  logPath: string;
  errPath: string;
}

const LAUNCHER_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>{APP_PATH}</string>
    <string>--args</string>
    <string>--remote-debugging-port={DEBUG_PORT}</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>{LOG_PATH}</string>

  <key>StandardErrorPath</key>
  <string>{ERR_PATH}</string>
</dict>
</plist>
`;

/**
 * renderGatherLauncherPlist — Plist für den GatherV2-Auto-Launcher.
 *
 * Anders als der Bridge-Plist:
 * - KEIN KeepAlive (App soll NICHT neu starten wenn der User sie selbst schließt)
 * - KEIN WorkingDirectory (irrelevant für `open -a`)
 * - Nutzt `/usr/bin/open` damit macOS die App regulär launcht (kein direktes Helper-Binary)
 * - `--args --remote-debugging-port=N` öffnet GatherV2 mit Chrome-DevTools-Endpoint
 *
 * Verhalten: bei Login (RunAtLoad) startet GatherV2 EINMAL mit Debug-Port. Wird
 * die App vom User geschlossen, startet sie nicht wieder — der nächste Restart
 * passiert erst beim nächsten Login.
 */
export function renderGatherLauncherPlist(input: GatherLauncherInput): string {
  return LAUNCHER_TEMPLATE
    .replaceAll("{LABEL}", input.label)
    .replaceAll("{APP_PATH}", input.appPath)
    .replaceAll("{DEBUG_PORT}", String(input.debugPort))
    .replaceAll("{LOG_PATH}", input.logPath)
    .replaceAll("{ERR_PATH}", input.errPath);
}
