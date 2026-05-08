// WICHTIG: setup-ws MUSS der ERSTE Import sein, bevor `@gathertown/gather-game-client`
// geladen wird (siehe SINK-02 + Pitfall 4). Static-Imports werden in der
// Reihenfolge ihrer Deklaration evaluiert — diese Zeile triggert den Polyfill,
// die nächste Zeile lädt den Game-Client und liest dann das schon gesetzte
// `globalThis.WebSocket`.
import "../setup-ws.js";
import { Game } from "@gathertown/gather-game-client";

import type { NowPlaying } from "../types.js";
import { log } from "../logger.js";

/**
 * Wrapper um den Gather-Game-Client mit minimaler Public-API:
 * - `connect()` — verbindet zum Space, resolved wenn `connected === true` ist.
 * - `setStatus(np)` — setzt Emoji `♫` und Text `Artist – Track`.
 * - `clearStatus()` — leert beide Status (Pause/Stop).
 * - `disconnect()` — schließt die Verbindung sauber (async, awaitable).
 * - `connected` (readonly) — aktueller Connection-State.
 *
 * Lifecycle-Annahmen für Phase 1 (siehe CONTEXT.md "Specifics"):
 * - `connect()` wartet auf das erste `subscribeToConnection(true)`-Event
 *   ODER timeoutet nach 10 s und wirft.
 * - KEIN automatischer Reconnect-Pfad in v1 (kommt in v2 / ROBUST-02).
 * - `setStatus`/`clearStatus` werfen NICHT bei `connected === false`,
 *   sondern loggen Warning — defensiv, weil der Caller nichts dagegen
 *   tun kann außer reconnecten.
 *
 * Status-Format (SINK-03): `♫` als Emoji, `${artist} – ${track}` als Text.
 * Der Gedankenstrich `–` (U+2013) ist hier Display-Format, nicht Prosa —
 * folgt dem Reference-Repo `mod-spotify-as-status`. Längen-Cap kommt in v2
 * (QOL-01, siehe Pitfall 16, akzeptiert für v1).
 *
 * API-Befunde aus node_modules/@gathertown/gather-game-client/dist/src/Game.d.ts:
 * - `game.disconnect(): Promise<void>` — async, awaitable (NICHT synchron).
 * - `game.subscribeToConnection(cb): () => void` — gibt Unsubscribe-Funktion zurück.
 * - `game.sendAction({ $case: "...", ... })` — synchron (kein await nötig).
 */
export class GatherSink {
  private game: Game;
  private _connected = false;

  constructor(spaceId: string, apiKey: string) {
    this.game = new Game(spaceId, () => Promise.resolve({ apiKey }));
    this.game.subscribeToConnection((connected: boolean) => {
      this._connected = connected;
      log.info({ connected }, "[gather] connection state changed");
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(timeoutMs = 10_000): Promise<void> {
    log.info("[gather] connecting...");
    this.game.connect();

    // Warte auf das erste connected=true-Event ODER Timeout.
    return new Promise<void>((resolve, reject) => {
      if (this._connected) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Gather connect timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsubscribe = this.game.subscribeToConnection((connected: boolean) => {
        if (connected) {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
    });
  }

  setStatus(np: NonNullable<NowPlaying>): void {
    if (!this._connected) {
      log.warn({ np }, "[gather] setStatus called while disconnected, skipping");
      return;
    }
    const text = `${np.artist} – ${np.track}`;
    log.info({ text }, "[gather] setStatus");
    this.game.sendAction({
      $case: "setEmojiStatus",
      setEmojiStatus: { emojiStatus: "♫" },
    });
    this.game.sendAction({
      $case: "setTextStatus",
      setTextStatus: { textStatus: text },
    });
  }

  clearStatus(): void {
    if (!this._connected) {
      log.warn("[gather] clearStatus called while disconnected, skipping");
      return;
    }
    log.info("[gather] clearStatus");
    this.game.sendAction({
      $case: "setEmojiStatus",
      setEmojiStatus: { emojiStatus: "" },
    });
    this.game.sendAction({
      $case: "setTextStatus",
      setTextStatus: { textStatus: "" },
    });
  }

  async disconnect(): Promise<void> {
    log.info("[gather] disconnecting");
    // gather-game-client@43.0.1: `disconnect(): Promise<void>` (verifiziert in
    // node_modules/@gathertown/gather-game-client/dist/src/Game.d.ts:92).
    // Wir awaiten den Promise, damit der Caller (Smoke-Test, später SIGTERM-
    // Handler in Phase 3) sicher sein kann, dass die Verbindung sauber
    // geschlossen ist, bevor der Prozess exitet.
    await this.game.disconnect();
    this._connected = false;
  }
}
