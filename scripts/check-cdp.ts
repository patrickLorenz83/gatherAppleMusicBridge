/**
 * CDP-Pre-Flight-Check für die GatherV2-Electron-App.
 *
 * Läuft eigenständig, ohne `dotenv`/`config`-Import — liest die zwei optionalen
 * Env-Vars direkt, fällt auf Defaults zurück. So kann der User auch debuggen,
 * wenn die `.env` kaputt ist.
 *
 * Aufruf: `npm run check-cdp`
 *
 * Failure-Modes (beide mit präzisem Output für den Bedarfsfall):
 * 1. CDP-Port nicht erreichbar — App nicht mit --remote-debugging-port=PORT gestartet.
 * 2. CDP läuft, aber keine Page mit URL-Substring `app.v2.gather.town` —
 *    User ist auf der Login-Page oder GatherV2 ist auf einer anderen Route.
 */

const port = process.env.GATHER_CDP_PORT ?? "9222";
const filter = process.env.GATHER_PAGE_URL_FILTER ?? "app.v2.gather.town";

try {
  const r = await fetch(`http://localhost:${port}/json`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!r.ok) throw new Error(`CDP HTTP ${r.status}`);
  const targets = (await r.json()) as Array<{
    type: string;
    url: string;
    webSocketDebuggerUrl?: string;
  }>;
  const page = targets.find(
    (t) => t.type === "page" && t.url.includes(filter),
  );
  if (!page) {
    console.error(
      `❌ CDP läuft auf localhost:${port}, aber keine Page mit URL-Substring "${filter}" gefunden.`,
    );
    console.error(
      `   Vermutlich: GatherV2 läuft, aber du bist nicht im Space eingeloggt, oder die App ist auf der Login-Page.`,
    );
    console.error(`   Aktuelle Pages:`);
    for (const t of targets) {
      console.error(`     [${t.type}] ${t.url}`);
    }
    process.exit(1);
  }
  console.log(`✅ GatherV2-Page erreichbar: ${page.url}`);
  console.log(
    `   WebSocket: ${page.webSocketDebuggerUrl ?? "(kein webSocketDebuggerUrl gemeldet)"}`,
  );
  process.exit(0);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ CDP nicht erreichbar auf localhost:${port}.`);
  console.error(`   Starte GatherV2 mit:`);
  console.error(
    `     open -a GatherV2 --args --remote-debugging-port=${port}`,
  );
  console.error(`   Detail: ${msg}`);
  process.exit(1);
}
