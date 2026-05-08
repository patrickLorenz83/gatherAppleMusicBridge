// scripts/lib/plist.test.ts
// Standalone-Smoke-Test: `tsx scripts/lib/plist.test.ts`
// Exit 0 = pass, exit 1 = fail.
import assert from "node:assert/strict";
import { renderPlist } from "./plist.js";

const FIXTURE = {
  label: "agency.deepr.gather-apple-music-bridge",
  nodePath: "/Users/plorenz/.nvm/versions/node/v24.15.0/bin/node",
  scriptPath: "/Users/plorenz/Development/deepr/gatherAppleMusicBridge/dist/index.js",
  workdir: "/Users/plorenz/Development/deepr/gatherAppleMusicBridge",
  logPath: "/Users/plorenz/Library/Logs/gather-bridge.log",
  errPath: "/Users/plorenz/Library/Logs/gather-bridge.err",
};

const out = renderPlist(FIXTURE);

// Test 1: DOCTYPE
assert.match(out, /<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN"/, "T1 DOCTYPE missing");

// Test 2: Substituierte Werte
assert.ok(out.includes(`<string>${FIXTURE.label}</string>`), "T2 label not substituted");
assert.ok(out.includes(`<string>${FIXTURE.nodePath}</string>`), "T2 nodePath not substituted");
assert.ok(out.includes(`<string>${FIXTURE.scriptPath}</string>`), "T2 scriptPath not substituted");
assert.ok(out.includes(`<string>${FIXTURE.workdir}</string>`), "T2 workdir not substituted");
assert.ok(out.includes(`<string>${FIXTURE.logPath}</string>`), "T2 logPath not substituted");
assert.ok(out.includes(`<string>${FIXTURE.errPath}</string>`), "T2 errPath not substituted");

// Test 3: KeepAlive ist dict, NICHT boolean
assert.match(
  out,
  /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<key>Crashed<\/key>\s*<true\/>\s*<\/dict>/,
  "T3 KeepAlive not as dict-with-SuccessfulExit-false-and-Crashed-true",
);
assert.ok(
  !/<key>KeepAlive<\/key>\s*<true\/>/.test(out),
  "T3 KeepAlive must not be a plain <true/> (Pitfall 19)",
);

// Test 4: ThrottleInterval 30
assert.match(out, /<key>ThrottleInterval<\/key>\s*<integer>30<\/integer>/, "T4 ThrottleInterval missing");

// Test 5: RunAtLoad true
assert.match(out, /<key>RunAtLoad<\/key>\s*<true\/>/, "T5 RunAtLoad missing");

// Test 6: Keine Platzhalter
for (const ph of ["{LABEL}", "{NODE_PATH}", "{SCRIPT_PATH}", "{WORKDIR}", "{LOG_PATH}", "{ERR_PATH}"]) {
  assert.ok(!out.includes(ph), `T6 placeholder leaked: ${ph}`);
}

// Test 7: Determinismus
const out2 = renderPlist(FIXTURE);
assert.equal(out, out2, "T7 not deterministic");

console.log("[plist.test] all 7 tests passed");
