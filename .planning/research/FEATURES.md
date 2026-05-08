# Feature Research

**Domain:** "Currently-playing -> external presence" bridge (Apple Music -> Gather)
**Researched:** 2026-05-08
**Confidence:** MEDIUM-HIGH (multiple comparable projects analyzed; some Gather websocket internals confirmed only via secondary sources)

## Scope Note

This is explicitly a **Single-User personal tool** for Patrick Lorenz. The "Differentiator" column in this domain is largely meaningless because there is no market to compete in. Instead the column is reframed as **"Quality-of-Life features beyond v1"**: things that are nice once the core works, ranked by personal benefit vs implementation cost. Anti-features are particularly important here because scope creep is the primary risk, not feature parity.

## Reference Projects Analyzed

| Project | Stack | Pattern | Why Comparable |
|---------|-------|---------|----------------|
| `gathertown/mod-spotify-as-status` | TS + websocket | Spotify Web API -> Gather websocket | Canonical Gather example, same target API |
| `gather-scrobble` (PyPI) | Python + websocket | Last.fm/Spotify -> Gather | Same data source (Last.fm), same target |
| `NextFire/apple-music-discord-rpc` | Deno + JXA | JXA -> Discord RPC | Same data source (Apple Music macOS), launch agent pattern |
| `zoetrope69/lastfm-slack-status-sync` | Node | Last.fm -> Slack | Same source, similar status semantics |
| `JackCuthbert/slack-fm` | Node + Docker | Last.fm -> Slack | Self-hosted polling daemon pattern |
| `mpociot/lastfm-slack` | PHP | Last.fm -> Slack | Status format conventions |

## Feature Landscape

### Table Stakes (Must Have or v1 Is Broken)

These are non-negotiable for the daemon to feel "complete" even as a single-user tool. Missing any of them and Patrick will notice immediately within hours of running it.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Read currently-playing track from Last.fm `getRecentTracks?nowplaying=true` | Primary data source per PROJECT.md | LOW | The `nowplaying="true"` attribute is set by Last.fm only when scrobbler reports active playback; track also lacks `date` field while playing. NepTunes feeds this. |
| AppleScript fallback to Music.app | Last.fm/NepTunes can be flaky, briefly out, or rate-limited | LOW-MEDIUM | `osascript -e 'tell application "Music" to ...'` returns name/artist/player state. Standard pattern in apple-music-discord-rpc. |
| Set Gather status to `Artist - Track` (or similar) | The whole point of the tool | LOW | Use `@gathertown/gather-game-client` `setTextStatus` + `setEmojiStatus`. Spotify-as-status uses websocket pattern - same here. |
| Music emoji prefix (`note`, `headphone`, etc.) | Visual signal in Gather sidebar; gather-scrobble uses 8-emoji pool; native Spotify integration shows emoji | LOW | Unicode emoji in `setEmojiStatus`; trivial config. |
| Polling loop at fixed interval (10s) | Gather Spotify integration takes ~30s to reflect; 10s polling is responsive without hitting rate limits | LOW | 10s = 6 calls/min = far under Last.fm 5 req/sec/IP cap. Use `setInterval` or `setTimeout` recursion (latter is safer for async). |
| Clear status on pause/silence | Core requirement per PROJECT.md - colleagues should not see stale "still listening to X" when player is paused or stopped | LOW | Detection: Last.fm stops returning `nowplaying=true`; AppleScript reports `player state = paused/stopped`. On clear: send empty string to `setTextStatus` and `setEmojiStatus`. |
| Track-change detection (avoid spamming Gather with identical updates) | Hitting `setTextStatus` every 10s with the same value is wasteful and may show as constant "updated" indicator to peers | LOW | Compare `(artist, track)` tuple against last sent value; only call setTextStatus on diff. |
| `.env` config for API keys (Last.fm key, Gather API key, space ID) | Per PROJECT.md constraints; secrets must not be in repo | LOW | `dotenv` package; `.env` in `.gitignore`. |
| Auto-start on login via launchd | Per PROJECT.md; daemon must run unattended | MEDIUM | `~/Library/LaunchAgents/com.plorenz.gather-apple-music-bridge.plist` with `RunAtLoad=true`. `npm run install-daemon` script generates and loads via `launchctl`. |
| Auto-restart on crash via launchd `KeepAlive` | If the process dies (network blip, unhandled rejection), it must come back without manual intervention | LOW | Use `KeepAlive = { SuccessfulExit: false }` so launchd restarts only on non-zero exit. Restart latency ~10s. |
| Stderr/stdout logged to a file | When the daemon misbehaves at 9pm on a Saturday, you need a log to look at, not silence | LOW | launchd plist `StandardOutPath` / `StandardErrorPath` -> e.g., `~/Library/Logs/gather-apple-music-bridge.log`. |
| Last.fm rate-limit safety | Even at 10s polling, retries on transient errors must not spike to >5 req/sec | LOW | Single in-flight request; backoff on HTTP 429 / `error=29`. Default polling already safe; only matters for failure paths. |
| Graceful Last.fm failure (timeout/network error) | Daemon must not crash when wifi blips; just keep status as-is and retry next tick | LOW | Try/catch around fetch; log + skip cycle on error. Do NOT clear status on transient network failure (would flicker). |
| Daemon uninstall command | If you change config format or migrate, you need a clean off-switch | LOW | `npm run uninstall-daemon` -> `launchctl unload` + remove plist. |

### Quality-of-Life Features (Add When v1 Has Run for a Week)

Features that improve the daemon but are deferrable. Implementing all of them is **not** the goal - the question to ask before adding any is "did v1 actually fail without this?"

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Configurable status format string | Switch from `{artist} - {track}` to `{track} by {artist}` etc. without code change | LOW | Single template string in `.env`; tiny win for a personal tool. NextFire's apple-music-discord-rpc supports `{name}`/`{artist}`/`{album}` placeholders. |
| Album metadata in status | Gather status accepts more text than `Artist - Track`; `Track - Artist (Album)` is richer | LOW | Last.fm response already includes `album.#text`. Optional concat. |
| Truncation with ellipsis for long titles | Songs like "Song Title (feat. Artist) [Remastered 2019 Deluxe Edition]" overflow Gather sidebar | LOW | Truncate at ~50 chars with `...`. Gather text status practical limit unconfirmed but assume ~80 chars. |
| Fallback chain: Last.fm -> AppleScript -> empty | Currently described as "fallback if Last.fm fails"; making the chain explicit and ordered is cleaner | LOW | Strategy pattern: array of providers, return first non-null. |
| Pause-state visible status (e.g., `(paused)` instead of clear) | Some users prefer "still here, just not playing" over silence; matters less for the Gather use case | LOW | Toggle in config; default = clear (per PROJECT.md). Skip unless requested. |
| Health-check endpoint (`http://localhost:PORT/healthz`) | Lets you ping from another script to verify the daemon is up without `launchctl list` | LOW | Tiny `http.createServer`. Probably overkill for v1. |
| Verbose/quiet logging modes | "Why didn't the status update at 14:32?" - need DEBUG mode for diagnosis | LOW | `LOG_LEVEL` env var. Use `pino` or just `console.log` gated by level. |
| Source label in logs (`[lastfm]` vs `[applescript]`) | When debugging, you want to know which provider answered | LOW | One line of log formatting. |
| Backoff on consecutive errors | After N failures, increase poll interval (10s -> 30s -> 60s) until success | LOW | Defends against being unhelpful to Last.fm during an outage. |
| Retry on Gather websocket disconnect | The gather-game-client websocket can drop; mod-spotify-as-status doesn't show explicit reconnect logic so this may be a real gap | MEDIUM | gather-game-client may auto-reconnect (verify in SDK). If not, wrap the connect in a retry loop with backoff. |
| Custom emoji rotation (8 music emojis, random per track) | gather-scrobble does this; tiny visual delight | LOW | Pick from `[note, multiple-notes, headphone, microphone, guitar, saxophone, violin, drum]` per track. |
| Album artwork passthrough | Discord RPC bridges show album art; Gather status doesn't natively support images on profile, so this is likely **not feasible** here | N/A | Anti-feature unless Gather adds support. |

### Anti-Features (Deliberately NOT Built)

Scope creep is the single biggest risk for a single-user tool. Each of these has surface appeal but actively works against the project goals.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Scrobbling itself** (writing plays to Last.fm) | "If we already read Last.fm, why not scrobble too?" | NepTunes already scrobbles; duplicating creates double scrobbles. Scope explosion: needs auth flow, queueing, dedup. | Leave to NepTunes. We are a **read-only** consumer. |
| **Music control** (play/pause/next from Gather) | "It would be cool if I could control music from Gather" | Two-way coupling, requires Gather event listening, needs AppleScript write commands, security implications (any Gather peer could trigger?). Massive scope leap. | Use macOS media keys. Not the daemon's job. |
| **Library management / playlist sync** | "Show what playlist I'm in" | Last.fm doesn't expose playlist context; AppleScript can but adds complexity for marginal value. Status is for **what's playing**, not where it sits. | Out of scope. |
| **Multi-source aggregation** (Apple Music + Spotify + YouTube Music + Tidal + ...) | "What if I switch to Spotify someday?" | PROJECT.md is explicit: "Apple Music is the only use case". Each source adds an OAuth flow, an SDK, a config schema. | YAGNI. If Patrick switches to Spotify, use Gather's native integration and delete this repo. |
| **Multi-user / team-shared deployment** | "Could colleagues use this too?" | Out of scope per PROJECT.md. Multi-user means hosting, secrets management, OAuth flow per user, Docker images, support burden. | Single-User. Each colleague runs their own copy if they want. |
| **Cloud deployment / serverless / Docker** | "Run it on a Cloudflare Worker for zero local resource use" | AppleScript fallback requires the local Music.app - cannot run remotely. Local launchd is the right tool. | Local daemon, period. |
| **Tray icon / Menu bar UI / GUI settings** | "It would be nice to see status at a glance" | Per PROJECT.md: "Daemon ist invisible, kein UI-Aufwand". UIs add Electron/Tauri/Cocoa, signing, notarization. Status is **already visible** - in Gather. | `tail ~/Library/Logs/gather-apple-music-bridge.log` if you need to see it. |
| **Track history persistence** | "What did I listen to yesterday?" | That's exactly what Last.fm already does. We are a presence layer, not a history layer. | Open last.fm/user/{patrick}. |
| **Notification on track change** | "Notify me when next track plays" | Patrick's playing the music. He knows what's playing. The daemon's job is to tell **other people**, not Patrick. | Not implemented. |
| **Per-track or per-album emoji** | "Different emoji for different genres" | Requires genre lookup (extra API call), genre->emoji mapping (subjective), maintenance burden | Static emoji or 8-emoji random pool max. |
| **Web dashboard / status page** | "See historical uptime / what played when" | Adds web framework, persistence, port management. Three orders of magnitude more complex than the actual daemon. | Logs are enough. |
| **Auto-update mechanism** | "Self-updating daemon" | Single-user repo. `git pull && npm install && launchctl reload` is fine. Sparkle-style auto-update is enterprise tooling. | Manual update. |
| **Tests, CI, code coverage** | "Good engineering hygiene" | Per PROJECT.md explicit Out-of-Scope. For a 200-line single-user daemon, tests cost more than they save. | Run it. If it breaks, fix it. |
| **Open-source release / public docs / contributors guide** | "Other people might want this" | Per PROJECT.md explicit Out-of-Scope. Each public-facing artifact requires maintenance. | Private repo. |
| **Single-binary distribution (pkg/nexe/Bun compile)** | "One executable, no Node dependency" | Per PROJECT.md explicit Out-of-Scope. Patrick already has Node. Single user. | `node dist/index.js` from launchd. |
| **macOS Keychain integration for secrets** | "More secure than .env" | Single-user, single machine, repo not public, .env in .gitignore. Keychain integration is a half-day rabbit hole for zero practical benefit here. | `.env` is fine. |
| **Now-playing for non-music apps** (Podcasts, Audiobooks) | "I sometimes listen to podcasts" | Music.app handles podcasts via the Podcasts app on modern macOS; Last.fm doesn't scrobble them anyway. Different APIs, different metadata shape. | Out of scope. |
| **Status during meetings / Do-Not-Disturb integration** | "Don't show music during calls" | Requires Focus mode detection, Zoom/Meet integration, complex state machine | If you're in a meeting, pause Music.app - status will clear automatically (per the Pause requirement). |

## Feature Dependencies

```
Read Last.fm getRecentTracks (table stakes)
    -> requires .env config (Last.fm API key, username)

AppleScript fallback (table stakes)
    -> requires no API key (osascript is local)
    -> requires Music.app to be installed/running

Set Gather status (table stakes)
    -> requires .env config (Gather API key, space ID)
    -> requires gather-game-client websocket connection
    -> requires track data from EITHER Last.fm OR AppleScript

Polling loop (table stakes)
    -> orchestrates: read source -> diff with last -> send to Gather

Clear-on-pause (table stakes)
    -> requires polling loop
    -> requires "is playing?" signal from source

Track-change detection (table stakes)
    -> requires in-memory state (last sent track tuple)
    -> enables: avoid redundant Gather calls

launchd auto-start (table stakes)
    -> requires npm install-daemon script
    -> requires daemon to be a long-running process (true)

KeepAlive auto-restart (table stakes)
    -> requires launchd plist (above)
    -> requires non-zero exit on fatal errors (don't catch-all in main)

Logging to file (table stakes)
    -> requires launchd plist StandardOutPath/StandardErrorPath
    -> enables: post-hoc debugging

Configurable format string (QoL)
    -> enhances: status output
    -> requires .env entry

Album in status (QoL)
    -> requires Last.fm response parsing for album.#text
    -> requires AppleScript fallback to also read album (trivial)

Truncation (QoL)
    -> requires Album in status to be useful (longer strings)

Backoff on errors (QoL)
    -> requires error counting in polling loop
    -> conflicts with: simple fixed 10s loop (slight)

Health-check endpoint (QoL)
    -> requires HTTP server in process
    -> conflicts with: "minimal dependencies" (adds none if using node:http)

Reconnect on websocket drop (QoL but actually important)
    -> verify gather-game-client SDK behavior FIRST
    -> if SDK auto-reconnects: skip
    -> if not: wrap connect() in retry-with-backoff
```

### Critical Dependency: Verify gather-game-client Reconnect Semantics

The single biggest unknown that could promote a "QoL" feature to "table stakes" is whether `@gathertown/gather-game-client` automatically reconnects on websocket drop. mod-spotify-as-status does not show explicit reconnect logic, suggesting the SDK handles it - **but this should be verified during implementation** (read the SDK source or test by killing wifi for 30s). If the SDK does NOT reconnect, manual reconnect-with-backoff becomes table stakes, not QoL.

## MVP Definition

### Launch With (v1) - "It Works on My Mac"

The minimum to validate that the daemon does what PROJECT.md says. Roughly 200-300 lines of TypeScript.

- [ ] Last.fm `getRecentTracks?user=...&nowplaying=true` polling
- [ ] AppleScript fallback when Last.fm has no nowplaying entry
- [ ] gather-game-client websocket connect to space
- [ ] `setTextStatus(\`Artist - Track\`)` + `setEmojiStatus(<music-note>)` on track
- [ ] Clear both on pause/stop (empty string)
- [ ] Track-change diff (don't re-send identical status)
- [ ] 10s polling interval
- [ ] `.env` config for all secrets/IDs
- [ ] `npm run install-daemon` -> writes plist, runs `launchctl load`
- [ ] `npm run uninstall-daemon` -> mirror
- [ ] launchd `KeepAlive: { SuccessfulExit: false }` + `RunAtLoad: true`
- [ ] Stdout/stderr -> `~/Library/Logs/gather-apple-music-bridge.log`
- [ ] Try/catch around polling cycle (don't crash on transient errors)
- [ ] Verify gather-game-client reconnect behavior; add manual reconnect if needed

### Add After Validation (v1.x) - "When v1 Annoys Me"

Triggered by actual lived experience, not anticipation.

- [ ] Configurable status format string -- if I find myself wanting to tweak the format
- [ ] Album in status -- if `Artist - Track` feels too sparse
- [ ] Truncation -- if a 90-char song name breaks the Gather sidebar
- [ ] Verbose logging mode -- the first time I have to debug "why didn't it update?"
- [ ] Backoff on consecutive errors -- if I see Last.fm 429s in the log

### Future Consideration (v2+) - "Probably Never"

Defer indefinitely. If still relevant in 6 months, reassess.

- [ ] Custom emoji rotation -- cosmetic only
- [ ] Health-check endpoint -- only if I build something that needs to monitor it
- [ ] Pause-visible status mode -- only if I change my mind about "clear-on-pause"

## Feature Prioritization Matrix

| Feature | User Value (Patrick) | Implementation Cost | Priority |
|---------|---------------------|---------------------|----------|
| Last.fm now-playing read | HIGH | LOW | P1 |
| AppleScript fallback | HIGH | LOW | P1 |
| Gather setTextStatus + setEmojiStatus | HIGH | LOW | P1 |
| Clear-on-pause | HIGH | LOW | P1 |
| Track-change diff | MEDIUM | LOW | P1 |
| 10s polling loop | HIGH | LOW | P1 |
| `.env` config | HIGH | LOW | P1 |
| launchd install/uninstall scripts | HIGH | MEDIUM | P1 |
| KeepAlive auto-restart | HIGH | LOW | P1 |
| Log to file | MEDIUM | LOW | P1 |
| Last.fm error swallow + retry | MEDIUM | LOW | P1 |
| Verify SDK auto-reconnect (potentially adds reconnect logic) | HIGH (if needed) | LOW-MEDIUM | P1 |
| Configurable format string | LOW | LOW | P2 |
| Album in status | LOW-MEDIUM | LOW | P2 |
| Truncation | MEDIUM (if hit) | LOW | P2 |
| Verbose logging | MEDIUM (when debugging) | LOW | P2 |
| Backoff on errors | LOW | LOW | P2 |
| Custom emoji rotation | LOW | LOW | P3 |
| Health-check endpoint | LOW | LOW | P3 |
| Pause-visible mode | LOW | LOW | P3 |
| **Anti-features (scrobbling, control, multi-source, GUI, etc.)** | NEGATIVE | HIGH | P-NEVER |

## Competitor Feature Analysis

| Feature | mod-spotify-as-status | gather-scrobble | apple-music-discord-rpc | Our Approach |
|---------|----------------------|-----------------|------------------------|--------------|
| Source | Spotify Web API | Last.fm or Spotify | Music.app via JXA | Last.fm primary, AppleScript fallback |
| Target | Gather websocket | Gather websocket | Discord RPC (local IPC) | Gather websocket |
| Status format | Track + artist (unspecified shape) | Configurable emoji + track | `{name}` / `{artist}` / `{album}` template | `Artist - Track` v1, template later if needed |
| Emoji | Static (likely note) | 8-emoji pool, random or single | Activity icon (Discord-side) | Single emoji v1, pool later if bored |
| Pause handling | Unspecified | Unspecified | "Presence enabled only when actually playing" -> clears | Clear status on pause/stop |
| Idle handling | Unspecified | Unspecified | Same as pause | Clear after no `nowplaying=true` for one cycle |
| Polling interval | Unspecified | Real-time | Unspecified, likely 5-15s | 10s |
| Auto-start | Run via `npm start` | Docker / CLI | Optional macOS launch agent | launchd plist via npm script |
| Crash recovery | Unspecified | Container restart | launchd KeepAlive (if launch agent enabled) | launchd KeepAlive |
| Album art | No | No | Yes (litterbox.catbox.moe upload) | No (Gather status text-only, no API for image) |
| Multi-source | No | Yes (Last.fm + Spotify) | No (Apple Music only) | No (Last.fm + AppleScript fallback to same source - not "multi-source") |
| GUI | No | No | No (status bar disabled by design) | No |
| Tests | None visible | Unknown | Some | None (out of scope) |

**Key takeaways from comparable projects:**

1. **The simple ones don't document edge cases.** mod-spotify-as-status README is ~30 lines and says nothing about pause/idle/reconnect. This is a hint that for a personal tool, you handle these reactively, not preemptively.
2. **gather-scrobble's emoji pool is the only "fun" feature.** Everyone else is utilitarian. Worth borrowing only if you find single-emoji boring after a week.
3. **NextFire's apple-music-discord-rpc is the architectural twin.** Same OS, same source, same launch agent pattern, just different target. Read its source for production patterns (especially around `osascript` invocation and JSON serialization of track data).
4. **No comparable project has a GUI.** Strong signal that headless is the right architecture for this category.
5. **All comparable projects ship without tests or CI.** Validates PROJECT.md's out-of-scope decision.

## Status Format Conventions Across the Domain

Surveyed status string formats in this category:

| Convention | Example | Used By |
|------------|---------|---------|
| `Artist - Track` | `Radiohead - Idioteque` | Default in most Last.fm-based tools |
| `Track by Artist` | `Idioteque by Radiohead` | Some Slack bridges; reads more naturally |
| `Track - Artist (Album)` | `Idioteque - Radiohead (Kid A)` | gather-scrobble verbose mode |
| Emoji + `Artist - Track` | `note Radiohead - Idioteque` | Standard for status-bar-style integrations |
| Discord RPC two-line | Line 1: track / Line 2: artist - album | apple-music-discord-rpc (Discord-specific UI) |

**Recommendation for v1:** `Artist - Track` (matches PROJECT.md spec) with music-note emoji in the separate `setEmojiStatus` call. This gives `note Artist - Track` visually in Gather. Move to template-driven only if format dissatisfaction surfaces.

## Edge Cases Common Tools Get Wrong (Worth Handling Preemptively)

| Edge Case | What Goes Wrong | v1 Mitigation |
|-----------|-----------------|---------------|
| Last.fm `limit=1` returns 2 tracks when nowplaying is active | Off-by-one parsing | Look for `@attr.nowplaying === "true"` on a track, don't index by position |
| Currently-playing track has no `date` field | Naive parsers crash | Don't rely on `date` field; key off `nowplaying` attr |
| Track changes mid-poll (race) | Stale data sent | Acceptable - next 10s tick corrects it. Don't over-engineer. |
| Music.app not running but Last.fm has stale `nowplaying=true` | Status shows ghost track | After a cycle, Last.fm clears `nowplaying`. AppleScript would say `not running`. v1 priority order (Last.fm first) means brief ghost up to ~10s. Acceptable. |
| Long song titles with brackets/feat./remasters | Overflow Gather sidebar | P2: truncate at 60-80 chars |
| Special characters / non-ASCII (Cyrillic, CJK) | Encoding bugs | Use TextEncoder/native UTF-8; Last.fm returns UTF-8 JSON; AppleScript output via `osascript` is also UTF-8 in modern macOS. Test once. |
| Multiple Music.app windows / shared library / AirPlay to another device | AppleScript reads main app state, may differ from what's audible | Out-of-scope to perfectly handle. Document as a known quirk. |
| Sleep/wake cycles | Daemon may have a stale connection on wake | KeepAlive doesn't help here (process didn't exit). gather-game-client may auto-reconnect on websocket close - verify. |
| User goes offline in Gather | setTextStatus may fail silently | gather-game-client should handle; if not, log and continue. |
| API key invalid | Daemon crashes on startup, KeepAlive infinite-loops | On startup, validate keys (`auth.getMobileSession` for Last.fm test, ping for Gather). On invalid: log error, exit 0 to **prevent** KeepAlive restart loop. |

## Sources

- [gathertown/mod-spotify-as-status (canonical Gather example)](https://github.com/gathertown/mod-spotify-as-status)
- [gather-scrobble on PyPI (Last.fm + Spotify -> Gather)](https://pypi.org/project/gather-scrobble/)
- [NextFire/apple-music-discord-rpc (architectural twin)](https://github.com/NextFire/apple-music-discord-rpc)
- [zoetrope69/lastfm-slack-status-sync](https://github.com/zoetrope69/lastfm-slack-status-sync)
- [JackCuthbert/slack-fm](https://github.com/JackCuthbert/slack-fm)
- [mpociot/lastfm-slack](https://github.com/mpociot/lastfm-slack)
- [alex-phillips/node-slack-fm-status](https://github.com/alex-phillips/node-slack-fm-status)
- [Last.fm getRecentTracks API docs](https://www.last.fm/api/show/user.getRecentTracks)
- [Last.fm Terms 4.4 - 5 req/sec rate limit](https://www.last.fm/api/tos)
- [Gather Spotify Integration support article](https://support.help.gather.town/articles/1248816989-spotify-integration)
- [Gather Set Status & Availability docs](https://support.help.gather.town/articles/9785009882-status-availability)
- [@gathertown/gather-game-client npm](https://www.npmjs.com/package/@gathertown/gather-game-client)
- [Gather game-client docs site](http://gather-game-client-docs.s3-website-us-west-2.amazonaws.com/classes/Game.html)
- [launchd KeepAlive + SuccessfulExit pattern](https://notes.alinpanaitiu.com/Restarting-macOS-apps-automatically-on-crash)
- [Last.fm getRecentTracks nowplaying date-field quirk (Last.fm support)](https://support.last.fm/t/user-getrecenttracks-the-most-recent-track-will-not-include-a-date-field-if-it-is-currently-playing/115900)

---
*Feature research for: macOS Apple-Music-zu-Gather-Status-Bridge*
*Researched: 2026-05-08*
