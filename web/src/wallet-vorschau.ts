import {
    berechtigungenAnzeige, datumDeutsch, strichcodeInhalt, vollerName, type Ausweis
} from "../../src/daten.js";
import { strichcodeFehler, strichcodeModule } from "../../src/strichcode.js";
import { strichcodeSvg } from "./strichcode-svg.js";

// Vorschau der Wallet-Karte neben der Maske, nur auf breiten Bildschirmen.
// Sie bildet nach, was der Dienst in den Pass schreibt (server/apple.ts,
// server/google.ts): dieselben Felder, dieselbe Reihenfolge, dieselbe
// Kennfarbe. Zeichnen tut die Karte am Ende Wallet selbst; Schrift und
// Abstände weichen deshalb etwas ab.

type Art = "apple" | "google";

let art: Art = "apple";
/** Vom Nutzer gewählt: Dann überschreibt der Stand des Dienstes die Wahl nicht mehr. */
let gewaehlt = false;
let flaeche: HTMLElement | null = null;
let letzter: { ausweis: Ausweis; foto: string } | null = null;
/** Logo und Emblem liefert der Dienst, wenn er sie hat (DA_MARKE). Bis sie geladen sind: Text. */
const marke = { logo: "", emblem: "" };

function neu<K extends keyof HTMLElementTagNameMap>(name: K, klasse = "", text = ""): HTMLElementTagNameMap[K] {
    const element = document.createElement(name);
    if (klasse) {
        element.className = klasse;
    }
    if (text) {
        element.textContent = text;
    }
    return element;
}

function lade(adresse: string, schluessel: keyof typeof marke): void {
    const bild = new Image();
    bild.addEventListener("load", () => {
        marke[schluessel] = adresse;
        zeichne();
    });
    bild.src = adresse;
}

/**
 * Richtet die Vorschau in `ziel` ein.
 * @param basis Adresse des Dienstes ohne „/wallet“, dort liegen Logo und Emblem unter /marke/.
 */
export function baueWalletVorschau(ziel: HTMLElement, basis: string): void {
    flaeche = ziel.querySelector<HTMLElement>(".vorschau-flaeche");
    for (const knopf of ziel.querySelectorAll<HTMLButtonElement>("button[data-wallet]")) {
        knopf.addEventListener("click", () => {
            gewaehlt = true;
            setzeArt(knopf.dataset["wallet"] as Art);
        });
    }
    setzeArt(art);
    lade(`${basis}/marke/logo.png`, "logo");
    lade(`${basis}/marke/emblem.png`, "emblem");
}

function setzeArt(neueArt: Art): void {
    art = neueArt;
    for (const knopf of document.querySelectorAll<HTMLButtonElement>(".wallet-vorschau button[data-wallet]")) {
        knopf.setAttribute("aria-pressed", String(knopf.dataset["wallet"] === art));
    }
    zeichne();
}

/** Stellt der Dienst nur Google Wallet aus, zeigt die Vorschau zuerst die Google-Karte. */
export function walletVorschauStand(apple: boolean, google: boolean): void {
    if (!gewaehlt && google && !apple) {
        setzeArt("google");
    }
}

export function zeigeWalletVorschau(ausweis: Ausweis, foto: string): void {
    letzter = { ausweis, foto };
    zeichne();
}

function zeichne(): void {
    if (!flaeche || !letzter) {
        return;
    }
    const { ausweis, foto } = letzter;
    flaeche.replaceChildren(...(art === "apple" ? applePass(ausweis, foto) : googlePass(ausweis)));
}

// ---- Bausteine ---------------------------------------------------------------

/** Feld wie in Wallet: Beschriftung klein darüber, Wert darunter. Ohne Wert mit Platzhalter. */
function feld(beschriftung: string, wert: string, klasse = "", platzhalter = ""): HTMLElement {
    const kasten = neu("div", `p-feld ${klasse}`.trim());
    kasten.append(neu("span", "p-beschriftung", beschriftung));
    const inhalt = neu("span", wert ? "p-wert" : "p-wert platzhalter", wert || platzhalter);
    if (wert) {
        inhalt.title = wert;
    }
    kasten.append(inhalt);
    return kasten;
}

function reihe(...felder: Array<HTMLElement | null>): HTMLElement | null {
    const da = felder.filter((eintrag): eintrag is HTMLElement => eintrag !== null);
    if (da.length === 0) {
        return null;
    }
    const zeile = neu("div", "p-reihe");
    zeile.append(...da);
    return zeile;
}

/** Wie `felder` im Dienst: Leere Angaben stehen nicht auf der Karte. */
function wennDa(beschriftung: string, wert: string): HTMLElement | null {
    return wert ? feld(beschriftung, wert) : null;
}

function strichcode(ausweis: Ausweis, mitText: boolean): HTMLElement {
    const kasten = neu("div", "p-strichcode");
    const inhalt = strichcodeInhalt(ausweis);
    if (inhalt === "") {
        kasten.append(neu("span", "p-leer", "Strichcode erscheint mit der Nummer"));
        return kasten;
    }
    const fehler = strichcodeFehler(ausweis.strichcodeArt, inhalt);
    if (fehler !== null) {
        kasten.append(neu("span", "p-leer", fehler));
        return kasten;
    }
    kasten.append(strichcodeSvg(strichcodeModule(ausweis.strichcodeArt, inhalt)));
    if (mitText) {
        kasten.append(neu("span", "p-alttext", inhalt));
    }
    return kasten;
}

function logo(): HTMLElement {
    if (marke.logo) {
        const bild = neu("img", "p-logo");
        bild.src = marke.logo;
        bild.alt = "";
        return bild;
    }
    return neu("span", "p-logotext", "THW-Ausweis");
}

function fotoBild(foto: string, klasse: string): HTMLElement {
    const bild = neu("img", klasse);
    bild.src = foto;
    bild.alt = "Passfoto";
    return bild;
}

// ---- Apple Wallet ------------------------------------------------------------

function applePass(ausweis: Ausweis, foto: string): HTMLElement[] {
    const nativ = ausweis.strichcodeArt === "code128";
    const karte = neu("div", nativ ? "pass apple" : "pass apple eintritt");
    const kopf = neu("div", "p-kopf");
    kopf.append(logo(), feld("Ausweis-Nr.", ausweis.nummer, "rechts", "01234567-01"));
    karte.append(kopf);

    const name = feld("Name", vollerName(ausweis), "", "Vorname Name");
    const dienststelle = wennDa("Dienststelle", ausweis.dienststelle);
    const geburtsdatum = wennDa("Geburtsdatum", datumDeutsch(ausweis.geburtsdatum));
    const gueltig = wennDa("Gültig bis", datumDeutsch(ausweis.gueltigBis));
    const kurz = berechtigungenAnzeige(ausweis).map(eintrag => eintrag.kurz).join(" · ");
    const berechtigungen = wennDa("Berechtigungen", kurz);

    if (nativ) {
        // „generic“: Name groß, Foto rechts daneben, darunter Dienststelle und
        // Daten, dann die Berechtigungen; den Strichcode zeichnet Wallet unten.
        const mitte = neu("div", "p-mitte");
        name.classList.add("primaer");
        const felder = neu("div", "p-felder");
        felder.append(name);
        const daten = reihe(dienststelle, geburtsdatum, gueltig);
        if (daten) {
            felder.append(daten);
        }
        mitte.append(felder);
        if (foto) {
            mitte.append(fotoBild(foto, "p-vorschaubild"));
        }
        karte.append(mitte);
        const unten = reihe(berechtigungen);
        if (unten) {
            karte.append(unten);
        }
        const fuss = neu("div", "p-fuss");
        fuss.append(strichcode(ausweis, true));
        karte.append(fuss);
    } else {
        // „eventTicket“: Foto und Strichcode im Streifenbild, darunter alle
        // Angaben in einer Zeile und die Berechtigungen in der zweiten.
        const streifen = neu("div", "p-streifen");
        if (foto) {
            streifen.append(fotoBild(foto, "p-streifenfoto"));
        }
        streifen.append(strichcode(ausweis, false));
        karte.append(streifen);
        for (const zeile of [reihe(name, dienststelle, geburtsdatum, gueltig), reihe(berechtigungen)]) {
            if (zeile) {
                karte.append(zeile);
            }
        }
    }
    const hinweis = neu("p", "p-unter", "Auf der Rückseite: alle Berechtigungen ausgeschrieben, die Ausweisnummer und der Hinweis, dass die Karte eine selbst erstellte Kopie ist.");
    return [karte, hinweis];
}

// ---- Google Wallet -----------------------------------------------------------

function googlePass(ausweis: Ausweis): HTMLElement[] {
    const karte = neu("div", "pass google");
    const kopf = neu("div", "g-kopf");
    if (marke.emblem) {
        const bild = neu("img", "g-logo");
        bild.src = marke.emblem;
        bild.alt = "";
        kopf.append(bild);
    }
    kopf.append(neu("span", "g-titel", "THW-Ausweis"));
    karte.append(kopf);
    if (ausweis.dienststelle) {
        karte.append(neu("div", "g-unterzeile", ausweis.dienststelle));
    }
    const kopfzeile = vollerName(ausweis) || ausweis.nummer;
    karte.append(neu("div", kopfzeile ? "g-kopfzeile" : "g-kopfzeile platzhalter", kopfzeile || "Vorname Name"));
    const fuss = neu("div", "p-fuss");
    fuss.append(strichcode(ausweis, true));
    karte.append(fuss);

    // Die Textmodule stehen in Google Wallet unter der Karte, in den Details.
    const berechtigungen = berechtigungenAnzeige(ausweis)
        .map(eintrag => eintrag.bis ? `${eintrag.kurz} (bis ${datumDeutsch(eintrag.bis)})` : eintrag.kurz)
        .join(", ");
    const details = neu("dl", "g-details");
    for (const [titel, wert] of [
        ["Ausweis-Nr.", ausweis.nummer],
        ["Geburtsdatum", datumDeutsch(ausweis.geburtsdatum)],
        ["Gültig bis", datumDeutsch(ausweis.gueltigBis)],
        ["Berechtigungen", berechtigungen]
    ] as const) {
        if (wert) {
            details.append(neu("dt", "", titel), neu("dd", "", wert));
        }
    }
    const teile: HTMLElement[] = [karte];
    if (details.childElementCount > 0) {
        teile.push(neu("p", "p-unter", "Unter der Karte, in den Details:"), details);
    }
    teile.push(neu("p", "p-unter", "Google Wallet nimmt kein Foto an."));
    return teile;
}
