// Passfoto: im Browser auf 3:4 zuschneiden und verkleinern. Das Original
// verlässt das Gerät nie, gespeichert wird nur der kleine Zuschnitt.

// 324 × 432: so groß steht das Foto in der höchsten Auflösung auf der Apple-Karte.
const BREITE = 324;
const HOEHE = 432;

function zeichne(quelle: CanvasImageSource, quellBreite: number, quellHoehe: number, breite: number, hoehe: number): HTMLCanvasElement {
    const flaeche = document.createElement("canvas");
    flaeche.width = breite;
    flaeche.height = hoehe;
    const stift = flaeche.getContext("2d");
    if (!stift) {
        throw new Error("Der Browser kann das Bild nicht bearbeiten.");
    }
    // Mittiger Ausschnitt im Zielverhältnis, etwas nach oben gerückt: Bei
    // Hochkantfotos sitzt das Gesicht selten in der Mitte.
    const faktor = Math.max(breite / quellBreite, hoehe / quellHoehe);
    const ausBreite = breite / faktor;
    const ausHoehe = hoehe / faktor;
    stift.fillStyle = "#fff";
    stift.fillRect(0, 0, breite, hoehe);
    stift.imageSmoothingQuality = "high";
    stift.drawImage(quelle, (quellBreite - ausBreite) / 2, (quellHoehe - ausHoehe) * 0.35, ausBreite, ausHoehe, 0, 0, breite, hoehe);
    return flaeche;
}

function lade(adresse: string): Promise<HTMLImageElement> {
    return new Promise((fertig, fehler) => {
        const bild = new Image();
        bild.onload = () => fertig(bild);
        bild.onerror = () => fehler(new Error("Die Datei ist kein Bild, das der Browser lesen kann."));
        bild.src = adresse;
    });
}

/** Gewählte Datei → JPEG-Daten-URL, 324 × 432. */
export async function fotoAusDatei(datei: File): Promise<string> {
    const adresse = URL.createObjectURL(datei);
    try {
        const bild = await lade(adresse);
        return zeichne(bild, bild.naturalWidth, bild.naturalHeight, BREITE, HOEHE).toDataURL("image/jpeg", 0.85);
    } finally {
        URL.revokeObjectURL(adresse);
    }
}

/** Gespeichertes Foto → PNG-Daten-URL; der Dienst liest nur PNG. */
export async function fotoFuerPass(foto: string): Promise<string> {
    const bild = await lade(foto);
    return zeichne(bild, bild.naturalWidth, bild.naturalHeight, BREITE, HOEHE).toDataURL("image/png");
}

/** Prüft ein Foto aus dem Speicher des Browsers. */
export function fotoGueltig(wert: unknown): wert is string {
    return typeof wert === "string" && wert.startsWith("data:image/jpeg;base64,") && wert.length < 400_000;
}
