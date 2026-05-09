# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

(none)

## [0.1.0] – 2026-05-09

First public release.

### Added
- AppleScript-based Apple Music source (`src/sources/applescript.ts`)
  with System-Events outer-guard to prevent the bridge from
  accidentally launching Music.app while polling.
- 10-second polling loop with recursive `setTimeout` and AbortController
  for clean shutdown (`src/loop.ts`). Idempotent track-diff using a
  composite key (`{artist}|{track}` lowercased + trimmed).
- CDP-based GatherV2 sink (`src/sink/gather.ts`) that calls
  `gatherDev.Repos.gameSpace.currentSpaceUser.setCustomStatus(...)`
  in the renderer process via Chrome DevTools Protocol.
- Auto-heal: if GatherV2 is running without `--remote-debugging-port`,
  the bridge gracefully quits and relaunches the app with the flag.
  Waits for `gatherDev` to be initialized before retrying. Configurable
  via `GATHER_AUTO_HEAL=0`.
- Two launchd LaunchAgents installed by `npm run install-daemon`:
  - `agency.deepr.gather-apple-music-bridge` — the bridge daemon
    (KeepAlive on crash, 30 s ThrottleInterval, no restart on clean
    exit).
  - `agency.deepr.gathervtwo-debug-launcher` — auto-starts GatherV2
    with the debug port at login.
- `scripts/check-cdp.ts` (`npm run check-cdp`) — pre-flight diagnostic
  that distinguishes "CDP not reachable" from "page not found".
- Smoke tests: `npm run test:sink` (round-trip status to Gather UI),
  `npm run test:sources` (read from Apple Music).
- Plist XML-escape for paths/labels containing `&`, `<`, `>`, `"`, `'`
  so the bridge installs cleanly under non-trivial usernames.
- Configuration validation: `GATHER_CDP_PORT` is checked to be a
  valid TCP port (1–65535) at startup; invalid values fail fast with
  a clear error.

### Security
- AppleScript is a static string; no user-controlled values are
  interpolated. No injection vector.
- All CDP `Runtime.evaluate` expressions interpolate values via
  `JSON.stringify()`. Track names containing `'`, `"`, `\n`,
  `</script>` etc. cannot escape the string literal.
- All `spawnSync` calls use argument arrays, never shell strings.
- No telemetry, no remote backend, no credential storage.
- See [`SECURITY.md`](./SECURITY.md) for the full threat model.

### Notable history (pre-release)
- Originally targeted Gather 1.0 via `@gathertown/gather-game-client@43`.
  After September 2025's Gather 2.0 launch, the v1 client returns 404
  against v2 spaces and is no longer maintained. The sink was rebuilt
  on top of the Chrome DevTools Protocol against the local GatherV2
  Electron app (Phase 5 of the original development plan).
- Last.fm support was scaffolded but removed before the public release.
  AppleScript alone covers the original use-case; Last.fm added
  complexity without user value (no NepTunes scrobbler in the loop).

[Unreleased]: https://github.com/patricklorenz/gatherAppleMusicBridge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/patricklorenz/gatherAppleMusicBridge/releases/tag/v0.1.0
