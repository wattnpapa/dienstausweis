import { describe, expect, it } from "vitest";
import { KATALOG } from "../src/berechtigungen.js";
import { abgelaufen, berechtigungenAnzeige, berechtigungenText, bereinige, datumDeutsch, fehlendeAngaben, strichcodeInhalt } from "../src/daten.js";

describe("bereinige", () => {
    it("macht aus Unsinn einen leeren Ausweis", () => {
        for (const roh of [null, 42, "x", [], { nummer: 7, berechtigungen: "nein" }]) {
            const ausweis = bereinige(roh);
            expect(ausweis.nummer).toBe("");
            expect(ausweis.berechtigungen).toEqual([]);
            expect(ausweis.strichcodeArt).toBe("code128");
        }
    });

    it("kürzt Texte, verwirft ungültige Daten und Steuerzeichen", () => {
        const ausweis = bereinige({
            nummer: "  12345678  ", vorname: "A\u0000B", nachname: "x".repeat(200),
            geburtsdatum: "1990-02-31", gueltigBis: "2030-12-31", strichcodeArt: "qr"
        });
        expect(ausweis.nummer).toBe("12345678");
        expect(ausweis.vorname).toBe("A B");
        expect(ausweis.nachname).toHaveLength(60);
        expect(ausweis.geburtsdatum).toBe("");
        expect(ausweis.gueltigBis).toBe("2030-12-31");
        expect(ausweis.strichcodeArt).toBe("code128");
    });

    it("behält bekannte, unbekannte und eigene Berechtigungen, aber keine doppelten", () => {
        const ausweis = bereinige({
            berechtigungen: [
                { id: "agt", bis: "2027-05-01" }, { id: "agt" }, { id: "kommt-spaeter" }, { id: "Böse<script>" },
                { name: "Drohnenpilot" }, { name: "Drohnenpilot" }, { name: "" }, null
            ]
        });
        expect(ausweis.berechtigungen).toEqual([
            { id: "agt", bis: "2027-05-01" }, { id: "kommt-spaeter" }, { id: "", name: "Drohnenpilot" }
        ]);
    });
});

describe("Anzeige", () => {
    const ausweis = bereinige({
        nummer: "4711", berechtigungen: [{ id: "fe-ce", bis: "2028-01-15" }, { id: "agt" }, { name: "Drohnenpilot" }]
    });

    it("nennt Kurzzeichen und Namen", () => {
        expect(berechtigungenAnzeige(ausweis).map(eintrag => eintrag.kurz)).toEqual(["CE", "AGT", "Drohnenpilot"]);
        expect(berechtigungenText(ausweis)).toBe("Klasse CE (bis 15.01.2028)\nAtemschutzgeräteträger\nDrohnenpilot");
    });

    it("nimmt die Nummer als Strichcode, solange kein eigener Inhalt gesetzt ist", () => {
        expect(strichcodeInhalt(ausweis)).toBe("4711");
        expect(strichcodeInhalt({ ...ausweis, strichcodeInhalt: "THW4711" })).toBe("THW4711");
    });

    it("rechnet Daten", () => {
        expect(datumDeutsch("2030-12-31")).toBe("31.12.2030");
        expect(abgelaufen("2024-01-01", "2024-01-02")).toBe(true);
        expect(abgelaufen("2024-01-02", "2024-01-02")).toBe(false);
        expect(abgelaufen("", "2024-01-02")).toBe(false);
    });

    it("meldet fehlende Angaben", () => {
        expect(fehlendeAngaben(bereinige({}))).toEqual(["Dienstausweisnummer", "Name"]);
        expect(fehlendeAngaben(bereinige({ nummer: "1", nachname: "Muster" }))).toEqual([]);
    });
});

describe("Katalog", () => {
    it("hat eindeutige ids in der erlaubten Schreibweise", () => {
        const ids = KATALOG.flatMap(gruppe => gruppe.arten).map(art => art.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every(id => /^[a-z0-9-]+$/.test(id))).toBe(true);
    });
});
