# gatherAppleMusicBridge

## What This Is

Ein lokaler macOS-Background-Daemon (Node.js/TypeScript), der den aktuell in Apple Music laufenden Track in den Gather-Status schreibt. Da Apple Music keinen "now playing"-Endpoint anbietet, holt die Bridge die Live-Daten primär aus Last.fm (gespeist durch NepTunes als Scrobbler) und nutzt AppleScript gegen Music.app als Fallback. Single-User-Tool für Patrick Lorenz, das die fehlende Apple-Music-Integration in Gather kompensiert.

## Core Value

Wenn ich in Gather online bin, sehen meine Kollegen, was ich gerade höre, ohne dass ich von Apple Music auf Spotify wechseln muss.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Bridge liest Now-Playing-Track aus Last.fm (`getRecentTracks?nowplaying=true`)
- [ ] Fallback auf AppleScript gegen Music.app, wenn Last.fm keinen `nowplaying=true`-Eintrag liefert
- [ ] Bridge setzt Gather-Status via Gather HTTP API (Format: `♫ Artist – Track`)
- [ ] Polling-Loop mit 10-Sekunden-Intervall
- [ ] Gather-Status wird geleert, wenn Apple Music pausiert oder nichts spielt
- [ ] API-Keys (Gather, Last.fm) und Konfiguration in `.env`-Datei (in `.gitignore`)
- [ ] Daemon-Installation via `npm run install-daemon` (legt `~/Library/LaunchAgents/*.plist` an)
- [ ] Daemon startet automatisch beim Login und läuft im Hintergrund

### Out of Scope

- Multi-User / Team-Setup — Tool ist explizit Single-User für Patrick
- Spotify-Integration — Gather hat das nativ, deshalb diese Bridge überhaupt
- Cloud-Deployment / Cloudflare Worker — lokal reicht, keine Server-Kosten
- Tray-/Menüleisten-UI — Daemon ist invisible, kein UI-Aufwand für v1
- Andere Streaming-Dienste (YouTube Music, Tidal) — Apple Music ist der einzige Use Case
- Tests, CI, Open-Source-Veröffentlichung — Single-User-Tool, würde nur Overhead bringen
- Single-Binary-Distribution (pkg/nexe) — npm + launchd reicht für ein Tool, das nur ich nutze

## Context

**Technische Umgebung:**

- macOS (Darwin 25.3.0) als alleinige Zielplattform
- Apple Music als Player (Music.app)
- NepTunes als Last.fm-Scrobbler (kostenlose macOS-App, scrobbelt Music.app)
- Gather 2.0 mit HTTP API für Status-Setting

**Vor-Recherche (Claude-Chat):**

- Spotify hat einen `currently-playing`-Endpoint, Apple Music / MusicKit nicht.
- Die offizielle Apple-Music-Web-API liefert nur `recently played` (max. 10 Einträge, kein Live-Status).
- Last.fm `getRecentTracks` mit `nowplaying=true`-Flag ist der pragmatischste Weg an Live-Daten.
- Referenz-Repo `tom21100227/now-playing-api` zeigt Apple-Music-Auth-Logik.
- Referenz-Repo `mod-spotify-as-status` zeigt Gather-HTTP-API-Pattern für Status-Setting.

**Architektur-Skizze:**

```
Apple Music (Music.app)
   ↓ scrobbelt via NepTunes
Last.fm (getRecentTracks?nowplaying=true)
   ↓ Polling alle 10s (Bridge)
   ↓ Fallback: osascript → Music.app
Bridge (Node.js/TS)
   ↓ Gather HTTP API (setStatus)
Gather Space (Status: ♫ Artist – Track)
```

## Constraints

- **Tech Stack**: Node.js/TypeScript — passt zum Vorbild `mod-spotify-as-status`, gute Last.fm- und Gather-HTTP-Libs verfügbar
- **Plattform**: nur macOS — AppleScript-Fallback und launchd-Integration sind Mac-spezifisch
- **Sicherheit**: API-Keys nicht in Repo — `.env` muss in `.gitignore`, niemals committen
- **Rate-Limit**: Last.fm erlaubt 5 Calls/Sekunde pro IP — 10s-Polling ist weit drunter, aber Cap nicht überschreiten
- **Abhängigkeit**: NepTunes muss laufen, damit Last.fm-Daten ankommen — Fallback auf AppleScript fängt das auf

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Last.fm als primäre Datenquelle, AppleScript als Fallback | Apple Music hat keine Live-API; Last.fm via NepTunes ist die etablierte Bridge; AppleScript greift, falls NepTunes mal aus ist | — Pending |
| Node.js/TypeScript statt Python/Go | Ökosystem-Match zum Vorbild `mod-spotify-as-status`; npm + launchd ist der vorhandene macOS-Workflow | — Pending |
| Background-Daemon via launchd (kein UI) | Das Tool soll unsichtbar laufen — Status setzen ist eine Hintergrundaufgabe, kein UI nötig | — Pending |
| 10-Sekunden-Polling | Schnelle Reaktion auf Track-Wechsel, weit unter Last.fm-Rate-Limit | — Pending |
| `.env` für Secrets statt macOS Keychain | Single-User, ein Repo, einfacher Setup; Keychain wäre Overkill | — Pending |
| Status leeren bei Pause statt stale stehen lassen | Saubere Anzeige für Kollegen; sie sollen nicht denken, ich höre seit 2h dasselbe | — Pending |
| Single-User, kein Team-Sharing, kein Open-Source | Persönliches Werkzeug, Veröffentlichung würde Doku/Tests/CI nötig machen — Aufwand nicht gerechtfertigt | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-08 after initialization*
