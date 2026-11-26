import { crc32 } from "node:zlib";

// ZIP ohne Kompression. Ein Pass ist klein und besteht fast nur aus PNG, die
// schon gepackt sind.

export function zip(dateien: ReadonlyMap<string, Uint8Array>): Buffer {
    const teile: Buffer[] = [];
    const verzeichnis: Buffer[] = [];
    let versatz = 0;
    for (const [name, inhalt] of dateien) {
        const namen = Buffer.from(name, "utf8");
        const pruef = crc32(inhalt);
        const kopf = Buffer.alloc(30);
        kopf.writeUInt32LE(0x04034b50, 0);
        kopf.writeUInt16LE(20, 4);       // benötigte Version
        kopf.writeUInt16LE(0x0800, 6);   // Namen in UTF-8
        kopf.writeUInt16LE(0, 8);        // gespeichert, nicht gepackt
        kopf.writeUInt32LE(0x00210000, 10); // feste Zeit 1980-01-01: gleiche Eingabe, gleiche Datei
        kopf.writeUInt32LE(pruef, 14);
        kopf.writeUInt32LE(inhalt.length, 18);
        kopf.writeUInt32LE(inhalt.length, 22);
        kopf.writeUInt16LE(namen.length, 26);
        teile.push(kopf, namen, Buffer.from(inhalt));

        const eintrag = Buffer.alloc(46);
        eintrag.writeUInt32LE(0x02014b50, 0);
        eintrag.writeUInt16LE(20, 4);
        kopf.copy(eintrag, 6, 4, 30);    // Version bis Länge der Zusatzdaten wie im Kopf
        eintrag.writeUInt32LE(versatz, 42);
        verzeichnis.push(eintrag, namen);
        versatz += 30 + namen.length + inhalt.length;
    }
    const verzeichnisLaenge = verzeichnis.reduce((summe, teil) => summe + teil.length, 0);
    const ende = Buffer.alloc(22);
    ende.writeUInt32LE(0x06054b50, 0);
    ende.writeUInt16LE(dateien.size, 8);
    ende.writeUInt16LE(dateien.size, 10);
    ende.writeUInt32LE(verzeichnisLaenge, 12);
    ende.writeUInt32LE(versatz, 16);
    return Buffer.concat([...teile, ...verzeichnis, ende]);
}
