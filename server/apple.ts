import { createHash, randomUUID } from "node:crypto";
import forge from "node-forge";
import {
    berechtigungenAnzeige, berechtigungenText, datumDeutsch, strichcodeInhalt, vollerName, type Ausweis
} from "../src/daten.js";
import { KENNFARBE, logoBild, pngLesen, skaliert, strichcodeBild, symbol } from "./bild.js";
import { zip } from "./zip.js";

// Apple-Wallet-Pass (.pkpass): pass.json und Bilder, eine Liste ihrer
// SHA-1-Summen und darüber eine abgesetzte PKCS#7-Signatur mit dem
// Pass-Type-ID-Zertifikat.

export interface AppleEinstellung {
    /** Pass Type ID, z. B. pass.app.dienstausweis */
    passTyp: string;
    /** Team ID des Apple-Developer-Kontos */
    team: string;
    organisation: string;
    /** Pass-Type-ID-Zertifikat, PEM */
    zertifikat: string;
    /** Privater Schlüssel dazu, PEM */
    schluessel: string;
    schluesselPasswort?: string;
    /** Apple Worldwide Developer Relations (G4), PEM */
    wwdr: string;
    /** Logo und Emblem als PNG, sonst ein neutrales Symbol und nur Text. */
    marke?: Marke;
}

export interface Marke {
    /** Logo weiß auf durchsichtigem Grund */
    logo: Uint8Array;
    /** Emblem blau auf durchsichtigem Grund */
    emblem: Uint8Array;
}

export const HINWEIS = "Digitale Kopie zur eigenen Verwendung, vom Inhaber selbst erstellt. "
    + "Kein amtliches Dokument und kein Ersatz für den Dienstausweis.";

/** Mehr Felder (sekundär und zusätzlich zusammen) zeigt Wallet auf einer storeCard nicht an. */
export const STORECARD_FELDER = 4;

interface Feld {
    key: string;
    label: string;
    value: string;
}

function felder(...liste: Array<[key: string, label: string, value: string]>): Feld[] {
    return liste.filter(([, , value]) => value !== "").map(([key, label, value]) => ({ key, label, value }));
}

/** pass.json. Code 128 zeigt Wallet selbst an; Code 39 kennt es nicht, der steht dann als Bild im Pass. */
export function passJson(ausweis: Ausweis, einstellung: AppleEinstellung, seriennummer: string): Record<string, unknown> {
    const nativ = ausweis.strichcodeArt === "code128";
    const inhalt = strichcodeInhalt(ausweis);
    const kurz = berechtigungenAnzeige(ausweis).map(eintrag => eintrag.kurz).join(" · ");
    const name = felder(["name", "Name", vollerName(ausweis)]);
    const dienststelle = felder(["dienststelle", "Dienststelle", ausweis.dienststelle]);
    const geburtsdatum = felder(["geburtsdatum", "Geburtsdatum", datumDeutsch(ausweis.geburtsdatum)]);
    const gueltig = felder(["gueltig", "Gültig bis", datumDeutsch(ausweis.gueltigBis)]);
    const kopf = felder(["nummer", "Ausweis-Nr.", ausweis.nummer]);
    const rueckseite = felder(
        ["berechtigungen", "Berechtigungen", berechtigungenText(ausweis)],
        ["nummer-rueck", "Dienstausweisnummer", ausweis.nummer],
        ["hinweis", "Hinweis", HINWEIS]
    );
    const kurzzeile = felder(["kurz", "Berechtigungen", kurz]);
    // Code 128: Passart „generic“ (Name groß, Foto rechts, Strichcode von Wallet).
    // Code 39: „storeCard“, weil nur dort ein Streifenbild erlaubt ist; darin
    // stehen Foto und Strichcode. Primäre Felder lägen über dem Bild, deshalb
    // steht der Name darunter. Die storeCard zeigt unter dem Bild höchstens
    // vier Felder und verwirft weitere stillschweigend; was nicht passt, steht
    // auf der Rückseite. Die Berechtigungen gehen dem Geburtsdatum vor.
    const zeile = [...name, ...dienststelle, ...gueltig, ...kurzzeile, ...geburtsdatum];
    const aufbau = nativ
        ? { headerFields: kopf, primaryFields: name, secondaryFields: dienststelle, auxiliaryFields: [...geburtsdatum, ...gueltig, ...kurzzeile], backFields: rueckseite }
        : {
            headerFields: kopf,
            secondaryFields: zeile.slice(0, 2),
            auxiliaryFields: zeile.slice(2, STORECARD_FELDER),
            backFields: [...zeile.slice(STORECARD_FELDER).map(feld => ({ ...feld, key: `${feld.key}-rueck` })), ...rueckseite]
        };
    return {
        formatVersion: 1,
        passTypeIdentifier: einstellung.passTyp,
        teamIdentifier: einstellung.team,
        organizationName: einstellung.organisation,
        serialNumber: seriennummer,
        description: "THW-Ausweis (digitale Kopie)",
        // Neben dem Logo ist für Text kein Platz mehr.
        ...(einstellung.marke ? {} : { logoText: "THW-Ausweis" }),
        backgroundColor: `rgb(${KENNFARBE.join(", ")})`,
        foregroundColor: "rgb(255, 255, 255)",
        labelColor: "rgb(203, 207, 220)",
        sharingProhibited: true,
        ...(ausweis.gueltigBis ? { expirationDate: `${ausweis.gueltigBis}T23:59:59+01:00` } : {}),
        ...(nativ
            ? {
                generic: aufbau,
                barcodes: [{ format: "PKBarcodeFormatCode128", message: inhalt, messageEncoding: "iso-8859-1", altText: inhalt }]
            }
            : { storeCard: aufbau })
    };
}

/** Abgesetzte PKCS#7-Signatur (DER) über die Liste der Prüfsummen. */
export function signiere(manifest: Buffer, einstellung: AppleEinstellung, jetzt: Date): Buffer {
    const zertifikat = forge.pki.certificateFromPem(einstellung.zertifikat);
    const schluessel = einstellung.schluesselPasswort
        ? forge.pki.decryptRsaPrivateKey(einstellung.schluessel, einstellung.schluesselPasswort)
        : forge.pki.privateKeyFromPem(einstellung.schluessel);
    if (!schluessel) {
        throw new Error("Der private Schlüssel für Apple Wallet lässt sich nicht lesen (Passwort?).");
    }
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifest.toString("binary"));
    p7.addCertificate(zertifikat);
    p7.addCertificate(forge.pki.certificateFromPem(einstellung.wwdr));
    p7.addSigner({
        key: schluessel,
        certificate: zertifikat,
        digestAlgorithm: forge.pki.oids["sha256"] as string,
        authenticatedAttributes: [
            { type: forge.pki.oids["contentType"] as string, value: forge.pki.oids["data"] as string },
            { type: forge.pki.oids["messageDigest"] as string },
            // forge erwartet hier ein Date, die Typen kennen nur string.
            { type: forge.pki.oids["signingTime"] as string, value: jetzt as unknown as string }
        ]
    });
    p7.sign({ detached: true });
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

/**
 * Baut den fertigen Pass.
 * @param foto PNG im Seitenverhältnis 3:4, höchstens 324 × 432 Pixel
 * @throws wenn das Foto kein lesbares PNG ist oder der Strichcode nicht in den Pass passt
 */
export function applePass(ausweis: Ausweis, foto: Uint8Array | null, einstellung: AppleEinstellung, jetzt = new Date()): Buffer {
    const nativ = ausweis.strichcodeArt === "code128";
    const bild = foto === null ? null : pngLesen(foto);
    const dateien = new Map<string, Uint8Array>();
    const pass = passJson(ausweis, einstellung, randomUUID());
    dateien.set("pass.json", Buffer.from(JSON.stringify(pass), "utf8"));
    const emblem = einstellung.marke ? pngLesen(einstellung.marke.emblem) : null;
    dateien.set("icon.png", symbol(29, emblem));
    dateien.set("icon@2x.png", symbol(58, emblem));
    dateien.set("icon@3x.png", symbol(87, emblem));
    if (einstellung.marke) {
        const logo = pngLesen(einstellung.marke.logo, KENNFARBE);
        dateien.set("logo@2x.png", logoBild(logo, 100));
        dateien.set("logo@3x.png", logoBild(logo, 150));
    }
    if (nativ) {
        if (bild !== null) {
            dateien.set("thumbnail@2x.png", skaliert(bild, 180, 240).png());
        }
    } else {
        // Streifenbild: links das Foto, daneben der Strichcode. Geräte mit
        // einfacher Auflösung gibt es nicht mehr, deshalb nur @2x und @3x.
        const inhalt = strichcodeInhalt(ausweis);
        dateien.set("strip@2x.png", strichcodeBild(ausweis.strichcodeArt, inhalt, 750, 288, bild));
        dateien.set("strip@3x.png", strichcodeBild(ausweis.strichcodeArt, inhalt, 1125, 432, bild));
    }
    const summen: Record<string, string> = {};
    for (const [name, inhalt] of dateien) {
        summen[name] = createHash("sha1").update(inhalt).digest("hex");
    }
    const manifest = Buffer.from(JSON.stringify(summen), "utf8");
    dateien.set("manifest.json", manifest);
    dateien.set("signature", signiere(manifest, einstellung, jetzt));
    return zip(dateien);
}
