import { z } from "zod";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { NowPlaying } from "../types.js";

/**
 * Last.fm-Now-Playing-Adapter (SRC-01, SRC-05).
 *
 * Endpoint: user.getRecentTracks (HTTP GET, kein Auth-Header, api_key in Query).
 * Filter: @attr.nowplaying === "true" via tracks.find (NICHT track[0], Pitfall 3).
 * Fehlerbehandlung: try/catch wraps fetch + JSON-Parse + Zod-Parse → log.warn + return null.
 *
 * Wird in Phase 2 Plan 02 (Source-Chain) gemeinsam mit dem AppleScript-Adapter genutzt.
 * AppleScript ist Authority für Play/Pause/Stop (SRC-03); dieser Adapter liefert nur
 * die Metadaten, wenn überhaupt etwas spielt.
 *
 * Rate-Limit: Last.fm erlaubt 5 Calls/s/IP (gemittelt über 5min). 10s-Polling = 0.1 Calls/s,
 * extrem safe (siehe PITFALLS Integration Gotchas).
 *
 * Native fetch (Node 22+) nutzt undici keep-alive per Default — kein Agent nötig.
 */

/**
 * Defensives Zod-Schema für `user.getRecentTracks`-Response.
 *
 * Gemacht für Last.fm-Schluckauf: leere track-Arrays, fehlende @attr-Objects,
 * unerwartete Felder. Alles, was nicht zwingend für unseren Use-Case ist,
 * ist optional — sonst zerschießt ein API-Schluckauf den Parse.
 *
 * Konkrete Beobachtungen aus PITFALLS:
 * - Currently-playing-Track hat KEIN `date`-Feld, alle anderen schon → date als optional
 * - @attr fehlt komplett, wenn der Track nicht nowplaying ist → optional
 * - track kann ein Objekt statt Array sein, wenn nur 1 Track existiert (alte Last.fm-Quirk) → wir akzeptieren beide Formen
 */
const TrackSchema = z.object({
  name: z.string(),
  artist: z.object({ "#text": z.string() }),
  "@attr": z.object({ nowplaying: z.string() }).optional(),
  // date ist absichtlich nicht modelliert — wir nutzen es nicht
});

const RecentTracksResponseSchema = z.object({
  recenttracks: z.object({
    // Last.fm liefert manchmal Objekt statt Array bei einem einzigen Track:
    track: z.union([z.array(TrackSchema), TrackSchema]),
  }),
});

export async function getLastFmNowPlaying(): Promise<NowPlaying> {
  // Last.fm ist optional: bei leeren Keys einfach null zurückgeben,
  // damit die Source-Chain auf AppleScript zurückfällt.
  if (!config.LASTFM_API_KEY || !config.LASTFM_USER) {
    return null;
  }

  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.search = new URLSearchParams({
      method: "user.getrecenttracks",
      user: config.LASTFM_USER,
      api_key: config.LASTFM_API_KEY,
      format: "json",
      limit: "1",
    }).toString();

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      log.warn({ status: res.status }, "[lastfm] non-2xx response");
      return null;
    }

    const json: unknown = await res.json();
    const parsed = RecentTracksResponseSchema.parse(json);

    // Normalisieren: Array oder Single-Object → Array
    const tracksRaw = parsed.recenttracks.track;
    const tracks = Array.isArray(tracksRaw) ? tracksRaw : [tracksRaw];

    // SRC-01: Filter via @attr.nowplaying === "true", NICHT track[0] (Pitfall 3)
    const np = tracks.find((t) => t["@attr"]?.nowplaying === "true");
    if (!np) {
      // Kein nowplaying-Track in der Response — gerade läuft (laut Last.fm) nichts.
      // Kein Log-Spam: das ist der Normalfall, wenn Music.app pausiert ist.
      return null;
    }

    const artist = np.artist["#text"];
    const track = np.name;
    if (!artist || !track) {
      log.warn({ np }, "[lastfm] nowplaying track missing artist/track");
      return null;
    }
    return { artist, track };
  } catch (err) {
    // SRC-05: jeder Fehler (Netzwerk, Timeout, Zod-Parse, JSON) → log + null.
    // KEIN throw — der Caller (Source-Chain) muss sich darauf verlassen können,
    // dass diese Funktion nicht crasht.
    log.warn({ err }, "[lastfm] failed to fetch now-playing");
    return null;
  }
}
