// scripts/lib/plist.ts
// Template-Funktion für launchd-Plist (XML).
// Substitution per String.replaceAll, alle Werte XML-escaped.

export interface PlistInput {
  label: string;
  nodePath: string;
  scriptPath: string;
  workdir: string;
  logPath: string;
  errPath: string;
}

/**
 * Escape XML-special characters in attribute/text values.
 * Necessary because user paths can contain `&` (e.g., `/Users/Q&A/...`),
 * `<` or `>` (rare on filesystems, but legal). Without escaping the
 * resulting plist would be malformed XML and launchctl would reject it.
 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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
 * Substitutes the six placeholders in the static template via `String.replaceAll`.
 * All input values are XML-escaped to handle paths with `&`, `<`, `>` etc.
 * Output is deterministic and byte-stable for identical inputs.
 *
 * @param input  PlistInput with all six substitution values (absolute paths preferred — launchd does NOT expand `~`).
 * @returns      Full plist XML string, ready to write to `~/Library/LaunchAgents/<label>.plist`.
 */
export function renderPlist(input: PlistInput): string {
  return TEMPLATE
    .replaceAll("{LABEL}", escapeXml(input.label))
    .replaceAll("{NODE_PATH}", escapeXml(input.nodePath))
    .replaceAll("{SCRIPT_PATH}", escapeXml(input.scriptPath))
    .replaceAll("{WORKDIR}", escapeXml(input.workdir))
    .replaceAll("{LOG_PATH}", escapeXml(input.logPath))
    .replaceAll("{ERR_PATH}", escapeXml(input.errPath));
}

export interface GatherLauncherInput {
  label: string;
  appPath: string; // absolute path, e.g. /Applications/GatherV2.app
  debugPort: number; // 1024-65535
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
 * renderGatherLauncherPlist — Plist for the GatherV2 auto-launcher LaunchAgent.
 *
 * Different from the bridge plist:
 * - NO KeepAlive (when the user quits the app it should stay quit)
 * - NO WorkingDirectory (irrelevant for `open -a`)
 * - Uses `/usr/bin/open` so macOS launches the app normally (handles signing, sandbox, etc.)
 * - `--args --remote-debugging-port=N` exposes the Chrome DevTools Protocol endpoint
 *
 * Behavior: at login (RunAtLoad) GatherV2 starts ONCE with the debug port. If
 * the user quits the app, it does NOT restart — the next launch happens at the
 * next login (or via `launchctl kickstart -k`).
 */
export function renderGatherLauncherPlist(input: GatherLauncherInput): string {
  return LAUNCHER_TEMPLATE
    .replaceAll("{LABEL}", escapeXml(input.label))
    .replaceAll("{APP_PATH}", escapeXml(input.appPath))
    .replaceAll("{DEBUG_PORT}", String(input.debugPort))
    .replaceAll("{LOG_PATH}", escapeXml(input.logPath))
    .replaceAll("{ERR_PATH}", escapeXml(input.errPath));
}
