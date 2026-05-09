/**
 * GatherSink (CDP-Pfad, Phase 5).
 *
 * Ersetzt die WebSocket-basierte Implementierung aus Phase 1, die gegen
 * Gather 2.0 (`app.v2.gather.town`) 404t. Statt direkt die WS-Protokolle
 * zu sprechen, ruft diese Implementierung die interne Mutation der lokal
 * laufenden GatherV2-Electron-App via Chrome-DevTools-Protocol auf.
 *
 * Public-API ist identisch zu Phase 1 — Caller (Loop, Index, Smoke-Test)
 * müssen nur `await` an `setStatus`/`clearStatus` ergänzen (waren vorher sync).
 *
 * Voraussetzung: GatherV2 läuft mit `--remote-debugging-port=9222`.
 * Siehe README + .planning/phases/05-cdp-bridge-refactor/05-CONTEXT.md.
 *
 * Connection-Strategie: Per-Call (kein persistentes CDP-Client-Handle). Begründung:
 * App-Restarts wechseln die WS-Debugger-URL der Page; persistent + Reconnect
 * würde mehr Failure-Modes einführen als die ~200ms-Latenz wert sind, die ein
 * Per-Call-Connect kostet. 10s-Polling ist Latenz-tolerant.
 */
import { spawnSync } from "node:child_process";
import CDP from "chrome-remote-interface";
import type { NowPlaying } from "../types.js";
import { log } from "../logger.js";

interface CDPConfig {
  port: number; // default 9222
  pageUrlFilter: string; // default "app.v2.gather.town"
  appPath: string; // default "/Applications/GatherV2.app"
  autoHeal: boolean; // default true — relaunch GatherV2 if it runs without debug-flag
}

type CDPTarget = {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GatherSink {
  private cfg: CDPConfig;
  private _connected = false;
  private _healing = false;

  constructor(cfg: Partial<CDPConfig> = {}) {
    this.cfg = {
      port: cfg.port ?? 9222,
      pageUrlFilter: cfg.pageUrlFilter ?? "app.v2.gather.town",
      appPath: cfg.appPath ?? "/Applications/GatherV2.app",
      autoHeal: cfg.autoHeal ?? true,
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    // Pre-Flight: CDP erreichbar UND eine Page mit dem URL-Filter offen.
    // Schlägt explizit fehl, wenn die App nicht mit dem Debug-Flag gestartet wurde
    // oder noch auf der Login-Page hängt — der Caller (index.ts) wirft dann mit
    // klarer Setup-Anleitung in den Last-Word-Log.
    try {
      const page = await this.findPage();
      if (!page) {
        const msg =
          `[gather] no GatherV2 page found at localhost:${this.cfg.port}. ` +
          `Start the app with: open -a GatherV2 --args --remote-debugging-port=${this.cfg.port}`;
        log.warn({ port: this.cfg.port, filter: this.cfg.pageUrlFilter }, msg);
        throw new Error(msg);
      }
      this._connected = true;
      log.info(
        { port: this.cfg.port, pageUrl: page.url },
        "[gather] CDP pre-flight OK",
      );
    } catch (err) {
      this._connected = false;
      // log.warn (nicht log.info) auf dem Fehlerpfad, damit der Eintrag auch
      // dann sichtbar ist, wenn der Caller den Throw weiter oben schluckt.
      log.warn({ err, port: this.cfg.port }, "[gather] CDP pre-flight failed");
      throw err;
    }
  }

  async setStatus(np: NonNullable<NowPlaying>): Promise<void> {
    // JSON.stringify für JEDEN interpolierten Wert (T-05-01):
    // schützt gegen Anführungszeichen/Newlines im Track-Namen, z.B.
    //   `Don't Stop Me Now`  -> "Don't Stop Me Now"
    //   `track\nwith\nnewlines` -> "track\nwith\nnewlines"
    // Ohne Stringify wäre der setCustomStatus-Call eine Code-Injection-Lücke
    // im Renderer-Kontext.
    const emojiLiteral = JSON.stringify("🎧");
    const textLiteral = JSON.stringify(`${np.artist} – ${np.track}`);
    const expr =
      `gatherDev.Repos.gameSpace.currentSpaceUser.setCustomStatus({` +
      `emoji: ${emojiLiteral}, ` +
      `text: ${textLiteral}, ` +
      `clearCondition: {type: "Never"}` +
      `})`;
    await this.runInPage(expr);
    log.info(
      { artist: np.artist, track: np.track },
      "[gather] status set via CDP",
    );
  }

  async clearStatus(): Promise<void> {
    await this.runInPage(
      `gatherDev.Repos.gameSpace.currentSpaceUser.clearCustomStatus()`,
    );
    log.info("[gather] status cleared via CDP");
  }

  async disconnect(): Promise<void> {
    // Per-Call-Strategie hält keine persistente Connection — disconnect ist
    // semantisch nur ein "lebenslauf-fertig"-Marker für den Caller. Setzt
    // `connected = false`, damit nachfolgende `setStatus`/`clearStatus`
    // grundsätzlich noch funktionieren würden (Pre-Flight passiert pro Call),
    // aber `connected`-Getter signalisiert "nicht mehr aktiv".
    this._connected = false;
  }

  // --- internals ---

  private async fetchTargets(): Promise<CDPTarget[]> {
    // AbortSignal.timeout(2000) verhindert Hänger, wenn der Port offen ist
    // aber niemand antwortet (z.B. eine andere Electron-App, die kein CDP
    // serviert oder DNS-/Connect-Stalls).
    const res = await fetch(`http://localhost:${this.cfg.port}/json`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      throw new Error(`CDP /json HTTP ${res.status}`);
    }
    return (await res.json()) as CDPTarget[];
  }

  private async findPage(): Promise<CDPTarget | undefined> {
    const targets = await this.fetchTargets();
    return targets.find(
      (t) => t.type === "page" && t.url.includes(this.cfg.pageUrlFilter),
    );
  }

  /**
   * Probe: ist `window.gatherDev` im Renderer schon definiert? Genutzt nach
   * Auto-Heal-Relaunch um Race zwischen Page-Verfügbarkeit und Bundle-Init zu
   * vermeiden. Cheap eval, kein State-Change. Errors werden als "noch nicht
   * ready" interpretiert (return false, kein Throw).
   */
  private async probeGatherDev(wsDebuggerUrl: string): Promise<boolean> {
    let client;
    try {
      client = await CDP({ target: wsDebuggerUrl });
      await client.Runtime.enable();
      const r = await client.Runtime.evaluate({
        expression: `typeof gatherDev !== "undefined" && !!gatherDev?.Repos?.gameSpace?.currentSpaceUser`,
        returnByValue: true,
      });
      return r.result.value === true;
    } catch {
      return false;
    } finally {
      if (client) await client.close().catch(() => {});
    }
  }

  /**
   * Prüft ob eine GatherV2-Process-Instanz läuft. Genutzt für Auto-Heal-Entscheidung
   * (App da, aber CDP-Port zu = User hat ohne Flag gestartet, z.B. via Spotlight).
   */
  private isGatherRunning(): boolean {
    const r = spawnSync("/usr/bin/pgrep", ["-x", "GatherV2"], {
      stdio: "ignore",
      timeout: 2000,
    });
    return r.status === 0;
  }

  /**
   * Auto-Heal: GatherV2 läuft ohne Debug-Flag (User hat via Spotlight, Dock oder
   * Finder gestartet). Quittet die App graceful, startet sie mit Flag neu, und
   * wartet bis CDP wieder erreichbar ist.
   *
   * Mehrfach-Aufrufe parallel werden via _healing-Flag verhindert.
   */
  private async relaunchGather(): Promise<void> {
    if (this._healing) {
      // Anderer Call macht gerade Auto-Heal — warte bis fertig statt parallel.
      while (this._healing) await sleep(250);
      return;
    }
    this._healing = true;
    try {
      log.warn(
        { appPath: this.cfg.appPath, port: this.cfg.port },
        "[gather] auto-heal: GatherV2 running without debug-port — restarting with flag",
      );

      // 1. Graceful quit via osascript (max 5s)
      spawnSync(
        "/usr/bin/osascript",
        ["-e", 'tell application "GatherV2" to quit'],
        { timeout: 5000, stdio: "ignore" },
      );

      // 2. Warte bis Process weg (max 10s), sonst force-kill
      for (let i = 0; i < 20; i++) {
        if (!this.isGatherRunning()) break;
        await sleep(500);
      }
      if (this.isGatherRunning()) {
        log.warn("[gather] auto-heal: graceful quit timed out, force-killing");
        spawnSync("/usr/bin/pkill", ["-x", "GatherV2"], { stdio: "ignore" });
        await sleep(1000);
      }

      // 3. Relaunch mit Debug-Flag
      const openResult = spawnSync(
        "/usr/bin/open",
        [
          "-a",
          this.cfg.appPath,
          "--args",
          `--remote-debugging-port=${this.cfg.port}`,
        ],
        { stdio: "ignore", timeout: 5000 },
      );
      if (openResult.status !== 0) {
        throw new Error(
          `[gather] auto-heal: 'open -a ${this.cfg.appPath}' failed (exit ${openResult.status})`,
        );
      }

      // 4. Warte bis CDP-Page UND gatherDev verfügbar sind (max 30s).
      //    Page allein reicht nicht — Electron lädt erst die Splash-Page,
      //    dann bootet das Renderer-Bundle, dann erst exposed `window.gatherDev`.
      //    Wenn wir zu früh runInPage'n, schmeißt es "gatherDev is not defined".
      for (let i = 0; i < 60; i++) {
        const page = await this.findPage().catch(() => undefined);
        if (page && page.webSocketDebuggerUrl) {
          // Probe: ist `gatherDev` schon im Renderer initialisiert?
          const ready = await this.probeGatherDev(page.webSocketDebuggerUrl);
          if (ready) {
            log.info(
              { tries: i + 1, pageUrl: page.url },
              "[gather] auto-heal: CDP ready (gatherDev initialized)",
            );
            return;
          }
        }
        await sleep(500);
      }
      throw new Error(
        "[gather] auto-heal: gatherDev did not become available within 30s after relaunch",
      );
    } finally {
      this._healing = false;
    }
  }

  private async runInPage(expression: string): Promise<void> {
    // Targets pro Call frisch holen — App-Restarts wechseln die WS-Debugger-URL.
    let page: CDPTarget | undefined;
    try {
      page = await this.findPage();
    } catch (err) {
      // fetchTargets warf — CDP-Port unreachable (typischer Spotlight-Start-Fall).
      // Auto-Heal: wenn die App läuft aber kein Debug-Port, killen+restarten.
      if (this.cfg.autoHeal && this.isGatherRunning()) {
        await this.relaunchGather();
        page = await this.findPage(); // retry once after heal
      } else {
        throw err;
      }
    }

    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error(
        "[gather] no GatherV2 page available (app not running or not in space)",
      );
    }

    const client = await CDP({ target: page.webSocketDebuggerUrl });
    try {
      const { Runtime } = client;
      // Runtime.enable MUSS vor evaluate, sonst wirft CDP "Runtime is disabled".
      await Runtime.enable();
      // Wrapping in IIFE + awaitPromise:true — falls die innere Mutation eine
      // Promise zurückgibt (interne State-Updates in GatherV2 können async sein),
      // warten wir hier auf die Resolution. `return await` macht den Wert sauber
      // an den Outer-Promise weiterreichbar; kein Semicolon-Sandwich.
      const r = await Runtime.evaluate({
        expression: `(async () => { return await ${expression}; })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        const detail =
          r.exceptionDetails.exception?.description ??
          JSON.stringify(r.exceptionDetails);
        throw new Error(`[gather] runInPage failed: ${detail}`);
      }
    } finally {
      // Close-Errors schlucken (Idempotenz): wenn die Page in der Zwischenzeit
      // zumacht, schmeißt close() — wir wollen den eigentlichen Caller-Flow
      // nicht maskieren. Errors aus der evaluate-Phase landen vorher im throw.
      await client.close().catch(() => {});
    }
  }
}
