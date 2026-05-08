// scripts/uninstall-daemon.ts
// Symmetrisches Uninstall: bootout + plist unlink (DMN-05).
// Aufruf: `npm run uninstall-daemon`
// Subprocess-Aufrufe via spawnSync mit Argument-Array, kein Shell-String.

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const LABEL = "agency.deepr.gather-apple-music-bridge";
const HOME = os.homedir();
const PLIST_PATH = path.join(HOME, "Library/LaunchAgents", `${LABEL}.plist`);
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

async function main(): Promise<void> {
  console.log("[uninstall] starting daemon uninstall");
  console.log(`[uninstall] plist: ${PLIST_PATH}`);

  // 1. bootout (idempotent, toleriere "service not loaded")
  console.log("[uninstall] step 1/2 — launchctl bootout");
  run("launchctl", ["bootout", DOMAIN, PLIST_PATH], { allowFailure: true });

  // 2. Plist löschen (idempotent, toleriere ENOENT)
  console.log("[uninstall] step 2/2 — removing plist");
  try {
    await fs.unlink(PLIST_PATH);
    console.log(`[uninstall]   plist removed: ${PLIST_PATH}`);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      console.log("[uninstall]   no plist to remove (already gone).");
    } else {
      throw err;
    }
  }

  console.log("");
  console.log("[uninstall] DONE — daemon uninstalled. It will NOT start at next login.");
}

main().catch((err) => {
  console.error("[uninstall] FATAL", err);
  process.exit(1);
});
