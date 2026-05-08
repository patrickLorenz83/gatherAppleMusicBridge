import "dotenv/config";
import { z } from "zod";

/**
 * Zod-Schema für die 4 Pflicht-Env-Vars (siehe CFG-01).
 *
 * Alle als `min(1)`, weil leerer String genauso schlecht wie fehlend ist —
 * dotenv liefert leere Strings für definierte aber leere Keys (KEY=).
 */
const EnvSchema = z.object({
  LASTFM_API_KEY: z.string().min(1, "LASTFM_API_KEY fehlt oder ist leer"),
  LASTFM_USER: z.string().min(1, "LASTFM_USER fehlt oder ist leer"),
  GATHER_API_KEY: z.string().min(1, "GATHER_API_KEY fehlt oder ist leer"),
  GATHER_SPACE_ID: z.string().min(1, "GATHER_SPACE_ID fehlt oder ist leer"),
});

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
