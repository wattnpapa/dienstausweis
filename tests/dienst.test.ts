import { execFileSync } from "node:child_process";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applePass, passJson } from "../server/apple.js";
import { Bild, KENNFARBE, pngLesen, pngMasse, strichcodeBild, symbol, WEISS, zugeschnitten } from "../server/bild.js";
import { erzeugeDienst } from "../server/dienst.js";
import { googleObjekt } from "../server/google.js";
import { bereinige } from "../src/daten.js";
import { strichcodeModule } from "../src/strichcode.js";

// Der Dienst gegen ein selbst ausgestelltes Prüfzertifikat. Ob Apple und Google
// die Pässe annehmen, zeigt erst ein echtes Konto; hier wird geprüft, dass
// Aufbau, Prüfsummen und Signaturen stimmen.

const ordner = mkdtempSync(join(tmpdir(), "da-test-"));
const pfad = (name: string): string => join(ordner, name);

function openssl(...argumente: string[]): Buffer {
    return execFileSync("openssl", argumente, { stdio: ["ignore", "pipe", "pipe"] });
}

/** Liest ein ungepacktes ZIP über das Verzeichnis am Ende. */
function entpacke(archiv: Buffer): Map<string, Buffer> {
    const dateien = new Map<string, Buffer>();
    const ende = archiv.length - 22;
    expect(archiv.readUInt32LE(ende)).toBe(0x06054b50);
    let stelle = archiv.readUInt32LE(ende + 16);
    for (let nr = 0; nr < archiv.readUInt16LE(ende + 10); nr++) {
        expect(archiv.readUInt32LE(stelle)).toBe(0x02014b50);
        const groesse = archiv.readUInt32LE(stelle + 24);
        const namenLaenge = archiv.readUInt16LE(stelle + 28);
        const kopf = archiv.readUInt32LE(stelle + 42);
        const name = archiv.toString("utf8", stelle + 46, stelle + 46 + namenLaenge);
        expect(archiv.readUInt32LE(kopf)).toBe(0x04034b50);
        const anfang = kopf + 30 + archiv.readUInt16LE(kopf + 26) + archiv.readUInt16LE(kopf + 28);
        dateien.set(name, archiv.subarray(anfang, anfang + groesse));
        stelle += 46 + namenLaenge;
    }
    return dateien;
}

const AUSWEIS = {
    nummer: "12345678", vorname: "Erika", nachname: "Mustermann", dienststelle: "OV Musterstadt",
    geburtsdatum: "1990-04-12", gueltigBis: "2031-06-30", strichcodeArt: "code128",
    berechtigungen: [{ id: "fe-ce", bis: "2029-01-01" }, { id: "agt" }]
};

let adresse = "";
let google: ReturnType<typeof generateKeyPairSync>;
const dienste: Array<ReturnType<typeof erzeugeDienst>> = [];

function starte(einstellung: Parameters<typeof erzeugeDienst>[0]): Promise<string> {
    const dienst = erzeugeDienst(einstellung);
    dienste.push(dienst);
    return new Promise(fertig => dienst.listen(0, "127.0.0.1", () => fertig(`http://127.0.0.1:${(dienst.address() as AddressInfo).port}`)));
}

function sende(ziel: string, koerper: unknown): Promise<Response> {
    return fetch(ziel, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(koerper) });
}

beforeAll(async () => {
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=Pruef-WWDR",
        "-keyout", pfad("wwdr.key"), "-out", pfad("wwdr.pem"));
    openssl("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=Pass Type ID: pass.test/OU=TEAM123456",
        "-keyout", pfad("pass.key"), "-out", pfad("pass.csr"));
    openssl("x509", "-req", "-in", pfad("pass.csr"), "-CA", pfad("wwdr.pem"), "-CAkey", pfad("wwdr.key"),
        "-CAcreateserial", "-days", "2", "-out", pfad("pass.pem"));
    writeFileSync(pfad("index.html"), "<!doctype html><title>App</title>");
    google = generateKeyPairSync("rsa", { modulusLength: 2048 });
    adresse = await starte({
        web: ordner, hinterProxy: false, urspruenge: ["https://anderswo.example"], grenze: 50,
        apple: {
            passTyp: "pass.test", team: "TEAM123456", organisation: "Prüfung",
            zertifikat: readFileSync(pfad("pass.pem"), "utf8"), schluessel: readFileSync(pfad("pass.key"), "utf8"),
            wwdr: readFileSync(pfad("wwdr.pem"), "utf8")
        },
        google: {
            aussteller: "3388000000012345678", klasse: "dienstausweis", konto: "pass@projekt.iam.gserviceaccount.com",
            schluessel: google.privateKey.export({ type: "pkcs8", format: "pem" }) as string,
            urspruenge: ["https://dienstausweis.example"]
        }
    });
});

afterAll(() => {
    for (const dienst of dienste) {
        dienst.close();
    }
});

describe("Bilder", () => {
    it("schreibt ein PNG, das sich zurücklesen lässt", () => {
        const png = strichcodeBild("code39", "12345678", 750, 288);
        expect(pngMasse(png)).toEqual({ breite: 750, hoehe: 288 });
        // Mittlere Pixelzeile aus dem IDAT-Block holen und die Striche zurückrechnen.
        const laenge = png.readUInt32BE(33);
        const zeilen = inflateSync(png.subarray(41, 41 + laenge));
        const zeile = zeilen.subarray(144 * (750 * 3 + 1) + 1, 145 * (750 * 3 + 1));
        let punkte = "";
        for (let x = 0; x < 750; x++) {
            punkte += zeile[x * 3] === 0 ? "1" : "0";
        }
        const striche = punkte.replace(/^0+|0+$/g, "");
        const module = strichcodeModule("code39", "12345678");
        const modul = striche.length / module.length;
        expect(Number.isInteger(modul)).toBe(true);
        expect(striche).toBe([...module].map(zeichen => zeichen.repeat(modul)).join(""));
        // Ruhezone: mindestens zehn Module links und rechts.
        expect(punkte.indexOf("1")).toBeGreaterThanOrEqual(10 * modul);
    });

    it("liest ein eigenes PNG wieder ein und setzt das Foto neben den Strichcode", () => {
        const foto = new Bild(30, 40, [200, 100, 50]);
        foto.rechteck(0, 0, 15, 40, [10, 20, 30]);
        const gelesen = pngLesen(foto.png());
        expect([...gelesen.pixel]).toEqual([...foto.pixel]);

        const streifen = pngLesen(strichcodeBild("code39", "01234567-01", 750, 288, gelesen));
        const punkt = (x: number, y: number): number[] => [...streifen.pixel.subarray((y * 750 + x) * 3, (y * 750 + x) * 3 + 3)];
        // Foto 216 Pixel breit über die volle Höhe, rechts davon weiß bis zum ersten Strich.
        expect(punkt(50, 144)).toEqual([10, 20, 30]);
        expect(punkt(200, 280)).toEqual([200, 100, 50]);
        expect(punkt(217, 144)).toEqual([255, 255, 255]);
        let zeile = "";
        for (let x = 216; x < 750; x++) {
            zeile += punkt(x, 144)[0] === 0 ? "1" : "0";
        }
        const module = strichcodeModule("code39", "01234567-01");
        expect(zeile.replace(/^0+|0+$/g, "")).toBe([...module].map(zeichen => zeichen.repeat(2)).join(""));
        expect(zeile.indexOf("1")).toBeGreaterThanOrEqual(20);
    });

    it("weist PNG ab, die kein Browser so schreibt", () => {
        const png = new Bild(4, 4, WEISS).png();
        png[28] = 1; // Zeilensprung
        expect(() => pngLesen(png)).toThrow();
        expect(() => pngLesen(new Uint8Array(40))).toThrow();
    });

    it("lehnt einen Strichcode ab, der nicht in das Bild passt", () => {
        expect(() => strichcodeBild("code39", "A".repeat(40), 375, 144)).toThrow();
    });
});

describe("Apple Wallet", () => {
    async function pass(ausweis: unknown, foto?: string): Promise<Map<string, Buffer>> {
        const antwort = await sende(`${adresse}/wallet/apple`, { ausweis, foto });
        expect(antwort.status).toBe(200);
        expect(antwort.headers.get("content-type")).toBe("application/vnd.apple.pkpass");
        const archiv = Buffer.from(await antwort.arrayBuffer());
        writeFileSync(pfad("pass.zip"), archiv);
        // Auch ein fremdes Programm muss das Archiv lesen können.
        expect(execFileSync("python3", ["-c", "import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).testzip())", pfad("pass.zip")]).toString().trim()).toBe("None");
        return entpacke(archiv);
    }

    it("liefert einen Pass, dessen Signatur OpenSSL gegen das Zertifikat bestätigt", async () => {
        const foto = `data:image/png;base64,${new Bild(324, 432, WEISS).png().toString("base64")}`;
        const dateien = await pass(AUSWEIS, foto);
        expect(pngMasse(dateien.get("thumbnail@2x.png") as Buffer)).toEqual({ breite: 180, hoehe: 240 });
        expect([...dateien.keys()].sort()).toEqual(
            ["icon.png", "icon@2x.png", "icon@3x.png", "manifest.json", "pass.json", "signature", "thumbnail@2x.png"]);
        writeFileSync(pfad("manifest.json"), dateien.get("manifest.json") as Buffer);
        writeFileSync(pfad("signature"), dateien.get("signature") as Buffer);
        const geprueft = openssl("smime", "-verify", "-binary", "-inform", "DER", "-in", pfad("signature"),
            "-content", pfad("manifest.json"), "-CAfile", pfad("wwdr.pem"), "-purpose", "any");
        expect(geprueft.equals(dateien.get("manifest.json") as Buffer)).toBe(true);

        const summen = JSON.parse((dateien.get("manifest.json") as Buffer).toString()) as Record<string, string>;
        expect(Object.keys(summen).sort()).toEqual([...dateien.keys()].filter(name => name !== "manifest.json" && name !== "signature").sort());
        for (const [name, summe] of Object.entries(summen)) {
            writeFileSync(pfad("teil"), dateien.get(name) as Buffer);
            expect(openssl("dgst", "-sha1", "-r", pfad("teil")).toString().split(" ")[0]).toBe(summe);
        }

        const json = JSON.parse((dateien.get("pass.json") as Buffer).toString());
        expect(json.passTypeIdentifier).toBe("pass.test");
        expect(json.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatCode128", message: "12345678" });
        expect(json.generic.primaryFields[0].value).toBe("Erika Mustermann");
        expect(json.generic.backFields[0].value).toBe("Klasse CE (bis 01.01.2029)\nAtemschutzgeräteträger");
        expect(json.expirationDate).toBe("2031-06-30T23:59:59+01:00");
    });

    it("legt Code 39 als Bild in den Pass, weil Wallet ihn nicht selbst zeichnet", async () => {
        const foto = `data:image/png;base64,${new Bild(324, 432, [90, 90, 90]).png().toString("base64")}`;
        const dateien = await pass({ ...AUSWEIS, strichcodeArt: "code39" }, foto);
        // Das Foto steht links im Streifen.
        expect([...pngLesen(dateien.get("strip@3x.png") as Buffer).pixel.subarray(0, 3)]).toEqual([90, 90, 90]);
        expect(dateien.has("strip@2x.png")).toBe(true);
        expect(dateien.has("strip@3x.png")).toBe(true);
        expect(dateien.has("thumbnail@2x.png")).toBe(false);
        const json = JSON.parse((dateien.get("pass.json") as Buffer).toString());
        expect(json.barcodes).toBeUndefined();
        expect(json.storeCard.secondaryFields[0].value).toBe("Erika Mustermann");
        // Wallet setzt alle Felder unter dem Streifen in eine Zeile; vorne nur Name und Gültigkeit.
        const vorne = [...json.storeCard.secondaryFields, ...json.storeCard.auxiliaryFields];
        expect(vorne.map((feld: { key: string }) => feld.key)).toEqual(["name", "gueltig"]);
        const hinten = json.storeCard.backFields.map((feld: { key: string }) => feld.key);
        expect(hinten).toEqual(expect.arrayContaining(["dienststelle-rueck", "geburtsdatum-rueck", "berechtigungen"]));
    });

    it("weist unvollständige Ausweise, fremde Bilder und zu große Anfragen ab", async () => {
        expect((await sende(`${adresse}/wallet/apple`, { ausweis: { nummer: "1" } })).status).toBe(400);
        expect((await sende(`${adresse}/wallet/apple`, { ausweis: { ...AUSWEIS, strichcodeArt: "code39", nummer: "ä1" } })).status).toBe(400);
        expect((await sende(`${adresse}/wallet/apple`, { ausweis: AUSWEIS, foto: "data:image/png;base64,AAAA" })).status).toBe(400);
        const gross = `data:image/png;base64,${new Bild(400, 400, WEISS).png().toString("base64")}`;
        expect((await sende(`${adresse}/wallet/apple`, { ausweis: AUSWEIS, foto: gross })).status).toBe(400);
        const riesig = await sende(`${adresse}/wallet/apple`, { ausweis: AUSWEIS, x: "x".repeat(1_000_000) }).then(a => a.status, () => 413);
        expect(riesig).toBe(413);
        const antwort = await fetch(`${adresse}/wallet/apple`, { method: "POST", body: "x" });
        expect(antwort.status).toBe(415);
    });
});

describe("Google Wallet", () => {
    it("liefert einen Speichern-Link mit gültig signiertem JWT", async () => {
        const antwort = await sende(`${adresse}/wallet/google`, { ausweis: { ...AUSWEIS, strichcodeArt: "code39" } });
        expect(antwort.status).toBe(200);
        const { url } = await antwort.json() as { url: string };
        expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
        const [kopf, anspruch, signatur] = url.slice("https://pay.google.com/gp/v/save/".length).split(".") as [string, string, string];
        expect(createVerify("RSA-SHA256").update(`${kopf}.${anspruch}`).verify(google.publicKey, signatur, "base64url")).toBe(true);
        const inhalt = JSON.parse(Buffer.from(anspruch, "base64url").toString());
        expect(inhalt).toMatchObject({ iss: "pass@projekt.iam.gserviceaccount.com", aud: "google", typ: "savetowallet", origins: ["https://dienstausweis.example"] });
        const objekt = inhalt.payload.genericObjects[0];
        expect(objekt.classId).toBe("3388000000012345678.dienstausweis");
        expect(objekt.barcode).toEqual({ type: "CODE_39", value: "12345678", alternateText: "12345678" });
        expect(objekt.header.defaultValue.value).toBe("Erika Mustermann");
        expect(inhalt.payload.genericObjects[0].textModulesData.at(-1).body).toBe("CE (bis 01.01.2029), AGT");
        // Google nennt 1800 Zeichen als sichere Länge für den Link.
        expect(url.length).toBeLessThan(1800);
    });

    it("weist einen Ausweis ab, dessen Link zu lang würde", async () => {
        const viele = Array.from({ length: 40 }, (_, nr) => ({ name: `Eigene Berechtigung Nummer ${nr} mit langem Namen`, bis: "2030-01-01" }));
        const antwort = await sende(`${adresse}/wallet/google`, { ausweis: { ...AUSWEIS, berechtigungen: viele } });
        expect(antwort.status).toBe(400);
        expect((await antwort.json() as { fehler: string }).fehler).toContain("zu viele Berechtigungen");
    });
});

describe("Dienst", () => {
    it("meldet, was eingerichtet ist, und liefert die App aus", async () => {
        expect(await (await fetch(`${adresse}/wallet/stand`)).json()).toEqual({ apple: true, google: true });
        expect(await (await fetch(`${adresse}/gesundheit`)).json()).toEqual({ ok: true });
        const seite = await fetch(`${adresse}/`);
        expect(await seite.text()).toContain("<title>App</title>");
        expect(seite.headers.get("content-security-policy")).toContain("default-src 'self'");
    });

    it("gibt nichts außerhalb des App-Ordners heraus", async () => {
        expect((await fetch(`${adresse}/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
        expect((await fetch(`${adresse}/gibt-es-nicht.js`)).status).toBe(404);
    });

    it("lässt nur eingetragene fremde Adressen zu", async () => {
        const erlaubt = await fetch(`${adresse}/wallet/stand`, { headers: { Origin: "https://anderswo.example" } });
        expect(erlaubt.headers.get("access-control-allow-origin")).toBe("https://anderswo.example");
        const fremd = await fetch(`${adresse}/wallet/stand`, { headers: { Origin: "https://boese.example" } });
        expect(fremd.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("sagt ohne Schlüssel, dass Wallet nicht eingerichtet ist, und bremst zu viele Anfragen", async () => {
        const ohne = await starte({ web: ordner, hinterProxy: false, urspruenge: [], grenze: 2 });
        expect(await (await fetch(`${ohne}/wallet/stand`)).json()).toEqual({ apple: false, google: false });
        expect((await sende(`${ohne}/wallet/apple`, { ausweis: AUSWEIS })).status).toBe(503);

        const knapp = await starte({ web: ordner, hinterProxy: false, urspruenge: [], grenze: 2,
            google: { aussteller: "1", klasse: "k", konto: "a@b", schluessel: google.privateKey.export({ type: "pkcs8", format: "pem" }) as string, urspruenge: [] } });
        const folge = [];
        for (let nr = 0; nr < 3; nr++) {
            folge.push((await sende(`${knapp}/wallet/google`, { ausweis: AUSWEIS })).status);
        }
        expect(folge).toEqual([200, 200, 429]);
    });
});

describe("Logo und Emblem", () => {
    // Ersatzbilder: Die echten Zeichen liegen nicht im Repository.
    const logo = new Bild(300, 100, WEISS).png();
    const emblemGross = new Bild(200, 200, WEISS);
    emblemGross.rechteck(50, 60, 100, 80, KENNFARBE);
    const emblem = emblemGross.png();

    it("setzt Logo und Emblem in den Apple-Pass und lässt den Text neben dem Logo weg", () => {
        const einstellung = {
            passTyp: "pass.test", team: "TEAM123456", organisation: "Prüfung",
            zertifikat: readFileSync(pfad("pass.pem"), "utf8"), schluessel: readFileSync(pfad("pass.key"), "utf8"),
            wwdr: readFileSync(pfad("wwdr.pem"), "utf8"), marke: { logo, emblem }
        };
        const ausweis = bereinige(AUSWEIS);
        const dateien = entpacke(applePass(ausweis, null, einstellung));
        expect(pngMasse(dateien.get("logo@2x.png")!)).toEqual({ breite: 300, hoehe: 100 });
        expect(pngMasse(dateien.get("logo@3x.png")!)).toEqual({ breite: 450, hoehe: 150 });
        // Durchsichtig (RGBA), weil Wallet über die Hintergrundfarbe einen Verlauf legt.
        expect(dateien.get("logo@2x.png")![25]).toBe(6);
        const json = passJson(ausweis, einstellung, "x");
        expect(json["logoText"]).toBeUndefined();
        expect(json["backgroundColor"]).toBe("rgb(0, 56, 123)");
        const { marke: _, ...ohneMarke } = einstellung;
        expect(passJson(ausweis, ohneMarke, "x")["logoText"]).toBe("THW-Ausweis");
    });

    it("schneidet den Rand des Emblems ab", () => {
        const knapp = zugeschnitten(pngLesen(emblem), WEISS);
        expect([knapp.breite, knapp.hoehe]).toEqual([100, 80]);
    });

    it("gibt Google Wallet die Adresse des Emblems und liefert es aus", async () => {
        const objekt = googleObjekt(bereinige(AUSWEIS), {
            aussteller: "1", klasse: "k", konto: "k", schluessel: "", urspruenge: [], logo: "https://ausweis.example/marke/emblem.png"
        }, "x");
        expect(objekt["hexBackgroundColor"]).toBe("#00387b");
        expect(objekt["logo"]).toMatchObject({ sourceUri: { uri: "https://ausweis.example/marke/emblem.png" } });
        const png = symbol(660, pngLesen(emblem));
        const mit = await starte({ web: ordner, hinterProxy: false, urspruenge: [], grenze: 5, emblem: png });
        const antwort = await fetch(`${mit}/marke/emblem.png`);
        expect(antwort.headers.get("content-type")).toBe("image/png");
        expect(Buffer.from(await antwort.arrayBuffer())).toEqual(png);
        expect((await fetch(`${adresse}/marke/emblem.png`)).status).toBe(404);
    });
});
