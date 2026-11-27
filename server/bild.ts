import { crc32, deflateSync, inflateSync } from "node:zlib";
import { RUHEZONE, strichcodeLaeufe, strichcodeModule, type StrichcodeArt } from "../src/strichcode.js";

// Kleine PNG-Werkstatt für die Bilder im Apple-Pass: Symbol und Strichcode.
// Nur gefüllte Rechtecke, mehr braucht es nicht.

export type Farbe = readonly [number, number, number];

export const WEISS: Farbe = [255, 255, 255];
export const SCHWARZ: Farbe = [0, 0, 0];
/** RAL 5002 Ultramarinblau, die Grundfarbe des THW (sRGB-Näherung). */
export const KENNFARBE: Farbe = [0, 56, 123];

export class Bild {
    readonly pixel: Uint8Array;

    constructor(readonly breite: number, readonly hoehe: number, grund: Farbe) {
        this.pixel = new Uint8Array(breite * hoehe * 3);
        this.rechteck(0, 0, breite, hoehe, grund);
    }

    rechteck(x: number, y: number, breite: number, hoehe: number, farbe: Farbe): void {
        for (let zeile = Math.max(0, y); zeile < Math.min(this.hoehe, y + hoehe); zeile++) {
            for (let spalte = Math.max(0, x); spalte < Math.min(this.breite, x + breite); spalte++) {
                this.pixel.set(farbe, (zeile * this.breite + spalte) * 3);
            }
        }
    }

    /** Zeichnet ein anderes Bild in das Rechteck; verkleinert wird über den Mittelwert der Fläche. */
    bild(quelle: Bild, x: number, y: number, breite: number, hoehe: number): void {
        for (let zeile = 0; zeile < hoehe; zeile++) {
            const oben = Math.floor(zeile * quelle.hoehe / hoehe);
            const unten = Math.max(oben + 1, Math.floor((zeile + 1) * quelle.hoehe / hoehe));
            for (let spalte = 0; spalte < breite; spalte++) {
                const links = Math.floor(spalte * quelle.breite / breite);
                const rechts = Math.max(links + 1, Math.floor((spalte + 1) * quelle.breite / breite));
                const summe = [0, 0, 0];
                for (let qy = oben; qy < unten; qy++) {
                    for (let qx = links; qx < rechts; qx++) {
                        const stelle = (qy * quelle.breite + qx) * 3;
                        summe[0]! += quelle.pixel[stelle]!;
                        summe[1]! += quelle.pixel[stelle + 1]!;
                        summe[2]! += quelle.pixel[stelle + 2]!;
                    }
                }
                const zahl = (unten - oben) * (rechts - links);
                this.rechteck(x + spalte, y + zeile, 1, 1, [summe[0]! / zahl, summe[1]! / zahl, summe[2]! / zahl]);
            }
        }
    }

    png(): Buffer {
        const zeilen = Buffer.alloc((this.breite * 3 + 1) * this.hoehe);
        for (let zeile = 0; zeile < this.hoehe; zeile++) {
            // Jede Zeile beginnt mit dem Filtertyp 0 (keiner).
            zeilen.set(this.pixel.subarray(zeile * this.breite * 3, (zeile + 1) * this.breite * 3), zeile * (this.breite * 3 + 1) + 1);
        }
        const kopf = Buffer.alloc(13);
        kopf.writeUInt32BE(this.breite, 0);
        kopf.writeUInt32BE(this.hoehe, 4);
        kopf.set([8, 2, 0, 0, 0], 8); // 8 Bit, RGB
        return Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            block("IHDR", kopf),
            block("IDAT", deflateSync(zeilen)),
            block("IEND", Buffer.alloc(0))
        ]);
    }
}

function block(art: string, inhalt: Buffer): Buffer {
    const koerper = Buffer.concat([Buffer.from(art, "latin1"), inhalt]);
    const laenge = Buffer.alloc(4);
    laenge.writeUInt32BE(inhalt.length, 0);
    const pruef = Buffer.alloc(4);
    pruef.writeUInt32BE(crc32(koerper), 0);
    return Buffer.concat([laenge, koerper, pruef]);
}

/** Breite und Höhe eines PNG, oder null, wenn es keines ist. */
export function pngMasse(daten: Uint8Array): { breite: number; hoehe: number } | null {
    const puffer = Buffer.from(daten.buffer, daten.byteOffset, daten.byteLength);
    if (puffer.length < 24 || puffer.readUInt32BE(0) !== 0x89504e47 || puffer.readUInt32BE(4) !== 0x0d0a1a0a
        || puffer.toString("latin1", 12, 16) !== "IHDR") {
        return null;
    }
    return { breite: puffer.readUInt32BE(16), hoehe: puffer.readUInt32BE(20) };
}

/**
 * Das Symbol des Passes. Mit Emblem (blau auf weiß gelesen) steht es mittig
 * auf Weiß, sonst eine helle Karte auf der Kennfarbe.
 */
export function symbol(kante: number, mitRand: Bild | null = null): Buffer {
    if (mitRand !== null) {
        const emblem = zugeschnitten(mitRand, WEISS);
        const bild = new Bild(kante, kante, WEISS);
        const rand = Math.round(kante * 0.1);
        const hoehe = kante - 2 * rand;
        const breite = Math.round(hoehe * emblem.breite / emblem.hoehe);
        bild.bild(emblem, Math.round((kante - breite) / 2), rand, breite, hoehe);
        return bild.png();
    }
    const bild = new Bild(kante, kante, KENNFARBE);
    const e = kante / 29;
    const r = (wert: number): number => Math.round(wert * e);
    bild.rechteck(r(5), r(8), r(19), r(13), WEISS);
    bild.rechteck(r(5), r(8), r(19), r(3), [203, 207, 220]);
    bild.rechteck(r(7), r(13), r(5), r(6), KENNFARBE);
    bild.rechteck(r(14), r(13), r(8), r(1), KENNFARBE);
    bild.rechteck(r(14), r(16), r(6), r(1), KENNFARBE);
    return bild.png();
}

/**
 * Liest ein PNG, wie es ein Browser aus einer Zeichenfläche schreibt: 8 Bit,
 * RGB oder RGBA, ohne Zeilensprung. Durchsichtiges wird zur Grundfarbe.
 * @throws bei jedem anderen oder beschädigten PNG
 */
export function pngLesen(daten: Uint8Array, grund: Farbe = WEISS): Bild {
    const puffer = Buffer.from(daten.buffer, daten.byteOffset, daten.byteLength);
    const masse = pngMasse(puffer);
    const kanaele = puffer[25] === 6 ? 4 : 3;
    if (masse === null || masse.breite < 1 || masse.hoehe < 1 || puffer[24] !== 8 || (puffer[25] !== 2 && puffer[25] !== 6) || puffer[28] !== 0) {
        throw new Error("Dieses PNG kann der Dienst nicht lesen.");
    }
    const teile: Buffer[] = [];
    for (let stelle = 8; stelle + 12 <= puffer.length;) {
        const laenge = puffer.readUInt32BE(stelle);
        const art = puffer.toString("latin1", stelle + 4, stelle + 8);
        if (art === "IDAT") {
            teile.push(puffer.subarray(stelle + 8, stelle + 8 + laenge));
        }
        stelle += 12 + laenge;
    }
    const breit = masse.breite * kanaele;
    const roh = inflateSync(Buffer.concat(teile), { maxOutputLength: (breit + 1) * masse.hoehe });
    if (roh.length !== (breit + 1) * masse.hoehe) {
        throw new Error("Das PNG ist unvollständig.");
    }
    const bild = new Bild(masse.breite, masse.hoehe, grund);
    let davor = new Uint8Array(breit);
    for (let zeile = 0; zeile < masse.hoehe; zeile++) {
        const filter = roh[zeile * (breit + 1)]!;
        const aktuell = new Uint8Array(roh.subarray(zeile * (breit + 1) + 1, (zeile + 1) * (breit + 1)));
        for (let i = 0; i < breit; i++) {
            const links = i >= kanaele ? aktuell[i - kanaele]! : 0;
            const oben = davor[i]!;
            const schraeg = i >= kanaele ? davor[i - kanaele]! : 0;
            let dazu = 0;
            if (filter === 1) {
                dazu = links;
            } else if (filter === 2) {
                dazu = oben;
            } else if (filter === 3) {
                dazu = (links + oben) >> 1;
            } else if (filter === 4) {
                const p = links + oben - schraeg;
                const [pa, pb, pc] = [Math.abs(p - links), Math.abs(p - oben), Math.abs(p - schraeg)];
                dazu = pa <= pb && pa <= pc ? links : pb <= pc ? oben : schraeg;
            } else if (filter !== 0) {
                throw new Error("Das PNG ist beschädigt.");
            }
            aktuell[i] = (aktuell[i]! + dazu) & 255;
        }
        for (let spalte = 0; spalte < masse.breite; spalte++) {
            const deckung = kanaele === 4 ? aktuell[spalte * 4 + 3]! / 255 : 1;
            const misch = (kanal: number): number => Math.round(aktuell[spalte * kanaele + kanal]! * deckung + grund[kanal]! * (1 - deckung));
            bild.rechteck(spalte, zeile, 1, 1, [misch(0), misch(1), misch(2)]);
        }
        davor = aktuell;
    }
    return bild;
}

/**
 * Logo für die Kopfzeile des Apple-Passes, auf der Kennfarbe gelesen und auf
 * die gegebene Höhe gebracht; die Breite folgt dem Seitenverhältnis, höchstens
 * 3,2-mal die Höhe (Wallet erlaubt 160 × 50 Punkte).
 */
export function logoBild(logo: Bild, hoehe: number): Buffer {
    const breite = Math.min(Math.round(hoehe * 3.2), Math.round(hoehe * logo.breite / logo.hoehe));
    const ziel = new Bild(breite, hoehe, KENNFARBE);
    ziel.bild(logo, 0, 0, breite, hoehe);
    return ziel.png();
}

/** Schneidet den Rand in der Grundfarbe ab; das Emblem kommt mit viel Luft. */
export function zugeschnitten(quelle: Bild, grund: Farbe): Bild {
    let [links, oben, rechts, unten] = [quelle.breite, quelle.hoehe, -1, -1];
    for (let y = 0; y < quelle.hoehe; y++) {
        for (let x = 0; x < quelle.breite; x++) {
            const stelle = (y * quelle.breite + x) * 3;
            const abstand = Math.abs(quelle.pixel[stelle]! - grund[0]) + Math.abs(quelle.pixel[stelle + 1]! - grund[1])
                + Math.abs(quelle.pixel[stelle + 2]! - grund[2]);
            if (abstand > 24) {
                links = Math.min(links, x);
                rechts = Math.max(rechts, x);
                oben = Math.min(oben, y);
                unten = Math.max(unten, y);
            }
        }
    }
    if (rechts < 0) {
        return quelle;
    }
    const ziel = new Bild(rechts - links + 1, unten - oben + 1, grund);
    for (let y = oben; y <= unten; y++) {
        ziel.pixel.set(quelle.pixel.subarray((y * quelle.breite + links) * 3, (y * quelle.breite + rechts + 1) * 3), (y - oben) * ziel.breite * 3);
    }
    return ziel;
}

/** Bild auf eine neue Größe bringen. */
export function skaliert(quelle: Bild, breite: number, hoehe: number): Bild {
    const ziel = new Bild(breite, hoehe, WEISS);
    ziel.bild(quelle, 0, 0, breite, hoehe);
    return ziel;
}

/**
 * Strichcode schwarz auf weiß als Bild der gegebenen Größe, auf Wunsch mit dem
 * Passfoto links daneben (3:4, volle Höhe). Die Modulbreite ist ganzzahlig,
 * damit keine Kante verschmiert.
 * @throws wenn der Strichcode neben dem Foto keinen Platz mehr hat
 */
export function strichcodeBild(art: StrichcodeArt, inhalt: string, breite: number, hoehe: number, foto: Bild | null = null): Buffer {
    const laeufe = strichcodeLaeufe(strichcodeModule(art, inhalt));
    const module = laeufe.reduce((summe, lauf) => summe + lauf, 0) + 2 * RUHEZONE;
    const fotoBreite = foto ? Math.round(hoehe * 3 / 4) : 0;
    const modul = Math.floor((breite - fotoBreite) / module);
    if (modul < 1) {
        throw new Error("Der Strichcode ist zu lang für den Pass.");
    }
    const bild = new Bild(breite, hoehe, WEISS);
    if (foto) {
        bild.bild(foto, 0, 0, fotoBreite, hoehe);
    }
    const rand = Math.round(hoehe * 0.14);
    let x = fotoBreite + Math.floor((breite - fotoBreite - (module - 2 * RUHEZONE) * modul) / 2);
    laeufe.forEach((lauf, stelle) => {
        if (stelle % 2 === 0) {
            bild.rechteck(x, rand, lauf * modul, hoehe - 2 * rand, SCHWARZ);
        }
        x += lauf * modul;
    });
    return bild.png();
}
