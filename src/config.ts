import "dotenv/config";
import { z } from "zod";

/**
 * Zod-Schema für Env-Vars.
 *
 * Gather-Keys sind Pflicht (Sink ohne sie sinnlos).
 * Last.fm-Keys sind optional: wenn beide leer/fehlend sind, läuft die
 * Source-Chain ausschließlich über AppleScript gegen Music.app. Beide müssen
 * konsistent gesetzt sein — entweder beide oder keiner.
 */
const EnvSchema = z
  .object({
    LASTFM_API_KEY: z.string().optional().default(""),
    LASTFM_USER: z.string().optional().default(""),
    GATHER_API_KEY: z.string().min(1, "GATHER_API_KEY fehlt oder ist leer"),
    GATHER_SPACE_ID: z.string().min(1, "GATHER_SPACE_ID fehlt oder ist leer"),
  })
  .refine(
    (data) =>
      (data.LASTFM_API_KEY === "" && data.LASTFM_USER === "") ||
      (data.LASTFM_API_KEY !== "" && data.LASTFM_USER !== ""),
    {
      message:
        "LASTFM_API_KEY und LASTFM_USER müssen beide gesetzt oder beide leer sein",
      path: ["LASTFM_API_KEY"],
    },
  );

export type Config = z.infer<typeof EnvSchema>;

function loadConfig(): Config {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Kein Logger-Import hier (Circular: logger braucht möglicherweise
    // selbst keine Config, aber defensiv halten wir den Boot-Pfad logger-frei).
    // Stderr direkt, klar formatiert.
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    process.stderr.write(
      `\n[config] Ungültige Konfiguration. Daemon wird NICHT neu starten.\n${issues}\n` +
        `\nLösung: Prüfe \`.env\` im Projekt-Root, vergleiche mit \`.env.example\`.\n\n`,
    );
    // EXIT CODE 0 (nicht 1!) — siehe CFG-03 und Pitfall 2:
    // launchd in Phase 4 nutzt KeepAlive: { SuccessfulExit: false, Crashed: true }.
    // Bei exit(1) würde launchd als "Crashed" werten und endlos restarten.
    // Bei exit(0) bleibt der Daemon gestoppt, bis User `.env` fixt und manuell startet.
    process.exit(0);
  }
  return result.data;
}

export const config: Config = loadConfig();
