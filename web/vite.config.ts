import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/**
 * Fassung zum Anzeigen: Bauzeit in UTC und, wenn vorhanden, der Commit. Zwei
 * Auslieferungen am selben Tag lassen sich so unterscheiden.
 */
function fassung(): string {
    let commit = "";
    try {
        commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        // Gebaut aus einem geänderten Arbeitsbaum: Das soll die Fassung zeigen.
        if (execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()) {
            commit += ", geändert";
        }
    } catch {
        commit = "";
    }
    const zeit = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
    return commit ? `${zeit} (${commit})` : zeit;
}
const FASSUNG = fassung();

// Die Web-App liegt in web/ und nutzt Datenmodell und Strichcode direkt aus src/.
// Relative Basis: läuft unter einer eigenen Domain genauso wie in einem Unterordner.
export default defineConfig({
    root: "web",
    base: "./",
    // Fassung zum Anzeigen im Fuß.
    define: { __FASSUNG__: JSON.stringify(FASSUNG) },
    // Beim Entwickeln signiert der Dienst nebenan (npm run dienst:build && npm start).
    server: { proxy: { "/wallet": "http://127.0.0.1:8080" } },
    build: {
        outDir: "../dist-web",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                app: "web/index.html",
                impressum: "web/impressum.html",
                datenschutz: "web/datenschutz.html"
            }
        }
    }
});
