import { describe, expect, it } from "vitest";
import { bereinige } from "../src/daten.js";
import { einheitlicheDienststelle, findeDienststelle } from "../src/dienststelle.js";
import { DIENSTSTELLEN } from "../src/dienststellen.js";

describe("Dienststellen", () => {
    it.each([
        "OV Aachen", "Ortsverband Aachen", "THW-Ortsverband Aachen", "THW OV aachen", "aachen", "  Aachen ", "OAAC", "oaac", "OV-Aachen"
    ])("macht aus „%s“ OV Aachen", eingabe => {
        expect(findeDienststelle(eingabe)).toEqual({ kurz: "OAAC", name: "OV Aachen" });
    });

    it("erkennt Regionalstelle und Landesverband an der Vorsilbe", () => {
        expect(einheitlicheDienststelle("Regionalstelle Aachen")).toBe("RSt Aachen");
        expect(einheitlicheDienststelle("GAAC")).toBe("RSt Aachen");
        expect(einheitlicheDienststelle("Landesverband Bayern")).toBe("LV Bayern");
        expect(einheitlicheDienststelle("Bayern")).toBe("LV Bayern");
    });

    it("schreibt Umlaute und Zusätze wie im Verzeichnis", () => {
        expect(einheitlicheDienststelle("OV Altoetting")).toBe("OV Altötting");
        expect(einheitlicheDienststelle("Lübben")).toBe("OV Lübben (Spreewald)");
        expect(einheitlicheDienststelle("Halle")).toBe("OV Halle");
        expect(einheitlicheDienststelle("Frankfurt (Oder)")).toBe("OV Frankfurt (Oder)");
    });

    it("lässt Mehrdeutiges und Unbekanntes, wie es ist", () => {
        // Biberach/Baden und Biberach/Riß, nicht die Regionalstelle
        expect(findeDienststelle("Biberach")).toBeNull();
        // Das Kürzel tragen zwei Ortsverbände.
        expect(findeDienststelle("OLHT")).toBeNull();
        expect(einheitlicheDienststelle("THW-Leitung")).toBe("THW-Leitung");
        expect(einheitlicheDienststelle("")).toBe("");
    });

    it("findet jeden Eintrag unter seinem eigenen Namen wieder", () => {
        for (const [, name] of DIENSTSTELLEN) {
            expect(einheitlicheDienststelle(name)).toBe(name);
        }
    });

    it("gilt auch für gespeicherte Ausweise", () => {
        expect(bereinige({ dienststelle: "Ortsverband Achim" }).dienststelle).toBe("OV Achim");
    });
});
