// scripts/uninstall-daemon.ts
// Symmetrisches Uninstall: bootout + plist unlink (DMN-05).
// Aufruf: `npm run uninstall-daemon`
// Subprocess-Aufrufe via spawnSync mit Argument-Array, kein Shell-String.

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const LABEL = "agency.deepr.gather-apple-music-bridge";
const LAUNCHER_LABEL = "agency.deepr.gathervtwo-debug-launcher";
const HOME = os.homedir();
const PLIST_PATH = path.join(HOME, "Library/LaunchAgents", `${LABEL}.plist`);
const LAUNCHER_PLIST_PATH = path.join(
  HOME,
  "Library/LaunchAgents",
  `${LAUNCHER_LABEL}.plist`,
);
const DOMAIN = `gui/${os.userInfo().uid}`;

function run(cmd: string, args: string[], { allowFailure = false } = {}): void {
  console.log(`[uninstall] $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error && !allowFailure) {
    console.error(`[uninstall] FAILED: ${cmd} (${result.error.message})`);
    process.exit(1);
  }
  if (result.status !== 0 && !allowFailure) {
    console.error(`[uninstall] FAILED: ${cmd} exited with code ${result.status}`);
    process.exit(1);
  }
}

async function unloadAndDelete(label: string, plistPath: string): Promise<void> {
  console.log(`[uninstall] $ launchctl bootout ${DOMAIN} ${plistPath}`);
  run("launchctl", ["bootout", DOMAIN, plistPath], { allowFailure: true });
  try {
    await fs.unlink(plistPath);
    console.log(`[uninstall]   plist removed: ${plistPath}`);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      console.log(`[uninstall]   no plist to remove at ${plistPath} (already gone).`);
    } else {
      throw err;
    }
  }
  void label; // label is for log context elsewhere
}

async function main(): Promise<void> {
  console.log("[uninstall] starting daemon + launcher uninstall");

  // 1. Bridge-Daemon
  console.log("[uninstall] step 1/2 — bridge daemon");
  await unloadAndDelete(LABEL, PLIST_PATH);

  // 2. GatherV2-Launcher
  console.log("[uninstall] step 2/2 — GatherV2 auto-launcher");
  await unloadAndDelete(LAUNCHER_LABEL, LAUNCHER_PLIST_PATH);

  console.log("");
  console.log("[uninstall] DONE — both LaunchAgents removed. Neither will start at next login.");
  console.log("[uninstall] (GatherV2 itself is not affected; it just won't auto-start with debug-port.)");
}

main().catch((err) => {
  console.error("[uninstall] FATAL", err);
  process.exit(1);
});
