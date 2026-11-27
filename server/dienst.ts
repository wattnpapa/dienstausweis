import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { bereinige, fehlendeAngaben, strichcodeInhalt } from "../src/daten.js";
import { strichcodeFehler } from "../src/strichcode.js";
import { applePass, type AppleEinstellung } from "./apple.js";
import { pngMasse } from "./bild.js";
import { googleLink, type GoogleEinstellung } from "./google.js";

// Der Dienst liefert die gebaute App aus und signiert Wallet-Pässe. Er hält
// nichts fest: keine Datenbank, keine Datei, und im Protokoll stehen weder
// Inhalte noch Adressen der Anfragenden. Im Speicher liegt nur der Zähler der
// Anfragebremse, und der vergisst nach zehn Minuten.

export interface DienstEinstellung {
    /** Ordner mit der gebauten App (dist-web). */
    web: string;
    apple?: AppleEinstellung;
    google?: GoogleEinstellung;
    /** Hinter einem Proxy: Absender aus X-Forwarded-For lesen. */
    hinterProxy: boolean;
    /** Fremde Adressen, die den Dienst rufen dürfen (App liegt woanders, etwa auf GitHub Pages). */
    urspruenge: string[];
    /** Pässe je Absender in zehn Minuten. */
    grenze: number;
    /** Emblem als fertiges PNG unter /marke/emblem.png; Google Wallet lädt es von dort. */
    emblem?: Buffer;
    /** Logo weiß mit Deckung, wie im Apple-Pass; die Vorschau der Seite lädt es von /marke/logo.png. */
    logo?: Buffer;
}

const MAX_ANFRAGE = 900_000;
const MAX_FOTO = 600_000;
const FENSTER_MS = 10 * 60_000;

const ARTEN: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon"
};

// Die App lädt nichts von fremden Adressen. Bilder als data:/blob: für das Passfoto.
const SICHERHEIT = {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
        + "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

class Abweisung extends Error {
    constructor(readonly status: number, meldung: string) {
        super(meldung);
    }
}

function lies(anfrage: IncomingMessage): Promise<Buffer> {
    return new Promise((fertig, fehler) => {
        const teile: Buffer[] = [];
        let laenge = 0;
        anfrage.on("data", (teil: Buffer) => {
            laenge += teil.length;
            if (laenge > MAX_ANFRAGE) {
                fehler(new Abweisung(413, "Die Anfrage ist zu groß."));
                anfrage.destroy();
                return;
            }
            teile.push(teil);
        });
        anfrage.on("end", () => fertig(Buffer.concat(teile)));
        anfrage.on("error", fehler);
    });
}

function foto(roh: unknown): Buffer | null {
    if (roh === undefined || roh === null || roh === "") {
        return null;
    }
    const vorsatz = "data:image/png;base64,";
    if (typeof roh !== "string" || !roh.startsWith(vorsatz)) {
        throw new Abweisung(400, "Das Foto muss ein PNG sein.");
    }
    const daten = Buffer.from(roh.slice(vorsatz.length), "base64");
    const masse = pngMasse(daten);
    if (daten.length > MAX_FOTO || masse === null || masse.breite > 324 || masse.hoehe > 432) {
        throw new Abweisung(400, "Das Foto ist zu groß oder kein PNG.");
    }
    return daten;
}

export function erzeugeDienst(einstellung: DienstEinstellung): Server {
    const zaehler = new Map<string, { zahl: number; ab: number }>();

    function bremse(anfrage: IncomingMessage): void {
        const weiter = einstellung.hinterProxy ? String(anfrage.headers["x-forwarded-for"] ?? "").split(",").at(-1)?.trim() : "";
        const absender = weiter || anfrage.socket.remoteAddress || "?";
        const jetzt = Date.now();
        for (const [name, stand] of zaehler) {
            if (jetzt - stand.ab > FENSTER_MS) {
                zaehler.delete(name);
            }
        }
        const stand = zaehler.get(absender) ?? { zahl: 0, ab: jetzt };
        stand.zahl++;
        zaehler.set(absender, stand);
        if (stand.zahl > einstellung.grenze) {
            throw new Abweisung(429, "Zu viele Pässe in kurzer Zeit. Bitte in zehn Minuten noch einmal versuchen.");
        }
    }

    async function ausweisAus(anfrage: IncomingMessage): Promise<{ ausweis: ReturnType<typeof bereinige>; bild: Buffer | null }> {
        if (!String(anfrage.headers["content-type"] ?? "").startsWith("application/json")) {
            throw new Abweisung(415, "Erwartet wird JSON.");
        }
        let koerper: unknown;
        try {
            koerper = JSON.parse((await lies(anfrage)).toString("utf8"));
        } catch (fehler) {
            throw fehler instanceof Abweisung ? fehler : new Abweisung(400, "Die Anfrage ist kein gültiges JSON.");
        }
        const quelle = (typeof koerper === "object" && koerper !== null ? koerper : {}) as Record<string, unknown>;
        const ausweis = bereinige(quelle["ausweis"]);
        const fehlt = fehlendeAngaben(ausweis);
        if (fehlt.length > 0) {
            throw new Abweisung(400, `Es fehlt: ${fehlt.join(", ")}.`);
        }
        const fehler = strichcodeFehler(ausweis.strichcodeArt, strichcodeInhalt(ausweis));
        if (fehler !== null) {
            throw new Abweisung(400, fehler);
        }
        return { ausweis, bild: foto(quelle["foto"]) };
    }

    function json(antwort: ServerResponse, status: number, inhalt: unknown): void {
        antwort.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        antwort.end(JSON.stringify(inhalt));
    }

    function datei(pfad: string, antwort: ServerResponse, nurKopf: boolean): void {
        const wurzel = normalize(einstellung.web);
        let ziel = normalize(join(wurzel, decodeURIComponent(pfad)));
        if (ziel !== wurzel && !ziel.startsWith(wurzel + sep)) {
            throw new Abweisung(404, "Nicht gefunden.");
        }
        if (existsSync(ziel) && statSync(ziel).isDirectory()) {
            ziel = join(ziel, "index.html");
        }
        if (!existsSync(ziel) || !statSync(ziel).isFile()) {
            throw new Abweisung(404, "Nicht gefunden.");
        }
        // Dateien unter assets/ tragen einen Inhalts-Hash im Namen.
        const dauerhaft = ziel.includes(`${sep}assets${sep}`);
        antwort.writeHead(200, {
            "Content-Type": ARTEN[extname(ziel)] ?? "application/octet-stream",
            "Content-Length": statSync(ziel).size,
            "Cache-Control": dauerhaft ? "public, max-age=31536000, immutable" : "no-cache"
        });
        if (nurKopf) {
            antwort.end();
        } else {
            createReadStream(ziel).pipe(antwort);
        }
    }

    async function behandle(anfrage: IncomingMessage, antwort: ServerResponse): Promise<void> {
        const pfad = new URL(anfrage.url ?? "/", "http://dienst").pathname;
        for (const [name, wert] of Object.entries(SICHERHEIT)) {
            antwort.setHeader(name, wert);
        }
        const ursprung = anfrage.headers.origin;
        if (pfad.startsWith("/wallet/") && ursprung && einstellung.urspruenge.includes(ursprung)) {
            antwort.setHeader("Access-Control-Allow-Origin", ursprung);
            antwort.setHeader("Access-Control-Allow-Headers", "Content-Type");
            antwort.setHeader("Vary", "Origin");
            if (anfrage.method === "OPTIONS") {
                antwort.writeHead(204).end();
                return;
            }
        }
        if (pfad === "/gesundheit") {
            json(antwort, 200, { ok: true });
        } else if (pfad.startsWith("/marke/") && (anfrage.method === "GET" || anfrage.method === "HEAD")) {
            const bild = pfad === "/marke/emblem.png" ? einstellung.emblem : pfad === "/marke/logo.png" ? einstellung.logo : undefined;
            if (!bild) {
                throw new Abweisung(404, "Nicht gefunden.");
            }
            antwort.writeHead(200, { "Content-Type": "image/png", "Content-Length": bild.length, "Cache-Control": "public, max-age=86400" });
            antwort.end(anfrage.method === "HEAD" ? undefined : bild);
        } else if (pfad === "/wallet/stand" && anfrage.method === "GET") {
            json(antwort, 200, { apple: Boolean(einstellung.apple), google: Boolean(einstellung.google) });
        } else if (pfad === "/wallet/apple" && anfrage.method === "POST") {
            if (!einstellung.apple) {
                throw new Abweisung(503, "Apple Wallet ist auf diesem Server nicht eingerichtet.");
            }
            bremse(anfrage);
            const { ausweis, bild } = await ausweisAus(anfrage);
            let pass: Buffer;
            try {
                pass = applePass(ausweis, bild, einstellung.apple);
            } catch (fehler) {
                // Unlesbares Foto oder zu langer Strichcode: Das liegt an der Anfrage, nicht am Dienst.
                const eigener = fehler instanceof Error && /PNG|Strichcode/.test(fehler.message);
                throw eigener ? new Abweisung(400, (fehler as Error).message) : fehler;
            }
            antwort.writeHead(200, {
                "Content-Type": "application/vnd.apple.pkpass",
                "Content-Disposition": 'attachment; filename="dienstausweis.pkpass"',
                "Content-Length": pass.length,
                "Cache-Control": "no-store"
            });
            antwort.end(pass);
        } else if (pfad === "/wallet/google" && anfrage.method === "POST") {
            if (!einstellung.google) {
                throw new Abweisung(503, "Google Wallet ist auf diesem Server nicht eingerichtet.");
            }
            bremse(anfrage);
            const { ausweis } = await ausweisAus(anfrage);
            let url: string;
            try {
                url = googleLink(ausweis, einstellung.google);
            } catch {
                throw new Abweisung(400, "Der Ausweis trägt zu viele Berechtigungen für Google Wallet. Bitte einige abwählen.");
            }
            json(antwort, 200, { url });
        } else if (pfad.startsWith("/wallet/")) {
            throw new Abweisung(404, "Nicht gefunden.");
        } else if (anfrage.method === "GET" || anfrage.method === "HEAD") {
            datei(pfad, antwort, anfrage.method === "HEAD");
        } else {
            throw new Abweisung(405, "Nicht erlaubt.");
        }
    }

    return createServer((anfrage, antwort) => {
        behandle(anfrage, antwort).catch((fehler: unknown) => {
            const status = fehler instanceof Abweisung ? fehler.status : 500;
            if (status === 500) {
                // Nur die Art des Fehlers, nie der Inhalt der Anfrage.
                console.error("Fehler:", fehler instanceof Error ? fehler.message : String(fehler));
            }
            if (antwort.headersSent) {
                antwort.destroy();
                return;
            }
            json(antwort, status, { fehler: fehler instanceof Abweisung ? fehler.message : "Der Pass konnte nicht erstellt werden." });
        });
    });
}
