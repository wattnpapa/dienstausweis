/**
 * Erzeugt src/dienststellen.ts aus den Vokabularen des Erfassungsbogens
 * (wattnpapa/bos-vokabulare: thw-ov.ts und thw-ov-regionalstruktur.ts).
 * Übernommen werden nur Kürzel und Name, keine Adressen oder Kontakte.
 *
 * Aufruf:  node scripts/dienststellen-uebernehmen.mjs [Pfad zu bos-vokabulare/src]
 * Ohne Pfad wird ../einheitenerfassungsbogen/vendor/bos-vokabulare/src genommen.
 */

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = resolve(process.argv[2] ?? join(hier, "..", "..", "einheitenerfassungsbogen", "vendor", "bos-vokabulare", "src"));
const ziel = join(hier, "..", "src", "dienststellen.ts");

const { THW_ORTSVERBAENDE } = await import(pathToFileURL(join(quelle, "thw-ov.ts")).href);
const { THW_REGIONALSTELLEN_KONTAKT, THW_LANDESVERBAENDE_KONTAKT } = await import(pathToFileURL(join(quelle, "thw-ov-regionalstruktur.ts")).href);

const vergleich = (a, b) => a[1].localeCompare(b[1], "de");
const zeilen = [
    ...THW_ORTSVERBAENDE.map(ov => [ov.kurz, ov.name.startsWith("Stützpunkt ") ? ov.name : `OV ${ov.name}`]).sort(vergleich),
    ...Object.entries(THW_REGIONALSTELLEN_KONTAKT).map(([name, k]) => [k.kurz, `RSt ${name}`]).sort(vergleich),
    ...Object.entries(THW_LANDESVERBAENDE_KONTAKT).map(([name, k]) => [k.kurz, `LV ${name}`]).sort(vergleich)
];

const text = `/**
 * Dienststellen des THW: Ortsverbände, Regionalstellen, Landesverbände.
 * Je Eintrag Kürzel (leer, wenn keins bekannt) und Name so, wie er auf der
 * Karte steht.
 *
 * ERZEUGT, nicht von Hand bearbeiten. Quelle: wattnpapa/bos-vokabulare
 * (Vokabulare des Erfassungsbogens). Neu erzeugen mit:
 *   node scripts/dienststellen-uebernehmen.mjs
 */

export const DIENSTSTELLEN: readonly (readonly [kurz: string, name: string])[] = [
${zeilen.map(([kurz, name]) => `    [${JSON.stringify(kurz)}, ${JSON.stringify(name)}],`).join("\n")}
];
`;

writeFileSync(ziel, text);
console.log(`${zeilen.length} Dienststellen nach ${ziel}`);
