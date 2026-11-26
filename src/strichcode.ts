// Strichcodes als Folge von Modulen: "1" ist ein dunkles, "0" ein helles Modul.
// Die App zeichnet daraus ein SVG, der Dienst ein PNG. Ohne Abhängigkeit, damit
// beide dieselbe Rechnung benutzen.

export type StrichcodeArt = "code39" | "code128";

export const STRICHCODE_ARTEN: readonly StrichcodeArt[] = ["code39", "code128"];

// Code 39: neun Elemente je Zeichen (Strich, Lücke, Strich, …), drei davon breit.
const CODE39: Record<string, string> = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
    "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
    A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
    F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
    K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
    P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
    U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
    Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
    $: "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn"
};

/** Breites Element in Modulen. 3:1 liest auch ein älterer Scanner vom Bildschirm sicher. */
const BREIT = 3;

// Code 128: 106 Muster zu je 11 Modulen als drei Hex-Ziffern, dazu das Stoppzeichen.
const CODE128 = "6cc66c66649848c44c4c84c446464864462459c4dc4ce5cc4ec4e667265c64e6e467476e74c72c7267647347326d86c6636518458446588468462688628"
    + "6225b858e46e5d85c647677668e62e6e86e26ee75874671676876271a77a64278a53050c4b048642c4265905844d04c24344326126507ba61447a53c4bc49e5e44f"
    + "44f27a47947926de6f67b657851e45e5e85e27a87a25de5ee75e7ae68469069c";
const CODE128_STOPP = "1100011101011";
const START_B = 104;
const START_C = 105;

function muster128(wert: number): string {
    return parseInt(CODE128.slice(wert * 3, wert * 3 + 3), 16).toString(2).padStart(11, "0");
}

/** Sagt, warum sich der Inhalt nicht kodieren lässt, oder null, wenn er passt. */
export function strichcodeFehler(art: StrichcodeArt, inhalt: string): string | null {
    if (inhalt === "") {
        return "Der Strichcode braucht einen Inhalt.";
    }
    if (inhalt.length > 40) {
        return "Der Inhalt ist zu lang für einen Strichcode (höchstens 40 Zeichen).";
    }
    if (art === "code39") {
        const fremd = [...inhalt].find(zeichen => zeichen === "*" || !(zeichen in CODE39));
        return fremd === undefined ? null : `Code 39 kennt das Zeichen „${fremd}“ nicht (erlaubt: 0–9, A–Z, Leerzeichen und - . $ / + %).`;
    }
    const fremd = [...inhalt].find(zeichen => zeichen < " " || zeichen > "~");
    return fremd === undefined ? null : `Code 128 kennt das Zeichen „${fremd}“ nicht.`;
}

function code39(inhalt: string): string {
    const zeichen = [...`*${inhalt}*`].map(z => {
        const elemente = CODE39[z] as string;
        return [...elemente].map((breite, stelle) => (stelle % 2 === 0 ? "1" : "0").repeat(breite === "w" ? BREIT : 1)).join("");
    });
    // Zwischen den Zeichen steht eine schmale Lücke.
    return zeichen.join("0");
}

function code128(inhalt: string): string {
    // Nur Ziffern in gerader Zahl: Satz C packt zwei Ziffern in ein Zeichen.
    const ziffern = /^\d+$/.test(inhalt) && inhalt.length % 2 === 0 && inhalt.length >= 4;
    const werte = ziffern
        ? (inhalt.match(/\d\d/g) as string[]).map(Number)
        : [...inhalt].map(zeichen => zeichen.charCodeAt(0) - 32);
    const start = ziffern ? START_C : START_B;
    const pruef = werte.reduce((summe, wert, stelle) => summe + wert * (stelle + 1), start) % 103;
    return [start, ...werte, pruef].map(muster128).join("") + CODE128_STOPP;
}

/**
 * Module des Strichcodes ohne Ruhezone.
 * @throws wenn der Inhalt Zeichen enthält, die die Art nicht kennt
 */
export function strichcodeModule(art: StrichcodeArt, inhalt: string): string {
    const fehler = strichcodeFehler(art, inhalt);
    if (fehler !== null) {
        throw new Error(fehler);
    }
    return art === "code39" ? code39(inhalt) : code128(inhalt);
}

/** Module als Läufe gleicher Farbe: [dunkel, hell, dunkel, …], immer mit dunkel beginnend. */
export function strichcodeLaeufe(module: string): number[] {
    return (module.match(/1+|0+/g) ?? []).map(lauf => lauf.length);
}

/** Ruhezone links und rechts in Modulen; beide Arten verlangen mindestens zehn. */
export const RUHEZONE = 10;
