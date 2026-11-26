import JsBarcode from "jsbarcode";
import { describe, expect, it } from "vitest";
import { strichcodeFehler, strichcodeLaeufe, strichcodeModule } from "../src/strichcode.js";

/** Module, wie JsBarcode sie rechnet: Vergleich gegen eine zweite, unabhängige Umsetzung. */
function fremd(format: "CODE39" | "CODE128B" | "CODE128C", inhalt: string): string {
    const ziel: { encodings?: Array<{ data: string }> } = {};
    JsBarcode(ziel, inhalt, { format });
    // JsBarcode hängt bei Code 39 hinter das letzte Zeichen noch eine Lücke.
    return (ziel.encodings ?? []).map(teil => teil.data).join("").replace(/0+$/, "");
}

/** Läufe auf schmal (1) und breit (2) bringen: JsBarcode zeichnet Code 39 im Verhältnis 2:1, wir 3:1. */
function schmalBreit(module: string): string {
    return strichcodeLaeufe(module).map(lauf => lauf === 1 ? "n" : "w").join("");
}

describe("Code 39", () => {
    it.each(["12345678", "THW-OV 0815", "A.B/C+D%E$", "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"])("kodiert „%s“ wie JsBarcode", inhalt => {
        expect(schmalBreit(strichcodeModule("code39", inhalt))).toBe(schmalBreit(fremd("CODE39", inhalt)));
    });

    it("zeichnet breite Elemente dreimal so breit wie schmale", () => {
        // Ein Zeichen: 6 schmale und 3 breite Elemente = 15 Module, dazu die Lücke.
        expect(strichcodeModule("code39", "1")).toHaveLength(3 * 15 + 2);
    });

    it("weist Kleinbuchstaben und den Stern ab", () => {
        expect(strichcodeFehler("code39", "abc")).toContain("„a“");
        expect(strichcodeFehler("code39", "1*2")).toContain("„*“");
        expect(() => strichcodeModule("code39", "ä")).toThrow();
    });
});

describe("Code 128", () => {
    it.each(["12345678", "1234567", "123", "THW-OV 0815", "Abc~xyz 12", "00"])("kodiert „%s“ wie JsBarcode", inhalt => {
        // JsBarcode wechselt im Automatikbetrieb mitten im Text den Satz; wir bleiben bei einem.
        const satz = /^\d+$/.test(inhalt) && inhalt.length % 2 === 0 && inhalt.length >= 4 ? "CODE128C" : "CODE128B";
        expect(strichcodeModule("code128", inhalt)).toBe(fremd(satz, inhalt));
    });

    it("nimmt für gerade Ziffernfolgen den dichten Satz C", () => {
        // Start, vier Zeichen, Prüfzeichen zu je 11 Modulen, Stopp mit 13.
        expect(strichcodeModule("code128", "12345678")).toHaveLength(6 * 11 + 13);
    });

    it("weist Umlaute ab", () => {
        expect(strichcodeFehler("code128", "Müller")).toContain("„ü“");
    });
});

describe("Grenzen", () => {
    it("verlangt einen Inhalt und begrenzt die Länge", () => {
        expect(strichcodeFehler("code39", "")).not.toBeNull();
        expect(strichcodeFehler("code128", "1".repeat(41))).not.toBeNull();
        expect(strichcodeFehler("code128", "1".repeat(40))).toBeNull();
    });
});
