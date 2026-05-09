# gatherAppleMusicBridge

A local macOS daemon that pushes the currently-playing track from
**Apple Music** into your **Gather 2.0** custom status.

```
🎧 Daft Punk – Around the World
```

When you're online in Gather, your colleagues see what you're listening
to — without you having to switch from Apple Music to Spotify just for
the native integration.

> **Status:** v1.0 working, used in production by the author.
> **Platform:** macOS only (Apple Silicon and Intel).
> **License:** MIT.

## Why this exists

Gather 2.0 (`app.v2.gather.town`, launched September 2025) ships with
a native Spotify integration but no Apple Music one. There's also no
public API to set a custom status from a third-party tool.

This bridge solves both problems by talking to the locally-running
GatherV2 Electron app over the **Chrome DevTools Protocol** —
essentially driving the renderer from outside, the same way the in-app
status editor would. No reverse-engineered HTTP endpoints, no leaked
auth tokens. The app authenticates itself; we just call its internal
mutation.

## What you get

- 10-second polling loop reading the current track from `Music.app` via
  AppleScript (no NepTunes/Last.fm required).
- Status updates within ~10–15 s of a track change.
- Status auto-clears when you pause Apple Music.
- launchd integration: starts at login, restarts on crash, stops cleanly
  on config errors.
- Auto-heal: if you launch GatherV2 manually (Spotlight, Dock, Finder)
  without the debug-port flag, the bridge detects this, quits the app,
  and relaunches it with the flag.

## Requirements

- macOS (tested on Sonoma and Sequoia)
- Node.js 22 LTS or newer (`node --version`)
- Apple Music (`Music.app`)
- GatherV2 desktop app installed from Gather, signed in to your space

## Quickstart

```bash
git clone https://github.com/patricklorenz/gatherAppleMusicBridge.git
cd gatherAppleMusicBridge
npm install
npm run install-daemon
```

The installer:
1. Builds the TypeScript sources to `dist/`.
2. Renders two launchd plists into `~/Library/LaunchAgents/`:
   - `agency.deepr.gather-apple-music-bridge` — the bridge daemon.
   - `agency.deepr.gathervtwo-debug-launcher` — auto-starts GatherV2
     with `--remote-debugging-port=9222` at login.
3. Triggers the macOS Automation permission prompt for `Music.app`
   in the foreground (click **OK** when it appears).
4. Bootstraps both LaunchAgents.

After install:

> **Important:** remove `GatherV2` from System Settings → General →
> Login Items. Otherwise it starts twice (once without the flag via the
> Login Item, once with via our LaunchAgent).

That's it. Quit GatherV2, log out, log back in. Bridge starts, GatherV2
starts with the debug flag, your status updates as you change tracks.

## Configuration

All env vars are optional. Drop a `.env` in the repo root only if you
need overrides. Defaults work for the typical setup.

| Var | Default | Purpose |
|-----|---------|---------|
| `GATHER_CDP_PORT` | `9222` | Chrome DevTools Protocol port. Must match the `--remote-debugging-port` GatherV2 was started with. |
| `GATHER_PAGE_URL_FILTER` | `app.v2.gather.town` | URL substring used to find the GatherV2 page among CDP targets. |
| `GATHER_APP_PATH` | `/Applications/GatherV2.app` | Where the GatherV2 app bundle lives. |
| `GATHER_AUTO_HEAL` | `1` | Set to `0` to disable the kill+restart-on-Spotlight-launch logic. |
| `LOG_LEVEL` | `info` | pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |

Validation: invalid values (non-numeric port, port out of 1–65535)
fail fast at daemon startup.

## Operation

| Action | Command |
|--------|---------|
| Bridge status | `launchctl print gui/$(id -u)/agency.deepr.gather-apple-music-bridge` |
| Bridge logs (live) | `tail -f ~/Library/Logs/gather-bridge.log` |
| Bridge errors (live) | `tail -f ~/Library/Logs/gather-bridge.err` |
| Bridge restart (e.g. after `.env` change) | `launchctl kickstart -k gui/$(id -u)/agency.deepr.gather-apple-music-bridge` |
| Launcher status | `launchctl print gui/$(id -u)/agency.deepr.gathervtwo-debug-launcher` |
| CDP pre-flight check | `npm run check-cdp` |
| Smoke-test sink (writes a status, clears it) | `npm run test:sink` |
| Smoke-test source (reads from Apple Music) | `npm run test:sources` |
| Uninstall both LaunchAgents | `npm run uninstall-daemon` |

Pretty-print logs:

```bash
tail -f ~/Library/Logs/gather-bridge.log | npx pino-pretty
```

## How it works

```
Apple Music
  │
  ▼ AppleScript (player state + track)
src/sources/applescript.ts
  │
  ▼ NowPlayingSource
src/loop.ts (10s polling, recursive setTimeout, AbortController, track-diff)
  │
  ▼ setStatus / clearStatus (await)
src/sink/gather.ts (CDP client + auto-heal)
  │
  ▼ Chrome DevTools Protocol → window.gatherDev.Repos.gameSpace.currentSpaceUser.setCustomStatus({ emoji, text, clearCondition })
GatherV2 Electron renderer
  │
  ▼ visible to your colleagues
Gather UI status
```

Daemon supervision:

```
launchd (gui/$UID)
├── agency.deepr.gather-apple-music-bridge (Bridge — KeepAlive on crash)
└── agency.deepr.gathervtwo-debug-launcher (GatherV2 + --remote-debugging-port=9222)
```

## Security

The bridge is local-only. It does not phone home, does not store
credentials, does not control playback. The most powerful capability
it enables is **JavaScript execution inside the GatherV2 renderer**
via the CDP debug port. See [`SECURITY.md`](./SECURITY.md) for the
full threat model and mitigations.

## Troubleshooting

### AppleScript permission denied (`-1743`)

The launchd-spawned daemon can't show the macOS Automation permission
dialog itself. Reset and retrigger via the foreground installer:

```bash
tccutil reset AppleEvents
npm run install-daemon
# Click OK on the "Terminal wants to control Music" dialog
```

Or grant permission manually under
**System Settings → Privacy & Security → Automation**.

### Node-Version changed (nvm or Homebrew update)

The plist embeds the absolute path to the Node binary that was active
during install (`process.execPath`). After `nvm install <new-version>`
or a Homebrew Node bump, the path may be stale. Fix:

```bash
npm run install-daemon  # rewrites the plist with the current Node path
```

### Daemon won't start

```bash
launchctl print gui/$(id -u)/agency.deepr.gather-apple-music-bridge
tail ~/Library/Logs/gather-bridge.err
```

A non-zero `last exit code` indicates a crash; logs explain the cause.
Common causes: bad env value (e.g. invalid port), missing GatherV2 app,
Node binary moved.

### `npm run check-cdp` fails

The helper diagnoses two distinct failure modes:

```bash
npm run check-cdp
```

- **CDP port `localhost:9222` doesn't answer:** GatherV2 isn't running
  or was started without the debug flag. Start it manually with:
  ```bash
  open -a GatherV2 --args --remote-debugging-port=9222
  ```
- **Port answers but no `app.v2.gather.town` page found:** GatherV2 is
  on the login page or you're not in a space. Sign in and walk into
  your space; the bridge will catch up on the next tick.

### Logs grow unbounded

There's no log rotation built in. Truncate manually when needed:

```bash
truncate -s 0 ~/Library/Logs/gather-bridge.{log,err}
truncate -s 0 ~/Library/Logs/gather-launcher.{log,err}
```

(PRs adding rotation welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md).)

## Limitations / things this won't do

- macOS only. The CDP-against-Electron approach is portable in theory,
  but the launchd integration and AppleScript source are not.
- Single-space. The bridge talks to whatever GatherV2 page is currently
  open. There's no support for multiple spaces or switching.
- No reconnect against a flaky network. If the GatherV2 page navigates
  away, the bridge waits for it to come back; it doesn't try to log you
  in.
- Auto-heal can briefly interrupt your GatherV2 session (~6 s) when you
  launch the app via Spotlight without the debug flag. Set
  `GATHER_AUTO_HEAL=0` to opt out.
- Status text is hardcoded as `🎧 {artist} – {track}`. No format
  templates yet.

## Contributing

Issues and PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 Patrick Lorenz.
