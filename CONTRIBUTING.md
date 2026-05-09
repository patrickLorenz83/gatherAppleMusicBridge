# Contributing

Thanks for the interest. This is a small side project, but PRs are very
welcome. The codebase is intentionally small (~500 lines of TypeScript)
and the architecture should be readable end-to-end in an afternoon.

## Ground rules

- **macOS-only.** Cross-platform support is out of scope. The CDP sink
  could be portable, but the AppleScript source and launchd integration
  are not.
- **Single binary, no framework.** No React, no Express, no ORM. Plain
  TypeScript + Node 22 + four runtime deps (`chrome-remote-interface`,
  `dotenv`, `pino`, `run-applescript`). Adding a dep should be argued
  for in the PR.
- **No telemetry, no cloud calls.** Everything stays on the user's
  machine.
- **Backwards compat is best-effort.** This is `0.x.y` software. APIs
  may change between minor versions; breaking changes will be called
  out in [`CHANGELOG.md`](./CHANGELOG.md).

## Setting up

```bash
git clone <fork-url>
cd gatherAppleMusicBridge
npm install
npm run typecheck      # tsc --noEmit
npm test               # plist.test.ts (9 assertions)
npm run check-cdp      # diagnose your local CDP setup
```

For end-to-end testing during development, run the daemon in the
foreground so you see logs in your terminal:

```bash
npm run dev            # tsx watch src/index.ts
```

You'll need GatherV2 running with `--remote-debugging-port=9222`:

```bash
open -a GatherV2 --args --remote-debugging-port=9222
```

## Code style

- TypeScript strict mode, NodeNext module resolution.
- Relative imports use `.js` extensions (NodeNext requirement).
- ESM only (`"type": "module"`).
- No formatter config yet (Prettier-compatible defaults are fine).
- Comments are English. Variable/function names are English.

## Testing

The current test suite is small:

- `scripts/lib/plist.test.ts` — plist renderer assertions (run via
  `npm test`).

There is currently no test framework integration. PRs that add unit
tests for the AppleScript parsing, the CDP `runInPage` escaping, or the
config validation are very welcome. Keep dependencies minimal — the
`node:assert/strict` + `tsx` pattern in `plist.test.ts` works fine.

For changes touching the sink (`src/sink/gather.ts`) please verify
manually:

```bash
npm run test:sink   # writes 🎧 Daft Punk – Around the World, then clears
```

For changes touching the source (`src/sources/applescript.ts`):

```bash
npm run test:sources   # while Apple Music is playing
```

## Pull-request checklist

- [ ] `npm run typecheck` is clean
- [ ] `npm test` passes
- [ ] Manual smoke-test (`npm run test:sink`) ran successfully if you
      changed the sink
- [ ] No new runtime dependencies, or you've explained why one is
      needed in the PR description
- [ ] Commit messages explain the "why" (see existing log for tone)
- [ ] If you've added an env var or an installer behavior, the README
      table is updated

## Areas that could use work

- Persistent CDP connection with reconnect on disconnect (currently
  per-call, which is robust but slightly wasteful).
- Log rotation (currently grows unbounded, README documents manual
  truncate).
- Format templates for the status text (currently hardcoded
  `🎧 {artist} – {track}`).
- Status length cap with ellipsis when GatherV2 has a hard limit (the
  exact limit is not officially documented).
- More tests, especially around AppleScript output parsing.
- A GitHub Actions workflow that runs `tsc --noEmit` and `npm test` on
  PRs.

## Reporting issues

Use the GitHub issue tracker. Please include:

- macOS version
- Node version (`node --version`)
- GatherV2 version (visible in the app's "About" or via
  `defaults read /Applications/GatherV2.app/Contents/Info.plist CFBundleShortVersionString`)
- Daemon log excerpt from `~/Library/Logs/gather-bridge.{log,err}`
  around the time of the issue
- Steps to reproduce

For security issues, please don't open a public issue — see
[`SECURITY.md`](./SECURITY.md).
