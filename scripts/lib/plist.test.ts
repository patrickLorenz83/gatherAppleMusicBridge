// scripts/lib/plist.test.ts
// Standalone smoke test: `tsx scripts/lib/plist.test.ts`
// Exit 0 = pass, exit 1 = fail.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { renderPlist, renderGatherLauncherPlist } from "./plist.js";

// Use machine-agnostic fixture paths so the test runs anywhere.
const HOME = os.homedir();
const FIXTURE = {
  label: "agency.deepr.gather-apple-music-bridge",
  nodePath: process.execPath,
  scriptPath: path.join(HOME, "test-fixture/dist/src/index.js"),
  workdir: path.join(HOME, "test-fixture"),
  logPath: path.join(HOME, "Library/Logs/gather-bridge.log"),
  errPath: path.join(HOME, "Library/Logs/gather-bridge.err"),
};

const out = renderPlist(FIXTURE);

// Test 1: DOCTYPE
assert.match(
  out,
  /<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN"/,
  "T1 DOCTYPE missing",
);

// Test 2: Substituted values
assert.ok(out.includes(`<string>${FIXTURE.label}</string>`), "T2 label not substituted");
assert.ok(out.includes(`<string>${FIXTURE.nodePath}</string>`), "T2 nodePath not substituted");
assert.ok(out.includes(`<string>${FIXTURE.scriptPath}</string>`), "T2 scriptPath not substituted");
assert.ok(out.includes(`<string>${FIXTURE.workdir}</string>`), "T2 workdir not substituted");
assert.ok(out.includes(`<string>${FIXTURE.logPath}</string>`), "T2 logPath not substituted");
assert.ok(out.includes(`<string>${FIXTURE.errPath}</string>`), "T2 errPath not substituted");

// Test 3: KeepAlive must be a dict, NOT a plain boolean
assert.match(
  out,
  /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<key>Crashed<\/key>\s*<true\/>\s*<\/dict>/,
  "T3 KeepAlive not as dict-with-SuccessfulExit-false-and-Crashed-true",
);
assert.ok(
  !/<key>KeepAlive<\/key>\s*<true\/>/.test(out),
  "T3 KeepAlive must not be a plain <true/>",
);

// Test 4: ThrottleInterval 30
assert.match(
  out,
  /<key>ThrottleInterval<\/key>\s*<integer>30<\/integer>/,
  "T4 ThrottleInterval missing",
);

// Test 5: RunAtLoad true
assert.match(out, /<key>RunAtLoad<\/key>\s*<true\/>/, "T5 RunAtLoad missing");

// Test 6: No leftover placeholders
for (const ph of ["{LABEL}", "{NODE_PATH}", "{SCRIPT_PATH}", "{WORKDIR}", "{LOG_PATH}", "{ERR_PATH}"]) {
  assert.ok(!out.includes(ph), `T6 placeholder leaked: ${ph}`);
}

// Test 7: Determinism
const out2 = renderPlist(FIXTURE);
assert.equal(out, out2, "T7 not deterministic");

// Test 8: XML-escape — paths with `&`, `<`, `>` must not break the plist
const TRICKY = {
  ...FIXTURE,
  workdir: "/Users/Q&A/repo<test>",
};
const trickyOut = renderPlist(TRICKY);
assert.ok(
  trickyOut.includes("/Users/Q&amp;A/repo&lt;test&gt;"),
  "T8 XML-special chars not escaped (& < >)",
);
assert.ok(
  !trickyOut.includes("/Users/Q&A/repo<test>"),
  "T8 raw special chars leaked into plist",
);

// Test 9: Launcher plist renders correctly with required fields
const launcherOut = renderGatherLauncherPlist({
  label: "agency.deepr.gathervtwo-debug-launcher",
  appPath: "/Applications/GatherV2.app",
  debugPort: 9222,
  logPath: path.join(HOME, "Library/Logs/gather-launcher.log"),
  errPath: path.join(HOME, "Library/Logs/gather-launcher.err"),
});
assert.match(launcherOut, /<string>\/usr\/bin\/open<\/string>/, "T9 launcher missing /usr/bin/open");
assert.match(
  launcherOut,
  /<string>--remote-debugging-port=9222<\/string>/,
  "T9 launcher missing --remote-debugging-port=9222",
);
assert.match(launcherOut, /<key>RunAtLoad<\/key>\s*<true\/>/, "T9 launcher missing RunAtLoad");
assert.ok(
  !launcherOut.includes("<key>KeepAlive</key>"),
  "T9 launcher must NOT have KeepAlive (user-quit should stay quit)",
);

console.log("[plist.test] all 9 tests passed");
