/**
 * Smoke-Test für GatherSink — gegen ECHTES Gather-Space.
 *
 * Voraussetzung: `.env` ist gefüllt mit echten Werten für GATHER_API_KEY und
 * GATHER_SPACE_ID. (LASTFM_*-Vars werden hier nicht genutzt, müssen aber
 * gesetzt sein, weil Config-Validation die ALLE checkt.)
 *
 * Ablauf:
 * 1. Connect zu Gather-Space.
 * 2. Setze Status `♫ Daft Punk – Around the World` (hardcoded).
 * 3. Warte 10 Sekunden — User verifiziert manuell im Gather-Browser-Tab.
 * 4. Leere Status (`clearStatus`).
 * 5. Warte 2 Sekunden — User verifiziert, dass Status weg ist.
 * 6. Disconnect (await), exit(0).
 *
 * Aufruf: `npm run test:sink`
 */
import { config } from "../src/config.js";
import { log } from "../src/logger.js";
import { GatherSink } from "../src/sink/gather.js";

async function main() {
  log.info("[test-sink] starting smoke test");

  const sink = new GatherSink(config.GATHER_SPACE_ID, config.GATHER_API_KEY);

  log.info("[test-sink] connecting...");
  await sink.connect();
  log.info({ connected: sink.connected }, "[test-sink] connected");

  log.info("[test-sink] setting status: Daft Punk – Around the World");
  sink.setStatus({ artist: "Daft Punk", track: "Around the World" });

  log.info("[test-sink] waiting 10 seconds — please verify status in Gather browser tab");
  await sleep(10_000);

  log.info("[test-sink] clearing status");
  sink.clearStatus();

  log.info("[test-sink] waiting 2 seconds — please verify status is empty");
  await sleep(2_000);

  log.info("[test-sink] disconnecting");
  await sink.disconnect();

  log.info("[test-sink] smoke test complete");
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  log.fatal({ err }, "[test-sink] smoke test FAILED");
  process.exit(1);
});
