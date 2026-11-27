import "./seite.js";
import { KATALOG, berechtigungsArt } from "../../src/berechtigungen.js";
import {
    LEER, abgelaufen, bereinige, datumDeutsch, fehlendeAngaben, strichcodeInhalt,
    type Ausweis, type Berechtigung
} from "../../src/daten.js";
import { strichcodeFehler, strichcodeModule } from "../../src/strichcode.js";
import { fotoAusDatei, fotoFuerPass, fotoGueltig } from "./foto.js";
import { strichcodeSvg } from "./strichcode-svg.js";
import { baueWalletVorschau, walletVorschauStand, zeigeWalletVorschau } from "./wallet-vorschau.js";

// Die Seite: Maske, Strichcode-Vorschau und die Knöpfe, die eine Karte für
// Apple Wallet oder Google Wallet erstellen. Die Eingaben liegen nur im
// localStorage dieses Browsers, damit man die Karte später mit geänderten
// Berechtigungen neu erstellen kann.

const AUSWEIS_SCHLUESSEL = "da.ausweis.v1";
const FOTO_SCHLUESSEL = "da.foto.v1";
/** Wo der Dienst Karten signiert. Liegt die Seite woanders (GitHub Pages), zeigt VITE_WALLET_DIENST dorthin. */
const DIENST = ((import.meta.env["VITE_WALLET_DIENST"] as string | undefined) ?? "./wallet").replace(/\/$/, "");

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    const gefunden = document.getElementById(id);
    if (!gefunden) {
        throw new Error(`Element #${id} fehlt`);
    }
    return gefunden as T;
}

function neu<K extends keyof HTMLElementTagNameMap>(art: K, klasse = "", text = ""): HTMLElementTagNameMap[K] {
    const element = document.createElement(art);
    if (klasse) {
        element.className = klasse;
    }
    if (text) {
        element.textContent = text;
    }
    return element;
}

// ---- Speicher --------------------------------------------------------------

let speicherGeht = true;

function lies(schluessel: string): string | null {
    try {
        return localStorage.getItem(schluessel);
    } catch {
        speicherGeht = false;
        return null;
    }
}

function schreibe(schluessel: string, wert: string): void {
    try {
        if (wert === "") {
            localStorage.removeItem(schluessel);
        } else {
            localStorage.setItem(schluessel, wert);
        }
    } catch {
        speicherGeht = false;
    }
    el("speicher-warnung").hidden = speicherGeht;
}

function gespeicherterAusweis(): Ausweis {
    try {
        return bereinige(JSON.parse(lies(AUSWEIS_SCHLUESSEL) ?? "null"));
    } catch {
        return { ...LEER };
    }
}

let ausweis = gespeicherterAusweis();
let foto = lies(FOTO_SCHLUESSEL) ?? "";
if (!fotoGueltig(foto)) {
    foto = "";
}

function leer(): boolean {
    return JSON.stringify(ausweis) === JSON.stringify(LEER) && foto === "";
}

function sichere(): void {
    schreibe(AUSWEIS_SCHLUESSEL, leer() ? "" : JSON.stringify(ausweis));
    schreibe(FOTO_SCHLUESSEL, foto);
    el("speicher-stand").textContent = !speicherGeht || leer() ? "" : "✓ Eingaben auf diesem Gerät gespeichert, nicht auf dem Server.";
}

// ---- Kurzmeldung -----------------------------------------------------------

let zuruecknehmen: (() => void) | undefined;
let meldungUhr: ReturnType<typeof setTimeout> | undefined;

function kurzmeldung(text: string, rueckgaengig?: () => void, dauer = rueckgaengig ? 12_000 : 5_000): void {
    const kasten = el("kurzmeldung");
    el("kurzmeldung-text").textContent = text;
    zuruecknehmen = rueckgaengig;
    kasten.classList.toggle("mit-knopf", Boolean(rueckgaengig));
    kasten.hidden = false;
    clearTimeout(meldungUhr);
    meldungUhr = setTimeout(() => (kasten.hidden = true), dauer);
}

el("kurzmeldung-rueckgaengig").addEventListener("click", ereignis => {
    ereignis.stopPropagation();
    zuruecknehmen?.();
    el("kurzmeldung").hidden = true;
});
el("kurzmeldung-schliessen").addEventListener("click", ereignis => {
    ereignis.stopPropagation();
    el("kurzmeldung").hidden = true;
});
el("kurzmeldung").addEventListener("click", () => {
    if (!zuruecknehmen) {
        el("kurzmeldung").hidden = true;
    }
});

function fehlertext(fehler: unknown): string {
    return fehler instanceof Error ? fehler.message : String(fehler);
}

// ---- Maske -----------------------------------------------------------------

const maske = el<HTMLFormElement>("maske");
const TEXTFELDER = ["nummer", "vorname", "nachname", "dienststelle", "geburtsdatum", "gueltigBis", "strichcodeArt", "strichcodeInhalt"] as const;

function feld(name: string): HTMLInputElement | HTMLSelectElement {
    return maske.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
}

/** Berechtigungen, die diese Fassung der App nicht kennt: Sie bleiben im Ausweis, auch ohne Kästchen. */
let unbekannte: Berechtigung[] = [];

function baueKatalog(): void {
    el("m-katalog").replaceChildren(...KATALOG.map(gruppe => {
        const satz = neu("fieldset", "wahl rechte");
        satz.append(neu("legend", "", gruppe.titel));
        for (const art of gruppe.arten) {
            const zeile = neu("div", "recht");
            const wahl = neu("label", "inline");
            const kasten = neu("input");
            kasten.type = "checkbox";
            kasten.dataset["recht"] = art.id;
            wahl.append(kasten, neu("span", "", art.name));
            zeile.append(wahl);
            if (art.befristet) {
                const frist = neu("label", "feld frist", "gültig bis");
                const datum = neu("input");
                datum.type = "date";
                datum.dataset["frist"] = art.id;
                frist.append(datum);
                frist.hidden = true;
                zeile.append(frist);
            }
            satz.append(zeile);
        }
        return satz;
    }));
}

function eigeneZeile(eintrag: Berechtigung): HTMLElement {
    const zeile = neu("div", "eigene-zeile");
    const name = neu("label", "feld", "Bezeichnung");
    const text = neu("input");
    text.type = "text";
    text.maxLength = 60;
    text.value = eintrag.name ?? "";
    text.dataset["eigenName"] = "";
    name.append(text);
    const frist = neu("label", "feld frist", "gültig bis");
    const datum = neu("input");
    datum.type = "date";
    datum.value = eintrag.bis ?? "";
    datum.dataset["eigenFrist"] = "";
    frist.append(datum);
    const weg = neu("button", "", "Entfernen");
    weg.type = "button";
    weg.addEventListener("click", () => {
        const davor = ausweis;
        zeile.remove();
        uebernimm();
        if (text.value.trim()) {
            kurzmeldung(`„${text.value.trim()}“ entfernt.`, () => {
                ausweis = davor;
                sichere();
                fuelleMaske();
            });
        }
    });
    zeile.append(name, frist, weg);
    return zeile;
}

function fotoElement(ziel: HTMLElement): void {
    ziel.replaceChildren();
    ziel.classList.toggle("ohne", foto === "");
    if (foto) {
        const bild = neu("img");
        bild.src = foto;
        bild.alt = "Passfoto";
        ziel.append(bild);
    } else {
        ziel.append(neu("span", "", "kein Foto"));
    }
}

/** Ausweis → Maske */
function fuelleMaske(): void {
    for (const name of TEXTFELDER) {
        feld(name).value = ausweis[name];
    }
    feld("strichcodeInhalt").setAttribute("placeholder", ausweis.nummer || "wie Dienstausweisnummer");
    const gewaehlt = new Map(ausweis.berechtigungen.filter(eintrag => eintrag.id).map(eintrag => [eintrag.id, eintrag]));
    for (const kasten of maske.querySelectorAll<HTMLInputElement>("input[data-recht]")) {
        const eintrag = gewaehlt.get(kasten.dataset["recht"] as string);
        kasten.checked = Boolean(eintrag);
        const datum = maske.querySelector<HTMLInputElement>(`input[data-frist="${kasten.dataset["recht"]}"]`);
        if (datum) {
            datum.value = eintrag?.bis ?? "";
            (datum.parentElement as HTMLElement).hidden = !eintrag;
        }
    }
    unbekannte = ausweis.berechtigungen.filter(eintrag => eintrag.id && !berechtigungsArt(eintrag.id));
    el("m-eigene").replaceChildren(...ausweis.berechtigungen.filter(eintrag => !eintrag.id).map(eigeneZeile));
    fotoElement(el("m-foto"));
    el("foto-entfernen").hidden = foto === "";
    zeigeStrichcodeStand();
}

/** Maske → Ausweis, speichern */
function uebernimm(): void {
    const berechtigungen: Berechtigung[] = [];
    for (const kasten of maske.querySelectorAll<HTMLInputElement>("input[data-recht]")) {
        const datum = maske.querySelector<HTMLInputElement>(`input[data-frist="${kasten.dataset["recht"]}"]`);
        if (datum) {
            (datum.parentElement as HTMLElement).hidden = !kasten.checked;
        }
        if (kasten.checked) {
            berechtigungen.push({ id: kasten.dataset["recht"] as string, ...(datum?.value ? { bis: datum.value } : {}) });
        }
    }
    berechtigungen.push(...unbekannte);
    for (const zeile of el("m-eigene").querySelectorAll<HTMLElement>(".eigene-zeile")) {
        const name = (zeile.querySelector("input[data-eigen-name]") as HTMLInputElement).value;
        const bis = (zeile.querySelector("input[data-eigen-frist]") as HTMLInputElement).value;
        berechtigungen.push({ id: "", name, ...(bis ? { bis } : {}) });
    }
    ausweis = bereinige({ ...Object.fromEntries(TEXTFELDER.map(name => [name, feld(name).value])), berechtigungen });
    feld("strichcodeInhalt").setAttribute("placeholder", ausweis.nummer || "wie Dienstausweisnummer");
    zeigeStrichcodeStand();
    sichere();
}

function zeigeStrichcodeStand(): void {
    const inhalt = strichcodeInhalt(ausweis);
    const fehler = inhalt === "" ? null : strichcodeFehler(ausweis.strichcodeArt, inhalt);
    const zeile = el("strichcode-fehler");
    zeile.hidden = fehler === null;
    zeile.textContent = fehler ?? "";
    el("strichcode-stand").textContent = `(${ausweis.strichcodeArt === "code39" ? "Code 39" : "Code 128"})`;
    const vorschau = el("strichcode-vorschau");
    vorschau.replaceChildren();
    if (inhalt === "") {
        vorschau.append(neu("span", "leer", "Erscheint, sobald die Dienstausweisnummer eingetragen ist."));
    } else if (fehler === null) {
        vorschau.append(strichcodeSvg(strichcodeModule(ausweis.strichcodeArt, inhalt)), neu("span", "daten", inhalt));
    }
    zeigeWalletVorschau(ausweis, foto);
    walletStand();
}

maske.addEventListener("input", uebernimm);
maske.addEventListener("submit", ereignis => ereignis.preventDefault());
// Die Nummer steht auf der Karte in Großbuchstaben, und Code 39 kennt keine kleinen.
feld("nummer").addEventListener("change", () => {
    feld("nummer").value = feld("nummer").value.toUpperCase();
    uebernimm();
});
el("eigene-neu").addEventListener("click", () => {
    const zeile = eigeneZeile({ id: "" });
    el("m-eigene").append(zeile);
    zeile.querySelector("input")?.focus();
});

// ---- Foto ------------------------------------------------------------------

function setzeFoto(wert: string): void {
    foto = wert;
    sichere();
    fotoElement(el("m-foto"));
    el("foto-entfernen").hidden = foto === "";
    zeigeWalletVorschau(ausweis, foto);
}

el<HTMLInputElement>("foto-datei").addEventListener("change", async ereignis => {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    eingabe.value = "";
    if (!datei) {
        return;
    }
    const davor = foto;
    try {
        setzeFoto(await fotoAusDatei(datei));
        kurzmeldung("Foto übernommen.", () => setzeFoto(davor));
    } catch (fehler) {
        kurzmeldung(fehlertext(fehler));
    }
});
el("foto-entfernen").addEventListener("click", () => {
    const davor = foto;
    setzeFoto("");
    kurzmeldung("Foto entfernt.", () => setzeFoto(davor));
});

// ---- Löschen ---------------------------------------------------------------

function ladeHerunter(inhalt: Blob, name: string): void {
    const adresse = URL.createObjectURL(inhalt);
    const verweis = neu("a");
    verweis.href = adresse;
    verweis.download = name;
    document.body.append(verweis);
    verweis.click();
    verweis.remove();
    setTimeout(() => URL.revokeObjectURL(adresse), 60_000);
}

el("alles-loeschen").addEventListener("click", () => {
    if (leer()) {
        kurzmeldung("Auf diesem Gerät liegen keine Eingaben.");
        return;
    }
    const davor = { ausweis, foto };
    ausweis = { ...LEER };
    foto = "";
    sichere();
    fuelleMaske();
    kurzmeldung("Eingaben gelöscht. Eine Karte in der Wallet bleibt dort, bis du sie entfernst.", () => {
        ({ ausweis, foto } = davor);
        sichere();
        fuelleMaske();
    }, 20_000);
});

// ---- Wallet ----------------------------------------------------------------

let wallet: { apple: boolean; google: boolean } | null | undefined;

async function frageWallet(): Promise<void> {
    try {
        const antwort = await fetch(`${DIENST}/stand`, { cache: "no-store" });
        const stand = antwort.ok ? await antwort.json() as { apple?: unknown; google?: unknown } : null;
        wallet = stand ? { apple: stand.apple === true, google: stand.google === true } : null;
        if (wallet) {
            walletVorschauStand(wallet.apple, wallet.google);
        }
    } catch {
        wallet = null;
    }
    walletStand();
}

function walletStand(): void {
    const text = el("wallet-text");
    const bereit = Boolean(wallet && (wallet.apple || wallet.google));
    const fehlt = fehlendeAngaben(ausweis);
    const strichcode = strichcodeFehler(ausweis.strichcodeArt, strichcodeInhalt(ausweis));
    const sperre = fehlt.length > 0 ? `Es fehlt noch: ${fehlt.join(", ")}.` : strichcode;
    el("wallet-knoepfe").hidden = !bereit;
    el("wallet-hinweis").hidden = !bereit;
    el("wallet-apple").hidden = !wallet?.apple;
    el("wallet-google").hidden = !wallet?.google;
    // Die Knöpfe bleiben antippbar und sagen dann, was fehlt: Ein grauer Knopf erklärt nichts.
    el("wallet-fehlt").hidden = true;
    el("wallet-knoepfe").dataset["sperre"] = bereit && sperre ? sperre : "";
    if (wallet === undefined) {
        text.textContent = "Prüfe, ob der Server Karten ausstellt …";
    } else if (!bereit) {
        text.textContent = navigator.onLine
            ? "Dieser Server stellt zurzeit keine Wallet-Karten aus."
            : "Ohne Netz lässt sich keine Karte erstellen.";
    } else {
        const frist = abgelaufen(ausweis.gueltigBis) ? ` Achtung: Der Ausweis ist seit dem ${datumDeutsch(ausweis.gueltigBis)} abgelaufen.` : "";
        text.textContent = `Ändert sich später etwas, etwa eine Berechtigung oder die Endnummer, erstell die Karte neu und lösche die alte.${frist}`;
    }
}

async function hole(pfad: string, koerper: unknown): Promise<Response> {
    const antwort = await fetch(`${DIENST}/${pfad}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(koerper)
    });
    if (!antwort.ok) {
        const meldung = await antwort.json().then((inhalt: { fehler?: string }) => inhalt.fehler, () => undefined);
        throw new Error(meldung ?? `Der Server antwortet mit ${antwort.status}.`);
    }
    return antwort;
}

async function mitKnopf(knopf: HTMLButtonElement, arbeit: () => Promise<void>): Promise<void> {
    const sperre = el("wallet-knoepfe").dataset["sperre"];
    if (sperre) {
        const zeile = el("wallet-fehlt");
        zeile.textContent = sperre;
        zeile.hidden = false;
        return;
    }
    const beschriftung = knopf.textContent;
    knopf.disabled = true;
    knopf.classList.add("arbeitet");
    knopf.textContent = "Karte wird erstellt …";
    try {
        await arbeit();
    } catch (fehler) {
        kurzmeldung(`Die Karte ließ sich nicht erstellen: ${navigator.onLine ? fehlertext(fehler) : "keine Verbindung."}`, undefined, 12_000);
    } finally {
        knopf.disabled = false;
        knopf.classList.remove("arbeitet");
        knopf.textContent = beschriftung;
    }
}

el<HTMLButtonElement>("wallet-apple").addEventListener("click", ereignis => mitKnopf(ereignis.currentTarget as HTMLButtonElement, async () => {
    const bild = foto ? await fotoFuerPass(foto) : undefined;
    const antwort = await hole("apple", { ausweis, foto: bild });
    const pass = new Blob([await antwort.arrayBuffer()], { type: "application/vnd.apple.pkpass" });
    ladeHerunter(pass, "dienstausweis.pkpass");
}));

el<HTMLButtonElement>("wallet-google").addEventListener("click", ereignis => mitKnopf(ereignis.currentTarget as HTMLButtonElement, async () => {
    const antwort = await hole("google", { ausweis });
    const { url } = await antwort.json() as { url: string };
    window.location.assign(url);
}));

// ---- Start -----------------------------------------------------------------

baueKatalog();
// Logo und Emblem liegen beim Dienst unter /marke/, neben /wallet/.
baueWalletVorschau(el("wallet-vorschau"), DIENST.replace(/\/wallet$/, ""));
fuelleMaske();
sichere();
void frageWallet();
window.addEventListener("online", () => void frageWallet());

el("fassung").textContent = `Fassung ${__FASSUNG__}`;

// Frühere Fassungen haben einen Dienst für den Start ohne Netz eingerichtet. Die
// Seite ist keine App mehr; er wird abgemeldet, sein Speicher geleert.
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(liste => liste.forEach(dienst => void dienst.unregister())).catch(() => undefined);
    if ("caches" in window) {
        caches.keys().then(namen => namen.filter(name => name.startsWith("da-")).forEach(name => void caches.delete(name))).catch(() => undefined);
    }
}
