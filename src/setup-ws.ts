/**
 * WebSocket-Polyfill für `@gathertown/gather-game-client`.
 *
 * Pflicht (siehe SINK-02 + Pitfall 4):
 * Der Game-Client liest `globalThis.WebSocket` zur Modul-Load-Zeit. In
 * Node 22 existiert zwar `WebSocket` als globaler Symbol (seit Node 22.4),
 * aber der Game-Client prüft das nicht und nutzt das Symbol direkt — eine
 * unterschiedliche Implementierung (Browser-Spec vs. Undici-WebSocket-Spec)
 * würde u. U. nicht zu der erwarteten Form passen. Sicheres Pattern: explizit
 * mit `isomorphic-ws` (= `ws`-Polyfill für Node) überschreiben.
 *
 * Dieses Modul ist EIN reiner Side-Effect — KEIN Export. Wer es importiert,
 * triggert die Zuweisung. Der Import MUSS vor `@gathertown/gather-game-client`
 * stehen, in derselben Datei und in dieser Reihenfolge.
 *
 * Pattern aus dem offiziellen Gather-Reference-Repo `mod-spotify-as-status`.
 */
import WS from "isomorphic-ws";

(globalThis as { WebSocket?: unknown }).WebSocket = WS;
