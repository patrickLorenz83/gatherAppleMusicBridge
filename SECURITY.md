# Security

## Threat model

This is a **local-only daemon**. There is no cloud backend, no remote
control plane, no analytics. All state lives on the user's machine.

### What the bridge does

1. Reads the currently-playing track from `Music.app` via AppleScript.
2. Connects to a locally-running GatherV2 Electron app over the
   Chrome DevTools Protocol (`localhost:9222` by default).
3. Calls `gatherDev.Repos.gameSpace.currentSpaceUser.setCustomStatus(...)`
   inside the GatherV2 renderer to set a custom status.

### What the bridge does NOT do

- It does not phone home, does not send telemetry, and does not contact
  any third-party service except through GatherV2's own auth.
- It does not store, log, or transmit Gather credentials.
  Authentication is handled entirely by the GatherV2 app itself.
- It does not control playback. AppleScript is read-only here
  (`player state`, `current track`).

## Surface area

The most powerful capability the bridge enables is **arbitrary JavaScript
execution inside the GatherV2 renderer process** via the CDP debug port.
Anyone who can reach `localhost:9222` on your machine can do the same.

### Mitigations

1. **Localhost binding.** The Chrome DevTools Protocol port that GatherV2
   exposes via `--remote-debugging-port=9222` listens on `127.0.0.1` only,
   not on `0.0.0.0`. Remote machines on your LAN cannot reach it.

2. **No user-controlled input crosses the eval boundary.** The expressions
   the bridge evaluates in the renderer are static templates with
   parameters interpolated via `JSON.stringify()`. Track names containing
   `"`, `'`, `\n`, `</script>`, etc. cannot escape the string literal.
   See `src/sink/gather.ts` (`runInPage`, `setStatus`).

3. **AppleScript injection is not possible.** The AppleScript executed
   against `Music.app` is a static string with no user-controlled
   interpolation. See `src/sources/applescript.ts`.

4. **Subprocess hygiene.** All `spawnSync` calls use argument arrays
   (`["arg1", "arg2"]`), never shell strings. No command injection
   surface.

5. **Auto-heal is opt-out.** The bridge can quit and relaunch GatherV2
   if it finds the app running without the debug port. This is enabled
   by default but can be disabled with `GATHER_AUTO_HEAL=0` for users
   who don't want the bridge touching their app process.

### Residual risk

- **Local trust boundary:** if another local process (malware, another
  user account on the same machine, an IDE plugin) reaches the CDP port,
  it can do more than set a status — it can read all of the GatherV2
  renderer's state including the user's session. This is true for any
  Electron app started with a remote debugging port. **Do not run the
  daemon on shared machines or while untrusted local code is running.**
- **Plist user input:** the launchd plist writes paths like
  `process.execPath` and the repo directory. These come from the
  installer's own environment, not user input. They are XML-escaped
  before being written to disk. See `scripts/lib/plist.ts` (`escapeXml`).

## Reporting a vulnerability

If you find a security issue in this code, please **don't open a public
issue**. Instead email the maintainer (see `package.json` author field).
Please include:

- A description of the issue
- Steps to reproduce
- The affected version (`git log -1` if cloned)

I'll respond within a few days. This is a side project, not a managed
product — but I take security seriously and will fix real issues quickly.

## Supported versions

Only the latest commit on `main` is supported. Forks and older tags
are out of scope.
