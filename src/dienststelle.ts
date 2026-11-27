/**
 * Findet zu einer frei getippten Dienststelle den Eintrag im Verzeichnis, damit
 * derselbe Ortsverband immer gleich geschrieben auf der Karte steht.
 * „Ortsverband Aachen“, „THW-OV aachen“, „Aachen“ und „OAAC“ werden alle zu
 * „OV Aachen“. Was nicht eindeutig passt, bleibt, wie es getippt wurde.
 */

import { DIENSTSTELLEN } from "./dienststellen.js";

export interface Dienststelle {
    kurz: string;
    name: string;
}

type Art = "OV" | "RSt" | "LV";

const ARTEN: readonly Art[] = ["OV", "RSt", "LV"];

/** Vorsilben, an denen man die Art erkennt; „THW“ davor wird vorher abgeschnitten. */
const VORSILBEN: readonly (readonly [RegExp, Art])[] = [
    [/^(ortsverband|ov)(?=[\s.-]|$)[\s.-]*/i, "OV"],
    [/^(regionalstelle|rst)(?=[\s.-]|$)[\s.-]*/i, "RSt"],
    [/^(landesverband|lv)(?=[\s.-]|$)[\s.-]*/i, "LV"]
];

/** Vergleichsschlüssel: klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern. */
function schluessel(text: string): string {
    return text
        .toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9]/g, "");
}

/** Der Ort ohne Zusatz in Klammern oder nach dem Schrägstrich: „Halle (Saale)“ → „Halle“. */
function grundname(ort: string): string {
    return ort.split(/\s*[(/]/)[0] ?? ort;
}

interface Verzeichnis {
    kuerzel: Map<string, Dienststelle>;
    genau: Map<Art, Map<string, Dienststelle>>;
    grund: Map<Art, Map<string, Dienststelle[]>>;
}

let verzeichnis: Verzeichnis | null = null;

function baueVerzeichnis(): Verzeichnis {
    const kuerzel = new Map<string, Dienststelle>();
    const doppelt = new Set<string>();
    const genau = new Map<Art, Map<string, Dienststelle>>(ARTEN.map(art => [art, new Map()]));
    const grund = new Map<Art, Map<string, Dienststelle[]>>(ARTEN.map(art => [art, new Map()]));
    for (const [kurz, name] of DIENSTSTELLEN) {
        const eintrag = { kurz, name };
        if (kurz) {
            if (kuerzel.has(kurz)) {
                doppelt.add(kurz);
            }
            kuerzel.set(kurz, eintrag);
        }
        const leer = name.indexOf(" ");
        const vorne = name.slice(0, leer);
        const art: Art = vorne === "RSt" || vorne === "LV" ? vorne : "OV";
        const ort = vorne === art ? name.slice(leer + 1) : name;
        genau.get(art)?.set(schluessel(ort), eintrag);
        const liste = grund.get(art);
        const g = schluessel(grundname(ort));
        liste?.set(g, [...(liste.get(g) ?? []), eintrag]);
    }
    // Ein Kürzel, das zwei Stellen tragen, sagt nichts Eindeutiges.
    for (const kurz of doppelt) {
        kuerzel.delete(kurz);
    }
    return { kuerzel, genau, grund };
}

/** Die passende Dienststelle oder null, wenn keine eindeutig passt. */
export function findeDienststelle(eingabe: string): Dienststelle | null {
    verzeichnis ??= baueVerzeichnis();
    const rein = eingabe.trim().replace(/\s+/g, " ");
    if (rein === "") {
        return null;
    }
    const kurz = verzeichnis.kuerzel.get(rein.toUpperCase());
    if (kurz) {
        return kurz;
    }
    let rest = rein.replace(/^thw(?=[\s-]|$)[\s-]*/i, "");
    let arten = ARTEN;
    for (const [muster, art] of VORSILBEN) {
        if (muster.test(rest)) {
            rest = rest.replace(muster, "");
            arten = [art];
            break;
        }
    }
    const s = schluessel(rest);
    if (s === "") {
        return null;
    }
    for (const art of arten) {
        const treffer = verzeichnis.genau.get(art)?.get(s);
        if (treffer) {
            return treffer;
        }
        const grob = verzeichnis.grund.get(art)?.get(s) ?? [];
        if (grob.length > 0) {
            // Mehrere Orte gleichen Namens: lieber nichts als den falschen.
            return grob.length === 1 ? grob[0] ?? null : null;
        }
    }
    return null;
}

/** Die Schreibweise aus dem Verzeichnis, sonst die Eingabe, wie sie ist. */
export function einheitlicheDienststelle(eingabe: string): string {
    return findeDienststelle(eingabe)?.name ?? eingabe;
}
