import { crc32, deflateSync } from "node:zlib";
import { RUHEZONE, strichcodeLaeufe, strichcodeModule, type StrichcodeArt } from "../src/strichcode.js";

// Kleine PNG-Werkstatt für die Bilder im Apple-Pass: Symbol und Strichcode.
// Nur gefüllte Rechtecke, mehr braucht es nicht.

export type Farbe = readonly [number, number, number];

export const WEISS: Farbe = [255, 255, 255];
export const SCHWARZ: Farbe = [0, 0, 0];
export const KENNFARBE: Farbe = [18, 39, 94];

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

/** Das Symbol des Passes: eine helle Karte auf der Kennfarbe, ohne fremde Zeichen. */
export function symbol(kante: number): Buffer {
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
 * Strichcode schwarz auf weiß, mittig in einem Bild der gegebenen Größe. Die
 * Modulbreite ist ganzzahlig, damit keine Kante verschmiert.
 */
export function strichcodeBild(art: StrichcodeArt, inhalt: string, breite: number, hoehe: number): Buffer {
    const laeufe = strichcodeLaeufe(strichcodeModule(art, inhalt));
    const module = laeufe.reduce((summe, lauf) => summe + lauf, 0) + 2 * RUHEZONE;
    const modul = Math.floor(breite / module);
    if (modul < 1) {
        throw new Error("Der Strichcode ist zu lang für den Pass.");
    }
    const bild = new Bild(breite, hoehe, WEISS);
    const rand = Math.round(hoehe * 0.14);
    let x = Math.floor((breite - (module - 2 * RUHEZONE) * modul) / 2);
    laeufe.forEach((lauf, stelle) => {
        if (stelle % 2 === 0) {
            bild.rechteck(x, rand, lauf * modul, hoehe - 2 * rand, SCHWARZ);
        }
        x += lauf * modul;
    });
    return bild.png();
}
