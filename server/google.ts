import { createSign, randomUUID } from "node:crypto";
import { berechtigungenAnzeige, datumDeutsch, strichcodeInhalt, vollerName, type Ausweis } from "../src/daten.js";

// Google Wallet: ein „Generic Pass“ als signiertes JWT in einem Speichern-Link.
// Der Dienst ruft Google nicht selbst auf; erst das Gerät des Nutzers übergibt
// den Link an Google Wallet.

export interface GoogleEinstellung {
    /** Issuer ID aus der Google Pay & Wallet Console */
    aussteller: string;
    /** Kennung der Passklasse ohne Issuer ID; die Klasse wird einmal in der Console angelegt. */
    klasse: string;
    /** client_email des Dienstkontos */
    konto: string;
    /** private_key des Dienstkontos, PEM */
    schluessel: string;
    /** Adressen, von denen der Speichern-Link aufgerufen wird, z. B. https://dienstausweis.app */
    urspruenge: string[];
}

function sprachtext(wert: string): { defaultValue: { language: string; value: string } } {
    return { defaultValue: { language: "de", value: wert } };
}

export function googleObjekt(ausweis: Ausweis, einstellung: GoogleEinstellung, kennung: string): Record<string, unknown> {
    const inhalt = strichcodeInhalt(ausweis);
    // Kurzzeichen statt ausgeschriebener Namen: Der ganze Pass steckt im Link, und der soll kurz bleiben.
    const berechtigungen = berechtigungenAnzeige(ausweis)
        .map(eintrag => eintrag.bis ? `${eintrag.kurz} (bis ${datumDeutsch(eintrag.bis)})` : eintrag.kurz)
        .join(", ");
    const module = ([
        ["nummer", "Ausweis-Nr.", ausweis.nummer],
        ["geburtsdatum", "Geburtsdatum", datumDeutsch(ausweis.geburtsdatum)],
        ["gueltig", "Gültig bis", datumDeutsch(ausweis.gueltigBis)],
        ["berechtigungen", "Berechtigungen", berechtigungen]
    ] as const).filter(([, , body]) => body !== "").map(([id, header, body]) => ({ id, header, body }));
    return {
        id: `${einstellung.aussteller}.${kennung}`,
        classId: `${einstellung.aussteller}.${einstellung.klasse}`,
        state: "ACTIVE",
        hexBackgroundColor: "#12275e",
        cardTitle: sprachtext("THW-Ausweis"),
        header: sprachtext(vollerName(ausweis) || ausweis.nummer),
        ...(ausweis.dienststelle ? { subheader: sprachtext(ausweis.dienststelle) } : {}),
        barcode: {
            type: ausweis.strichcodeArt === "code128" ? "CODE_128" : "CODE_39",
            value: inhalt,
            alternateText: inhalt
        },
        textModulesData: module,
        ...(ausweis.gueltigBis ? { validTimeInterval: { end: { date: `${ausweis.gueltigBis}T23:59:59+01:00` } } } : {})
    };
}

function b64(wert: string | Buffer): string {
    return Buffer.from(wert).toString("base64url");
}

/** Längere Links schneiden manche Browser ab; Google nennt 1800 Zeichen als sichere Länge. */
export const MAX_LINK = 4000;

/**
 * Der Link „In Google Wallet speichern“.
 * @throws wenn der Ausweis zu viel Text für einen Link trägt
 */
export function googleLink(ausweis: Ausweis, einstellung: GoogleEinstellung, jetzt = new Date()): string {
    const anspruch = {
        iss: einstellung.konto,
        aud: "google",
        typ: "savetowallet",
        iat: Math.floor(jetzt.getTime() / 1000),
        origins: einstellung.urspruenge,
        payload: { genericObjects: [googleObjekt(ausweis, einstellung, randomUUID())] }
    };
    const unsigniert = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify(anspruch))}`;
    const signatur = createSign("RSA-SHA256").update(unsigniert).sign(einstellung.schluessel);
    const link = `https://pay.google.com/gp/v/save/${unsigniert}.${b64(signatur)}`;
    if (link.length > MAX_LINK) {
        throw new Error("zu lang");
    }
    return link;
}
