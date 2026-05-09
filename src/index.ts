import { config } from "./config.js";
import { log } from "./logger.js";
import { GatherSink } from "./sink/gather.js";
import { getNowPlaying } from "./sources/chain.js";
import { runLoop } from "./loop.js";

const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Last-Word-Log-Helper (LOOP-05).
 *
 * Ersatz für `pino.final()` — die API ist in pino 10.x entfernt worden
 * (zugunsten des transport-Patterns, siehe pino/docs/transports.md). Wir
 * brauchen aber dasselbe Verhalten: einen synchron-geflushten Fatal-Log-
 * Eintrag, bevor `process.exit(1)` den Daemon zerlegt.
 *
 * Strategie:
 *   1. `log.fatal(...)` schreibt den Eintrag ins Logger-Buffer.
 *   2. `log.flushSync()` zwingt SonicBoom (pino's Default-Destination) den
 *      Buffer synchron auf den Stream zu schreiben. Ohne das gehen die
 *      letzten Log-Zeilen bei sofortigem process.exit verloren (Pitfall 17).
 *   3. `flushSync` ist auf SonicBoom-Backed-Loggers verfügbar; in pino 10
 *      ist es der dokumentierte Weg für synchrones Flushing.
 *
 * In Phase 4 unter launchd (File-Sink) absolut kritisch, in Phase 3
 * (stderr/stdout) defensiv aber harmlos.
 */
function finalFatal(payload: object, msg: string): void {
  log.fatal(payload, msg);
  try {
    // log.flushSync() ist in pino@10 vorhanden (typed via LoggerExtras),
    // aber nur bei SonicBoom-Destinations sinnvoll — kein Fehler wenn no-op.
    (log as unknown as { flushSync?: () => void }).flushSync?.();
  } catch {
    // Last-Word-Log darf nicht selbst werfen — schluck Flush-Errors.
  }
}

async function shutdown(
  signal: string,
  abort: AbortController,
  sink: GatherSink,
): Promise<void> {
  log.info({ signal }, "[shutdown] received");
  abort.abort();

  try {
    await Promise.race([
      (async () => {
        try {
          await sink.clearStatus();
        } catch (err) {
          log.warn({ err }, "[shutdown] clearStatus threw");
        }
        await sink.disconnect();
      })(),
      new Promise<never>((_, rej) =>
        setTimeout(
          () => rej(new Error("shutdown timeout")),
          SHUTDOWN_TIMEOUT_MS,
        ),
      ),
    ]);
    log.info("[shutdown] cleanup complete");
  } catch (err) {
    // 5s-Timeout oder anderer Fehler: trotzdem mit exit(0) raus.
    // launchd in Phase 4 darf das NICHT als Crash werten und Restart auslösen.
    log.warn({ err }, "[shutdown] cleanup did not complete in 5s");
  }

  process.exit(0);
}

async function main(): Promise<void> {
  log.info("[daemon] starting gatherAppleMusicBridge");

  const sink = new GatherSink({
    port: config.GATHER_CDP_PORT,
    pageUrlFilter: config.GATHER_PAGE_URL_FILTER,
    appPath: config.GATHER_APP_PATH,
    autoHeal: config.GATHER_AUTO_HEAL,
  });
  await sink.connect();
  log.info("[daemon] sink connected");

  const abort = new AbortController();

  // LOOP-04: Beide Signale registrieren. Beide rufen shutdown.
  // Mehrfaches Senden (Doppel-Ctrl-C) wird durch ein Flag abgesichert:
  // Nach erstem Signal kein zweites mehr verarbeiten, sonst überlappen
  // mehrere shutdown-Calls und sink.disconnect() wird doppelt awaited.
  let shuttingDown = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      log.warn({ signal }, "[shutdown] already in progress, ignoring");
      return;
    }
    shuttingDown = true;
    void shutdown(signal, abort, sink);
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  // LOOP-05: Last-Word-Log für unhandled Async-Errors. finalFatal macht den
  // Write synchron via flushSync (Ersatz für pino.final, das in pino 10
  // entfernt wurde) — sonst gehen die letzten Log-Zeilen bei sofortigem
  // exit verloren (Pitfall 17). exit(1), weil das ein Bug ist; launchd
  // entscheidet in Phase 4 via KeepAlive-Strategy über Restart.
  process.on("unhandledRejection", (reason) => {
    finalFatal({ reason }, "[fatal] unhandled rejection");
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    finalFatal({ err }, "[fatal] uncaught exception");
    process.exit(1);
  });

  log.info({ intervalMs: 10_000 }, "[daemon] starting polling loop");
  runLoop(sink, getNowPlaying, abort);
}

// Top-Level-await wäre möglich (ESM), aber main().catch ist robuster:
// jeder Throw beim Start landet im Last-Word-Log, exit(1) für launchd-
// KeepAlive-Strategy.
main().catch((err) => {
  finalFatal({ err }, "[fatal] daemon failed to start");
  process.exit(1);
});
