import type { GatherSink } from "./sink/gather.js";
import type { NowPlaying } from "./types.js";
import type { NowPlayingSource } from "./sources/types.js";
import { nowPlayingKey } from "./diff.js";
import { log } from "./logger.js";

const POLL_INTERVAL_MS = 10_000;

/**
 * Polling-Loop (LOOP-01..03).
 *
 * - LOOP-01: Recursive `setTimeout` mit AbortController (BEWUSST keine
 *   periodische Interval-Variante). Eine periodische Variante würde bei
 *   langen Ticks überlappen (Pitfall 8) und nach macOS-Sleep/Wake unsauber
 *   driften (Pitfall 14). Recursion garantiert sequentielle Ticks und
 *   sauberen Cancel via abort.signal.
 * - LOOP-02: Track-Diff via Composite-Key. Bei gleichem Key kein redundantes
 *   `setStatus` — Idempotenz schont Gather-Bandbreite und Logs.
 * - LOOP-03: Try/Catch um jeden Tick. Source-Chain wirft by contract zwar nicht
 *   (SRC-05 Layered Defense), aber Belt-and-suspenders gegen unerwartete
 *   Sink-Errors oder Modul-Lade-Fehler.
 *
 * `runLoop` ist NICHT `async` — der erste Tick wird sofort fire-and-forget
 * gestartet (`void tick()`), damit der Caller in `index.ts` direkt die Signal-
 * Handler registrieren kann, ohne auf das erste Polling-Ergebnis zu warten.
 */
export function runLoop(
  sink: GatherSink,
  getNowPlaying: NowPlayingSource,
  abort: AbortController,
): void {
  let lastKey: string | null = null;
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (abort.signal.aborted) return;

    try {
      const np: NowPlaying = await getNowPlaying();
      const key = nowPlayingKey(np);

      if (key !== lastKey) {
        log.info({ from: lastKey, to: key }, "[loop] track changed");
        if (np === null) {
          await sink.clearStatus();
        } else {
          await sink.setStatus(np);
        }
        lastKey = key;
      }
    } catch (err) {
      // LOOP-03: Tick-Fehler isolieren, nicht crashen.
      log.error({ err }, "[loop] tick failed");
    }

    // Nach Tick erneut Abort prüfen — nichts mehr neu schedulen, wenn Shutdown läuft.
    if (!abort.signal.aborted) {
      timer = setTimeout(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    }
  };

  // Optional: AbortSignal-Listener cleart pending Timer beim Shutdown,
  // damit Node nicht noch 10s auf den nächsten Tick wartet.
  abort.signal.addEventListener("abort", () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }, { once: true });

  // Erster Tick sofort, fire-and-forget.
  void tick();
}
