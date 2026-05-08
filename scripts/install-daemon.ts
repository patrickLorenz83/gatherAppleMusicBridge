// scripts/install-daemon.ts
// Vollständiger Install-Flow für den launchd-Daemon.
// Aufruf: `npm run install-daemon`
// Schritte:
//   1. tsc-Build (npm run build)
//   2. Plist rendern mit process.execPath, REPO_DIR, ~/Library/Logs/...
//   3. ~/Library/LaunchAgents/ und ~/Library/Logs/ anlegen (mkdir -p)
//   4. Plist-Datei nach ~/Library/LaunchAgents/<label>.plist schreiben
//   5. TCC-Permission im Vordergrund triggern (osascript), DMN-03, Pitfall 7 und 13
//   6. launchctl bootout (idempotent), bootstrap, enable, kickstart -k. DMN-04.
//
// Subprocess-Aufrufe nutzen ausschließlich spawnSync mit Argument-Array,
// niemals exec/Shell-Interpolation. Damit ist Command-Injection ausgeschlossen.
//
// Locked Decisions siehe .planning/phases/04-launchd-installation/04-CONTEXT.md.

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderPlist } from "./lib/plist.js";

const LABEL = "agency.deepr.gather-apple-music-bridge";

// Repo-Root: zwei Ebenen über dieser Datei (scripts/install-daemon.ts -> repo root).
const __filename = fileURLToPath(import.meta.url);
const REPO_DIR = path.resolve(path.dirname(__filename), "..");

const HOME = os.homedir();
const PLIST_PATH = path.join(HOME, "Library/LaunchAgents", `${LABEL}.plist`);
const LOG_PATH = path.join(HOME, "Library/Logs/gather-bridge.log");
const ERR_PATH = path.join(HOME, "Library/Logs/gather-bridge.err");
const SCRIPT_PATH = path.join(REPO_DIR, "dist/index.js");
const DOMAIN = `gui/${os.userInfo().uid}`;

function run(cmd: string, args: string[], { allowFailure = false } = {}): void {
  console.log(`[install] $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error) {
    if (!allowFailure) {
      console.error(`[install] FAILED: ${cmd} (${result.error.message})`);
      process.exit(1);
    }
    return;
  }
  if (result.status !== 0 && !allowFailure) {
    console.error(`[install] FAILED: ${cmd} exited with code ${result.status}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log("[install] starting daemon installation");
  console.log(`[install] repo:  ${REPO_DIR}`);
  console.log(`[install] node:  ${process.execPath}`);
  console.log(`[install] plist: ${PLIST_PATH}`);
  console.log(`[install] logs:  ${LOG_PATH} / ${ERR_PATH}`);

  // 1. Build
  console.log("[install] step 1/6 — building dist/ via tsc");
  run("npm", ["run", "build"]);

  // 2. Plist rendern
  console.log("[install] step 2/6 — rendering plist");
  const plistContent = renderPlist({
    label: LABEL,
    nodePath: process.execPath,
    scriptPath: SCRIPT_PATH,
    workdir: REPO_DIR,
    logPath: LOG_PATH,
    errPath: ERR_PATH,
  });

  // 3. Verzeichnisse anlegen
  console.log("[install] step 3/6 — ensuring LaunchAgents/ and Logs/ directories");
  await fs.mkdir(path.dirname(PLIST_PATH), { recursive: true });
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });

  // 4. Plist schreiben
  console.log("[install] step 4/6 — writing plist");
  await fs.writeFile(PLIST_PATH, plistContent, "utf-8");

  // 5. TCC-Permission im Vordergrund triggern (Pitfall 7 und 13, DMN-03)
  console.log("[install] step 5/6 — triggering AppleScript Automation permission");
  console.log('[install]   If a macOS dialog asks "Terminal möchte Music steuern" — click OK.');
  console.log('[install]   Without this, the launchd-spawned daemon would silently fail with errAEEventNotPermitted (-1743).');
  run(
    "osascript",
    ["-e", 'tell application "System Events" to (exists application process "Music")'],
    { allowFailure: true },
  );
  run(
    "osascript",
    ["-e", 'tell application "Music" to player state'],
    { allowFailure: true },
  );

  // 6. launchctl bootstrap-Sequenz (DMN-04)
  console.log("[install] step 6/6 — launchctl bootstrap sequence");
  // bootout vor bootstrap macht Re-Install idempotent. Failure tolerieren (= Service war nicht geladen).
  run("launchctl", ["bootout", DOMAIN, PLIST_PATH], { allowFailure: true });
  run("launchctl", ["bootstrap", DOMAIN, PLIST_PATH]);
  run("launchctl", ["enable", `${DOMAIN}/${LABEL}`]);
  run("launchctl", ["kickstart", "-k", `${DOMAIN}/${LABEL}`]);

  console.log("");
  console.log("[install] DONE — daemon installed and started.");
  console.log(`[install] Status:    launchctl print ${DOMAIN}/${LABEL}`);
  console.log(`[install] Tail logs: tail -f ${LOG_PATH}`);
  console.log(`[install] Uninstall: npm run uninstall-daemon`);
}

main().catch((err) => {
  console.error("[install] FATAL", err);
  process.exit(1);
});
