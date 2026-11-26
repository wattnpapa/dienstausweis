import { berechtigungsArt } from "./berechtigungen.js";
import { STRICHCODE_ARTEN, type StrichcodeArt } from "./strichcode.js";

// Der Ausweis, wie ihn App und Dienst kennen. `bereinige` ist die einzige Tür:
// Was aus dem Speicher, einer Sicherungsdatei oder dem Netz kommt, geht da durch.

export interface Berechtigung {
    /** id aus dem Katalog; leer bei einer eigenen Berechtigung. */
    id: string;
    /** Nur bei eigenen Berechtigungen. */
    name?: string;
    /** ISO-Datum, bis wann sie gilt. */
    bis?: string;
}

export interface Ausweis {
    nummer: string;
    vorname: string;
    nachname: string;
    dienststelle: string;
    /** ISO-Datum (JJJJ-MM-TT) oder leer. */
    geburtsdatum: string;
    gueltigBis: string;
    strichcodeArt: StrichcodeArt;
    /** Leer: Der Strichcode trägt die Ausweisnummer. */
    strichcodeInhalt: string;
    berechtigungen: Berechtigung[];
}

export const LEER: Ausweis = {
    nummer: "", vorname: "", nachname: "", dienststelle: "", geburtsdatum: "", gueltigBis: "",
    strichcodeArt: "code39", strichcodeInhalt: "", berechtigungen: []
};

export const MAX_BERECHTIGUNGEN = 40;

function text(wert: unknown, laenge: number): string {
    // Steuerzeichen raus, damit nichts davon in einem Pass landet.
    return typeof wert === "string" ? wert.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, laenge) : "";
}

function datum(wert: unknown): string {
    if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) {
        return "";
    }
    const zeit = new Date(`${wert}T00:00:00Z`);
    return Number.isNaN(zeit.getTime()) || zeit.toISOString().slice(0, 10) !== wert ? "" : wert;
}

function berechtigung(roh: unknown): Berechtigung | null {
    if (typeof roh !== "object" || roh === null) {
        return null;
    }
    const quelle = roh as Record<string, unknown>;
    const id = text(quelle["id"], 40);
    const bis = datum(quelle["bis"]);
    if (id !== "") {
        // Unbekannte ids bleiben erhalten: Eine ältere Fassung der App soll
        // Einträge einer neueren nicht aus der Sicherung streichen.
        return /^[a-z0-9-]+$/.test(id) ? { id, ...(bis ? { bis } : {}) } : null;
    }
    const name = text(quelle["name"], 60);
    return name === "" ? null : { id: "", name, ...(bis ? { bis } : {}) };
}

/** Macht aus beliebigen Daten einen gültigen Ausweis; Unbrauchbares fällt weg. */
export function bereinige(roh: unknown): Ausweis {
    const quelle = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
    const art = quelle["strichcodeArt"];
    const liste = Array.isArray(quelle["berechtigungen"]) ? quelle["berechtigungen"] : [];
    const gesehen = new Set<string>();
    const berechtigungen = liste
        .map(berechtigung)
        .filter((eintrag): eintrag is Berechtigung => {
            if (eintrag === null) {
                return false;
            }
            const schluessel = eintrag.id || `=${eintrag.name}`;
            return gesehen.has(schluessel) ? false : (gesehen.add(schluessel), true);
        })
        .slice(0, MAX_BERECHTIGUNGEN);
    return {
        nummer: text(quelle["nummer"], 30),
        vorname: text(quelle["vorname"], 60),
        nachname: text(quelle["nachname"], 60),
        dienststelle: text(quelle["dienststelle"], 80),
        geburtsdatum: datum(quelle["geburtsdatum"]),
        gueltigBis: datum(quelle["gueltigBis"]),
        strichcodeArt: STRICHCODE_ARTEN.includes(art as StrichcodeArt) ? art as StrichcodeArt : "code39",
        strichcodeInhalt: text(quelle["strichcodeInhalt"], 40),
        berechtigungen
    };
}

/** Was im Strichcode steht: der eigene Inhalt oder die Ausweisnummer. */
export function strichcodeInhalt(ausweis: Ausweis): string {
    return ausweis.strichcodeInhalt || ausweis.nummer;
}

export function vollerName(ausweis: Ausweis): string {
    return [ausweis.vorname, ausweis.nachname].filter(Boolean).join(" ");
}

/** JJJJ-MM-TT → TT.MM.JJJJ */
export function datumDeutsch(iso: string): string {
    const teile = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return teile ? `${teile[3]}.${teile[2]}.${teile[1]}` : "";
}

/** Heute als ISO-Datum in Ortszeit. */
export function heute(jetzt = new Date()): string {
    const zwei = (zahl: number): string => String(zahl).padStart(2, "0");
    return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}

export function abgelaufen(bis: string | undefined, stichtag = heute()): boolean {
    return Boolean(bis) && (bis as string) < stichtag;
}

export interface BerechtigungAnzeige {
    kurz: string;
    name: string;
    bis: string;
}

/** Berechtigungen zum Anzeigen, in der Reihenfolge des Ausweises. */
export function berechtigungenAnzeige(ausweis: Ausweis): BerechtigungAnzeige[] {
    return ausweis.berechtigungen.map(eintrag => {
        const art = eintrag.id ? berechtigungsArt(eintrag.id) : undefined;
        const name = art?.name ?? eintrag.name ?? eintrag.id;
        return { kurz: art?.kurz ?? name, name, bis: eintrag.bis ?? "" };
    });
}

/** Berechtigungen als Textzeilen für die Rückseite eines Passes. */
export function berechtigungenText(ausweis: Ausweis): string {
    return berechtigungenAnzeige(ausweis)
        .map(eintrag => eintrag.bis ? `${eintrag.name} (bis ${datumDeutsch(eintrag.bis)})` : eintrag.name)
        .join("\n");
}

/** Reicht das für einen Ausweis? Gibt die fehlenden Angaben zurück. */
export function fehlendeAngaben(ausweis: Ausweis): string[] {
    const fehlt: string[] = [];
    if (!ausweis.nummer) {
        fehlt.push("Dienstausweisnummer");
    }
    if (!ausweis.vorname && !ausweis.nachname) {
        fehlt.push("Name");
    }
    return fehlt;
}
