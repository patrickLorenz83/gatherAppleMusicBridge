/**
 * Smoke-Test für GatherSink (Phase 5, CDP-Pfad).
 *
 * Voraussetzung: GatherV2-Electron-App läuft mit
 *   open -a GatherV2 --args --remote-debugging-port=9222
 * und du bist im Space eingeloggt (eigener Avatar im UI sichtbar).
 *
 * Ablauf:
 * 1. Pre-Flight (`sink.connect()`) — sucht GatherV2-Page auf localhost:9222.
 * 2. setStatus(`{artist:"Daft Punk", track:"Around the World"}`) — zeigt 🎵 + Text.
 * 3. 10s warten — User verifiziert visuell im GatherV2-UI.
 * 4. clearStatus() — UI-Status verschwindet.
 * 5. 2s warten — User verifiziert leeren Status.
 * 6. disconnect() (no-op, weil per-call CDP), exit(0).
 *
 * Aufruf: `npm run test:sink`
 *
 * Hinweis: KEIN `import { config }` mehr — der Smoke-Test läuft mit den
 * CDP-Defaults aus dem GatherSink-Konstruktor (port 9222, filter
 * app.v2.gather.town). Damit ist der Test auch unabhängig von der LASTFM-
 * Config startbar (kein Pflicht-Refine triggern).
 */
import { log } from "../src/logger.js";
import { GatherSink } from "../src/sink/gather.js";

async function main() {
  log.info("[test-sink] starting smoke test");

  // Kein Argument — Defaults aus CDPConfig (port 9222, filter app.v2.gather.town).
  // Falls Port/Filter via .env überschrieben werden sollen, manuell aus
  // `config` ziehen — für den Smoke-Test reichen die Defaults.
  const sink = new GatherSink();

  log.info("[test-sink] pre-flight CDP check...");
  await sink.connect();
  log.info({ connected: sink.connected }, "[test-sink] CDP page found, ready");

  log.info("[test-sink] setting status: 🎵 Daft Punk – Around the World");
  await sink.setStatus({ artist: "Daft Punk", track: "Around the World" });

  log.info(
    "[test-sink] waiting 10 seconds — please verify status in GatherV2 UI",
  );
  await sleep(10_000);

  log.info("[test-sink] clearing status");
  await sink.clearStatus();

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
