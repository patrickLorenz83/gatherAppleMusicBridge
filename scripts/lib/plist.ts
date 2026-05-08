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
