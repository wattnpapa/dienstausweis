import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppleEinstellung } from "./apple.js";
import { erzeugeDienst } from "./dienst.js";
import type { GoogleEinstellung } from "./google.js";

// Liest die Einstellungen aus der Umgebung (siehe .env.beispiel) und startet
// den Dienst. Schlüssel und Zertifikate liegen als Dateien außerhalb des Bildes.

const umgebung = process.env;

function wert(name: string): string {
    return (umgebung[name] ?? "").trim();
}

function datei(name: string): string {
    const pfad = wert(name);
    if (!existsSync(pfad)) {
        throw new Error(`${name}: Datei „${pfad}“ fehlt.`);
    }
    return readFileSync(pfad, "utf8");
}

function apple(): AppleEinstellung | undefined {
    if (!wert("DA_APPLE_PASS_TYP")) {
        return undefined;
    }
    for (const name of ["DA_APPLE_TEAM", "DA_APPLE_ZERTIFIKAT", "DA_APPLE_SCHLUESSEL", "DA_APPLE_WWDR"]) {
        if (!wert(name)) {
            throw new Error(`${name} fehlt (DA_APPLE_PASS_TYP ist gesetzt).`);
        }
    }
    const passwort = wert("DA_APPLE_SCHLUESSEL_PASSWORT");
    return {
        passTyp: wert("DA_APPLE_PASS_TYP"),
        team: wert("DA_APPLE_TEAM"),
        organisation: wert("DA_ORGANISATION") || "Dienstausweis",
        zertifikat: datei("DA_APPLE_ZERTIFIKAT"),
        schluessel: datei("DA_APPLE_SCHLUESSEL"),
        wwdr: datei("DA_APPLE_WWDR"),
        ...(passwort ? { schluesselPasswort: passwort } : {})
    };
}

function google(): GoogleEinstellung | undefined {
    if (!wert("DA_GOOGLE_AUSSTELLER")) {
        return undefined;
    }
    if (!wert("DA_GOOGLE_DIENSTKONTO") || !wert("DA_ADRESSE")) {
        throw new Error("DA_GOOGLE_DIENSTKONTO und DA_ADRESSE gehören zu DA_GOOGLE_AUSSTELLER.");
    }
    const konto = JSON.parse(datei("DA_GOOGLE_DIENSTKONTO")) as { client_email?: string; private_key?: string };
    if (!konto.client_email || !konto.private_key) {
        throw new Error("DA_GOOGLE_DIENSTKONTO: client_email oder private_key fehlt in der Datei.");
    }
    return {
        aussteller: wert("DA_GOOGLE_AUSSTELLER"),
        klasse: wert("DA_GOOGLE_KLASSE") || "dienstausweis",
        konto: konto.client_email,
        schluessel: konto.private_key,
        urspruenge: [wert("DA_ADRESSE"), ...liste("DA_URSPRUENGE")]
    };
}

function liste(name: string): string[] {
    return wert(name).split(",").map(eintrag => eintrag.trim()).filter(Boolean);
}

const hier = dirname(fileURLToPath(import.meta.url));
const appleEinstellung = apple();
const googleEinstellung = google();
const port = Number(wert("DA_PORT") || 8080);
const host = wert("DA_HOST") || "127.0.0.1";

erzeugeDienst({
    web: wert("DA_WEB") || join(hier, "..", "dist-web"),
    hinterProxy: wert("DA_HINTER_PROXY") === "1",
    urspruenge: liste("DA_URSPRUENGE"),
    grenze: Number(wert("DA_GRENZE") || 20),
    ...(appleEinstellung ? { apple: appleEinstellung } : {}),
    ...(googleEinstellung ? { google: googleEinstellung } : {})
}).listen(port, host, () => {
    console.log(`Dienstausweis lauscht auf ${host}:${port}`);
    console.log(`Apple Wallet: ${appleEinstellung ? "an" : "aus"}, Google Wallet: ${googleEinstellung ? "an" : "aus"}`);
});
