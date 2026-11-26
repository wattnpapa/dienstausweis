import "./seite.js";
import { KATALOG, berechtigungsArt } from "../../src/berechtigungen.js";
import {
    LEER, abgelaufen, berechtigungenAnzeige, bereinige, datumDeutsch, fehlendeAngaben, strichcodeInhalt, vollerName,
    type Ausweis, type Berechtigung
} from "../../src/daten.js";
import { RUHEZONE, strichcodeFehler, strichcodeLaeufe, strichcodeModule } from "../../src/strichcode.js";
import { fotoAusDatei, fotoFuerPass, fotoGueltig } from "./foto.js";

// Die App: Maske, Ausweisansicht, Strichcode, Sicherung und die Knöpfe für die
// Wallets. Ausweis und Foto liegen nur im localStorage dieses Browsers.

const AUSWEIS_SCHLUESSEL = "da.ausweis.v1";
const FOTO_SCHLUESSEL = "da.foto.v1";
/** Wo der Dienst Pässe signiert. Liegt die App woanders (GitHub Pages), zeigt VITE_WALLET_DIENST dorthin. */
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
    el("speicher-stand").textContent = !speicherGeht || leer() ? "" : "✓ Auf diesem Gerät gespeichert.";
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

// ---- Reiter ----------------------------------------------------------------

type Ansicht = "ausweis" | "daten";

function zeige(ansicht: Ansicht, fokus = false): void {
    for (const name of ["ausweis", "daten"] as const) {
        const reiter = el(`reiter-${name}`);
        const aktiv = name === ansicht;
        reiter.setAttribute("aria-selected", String(aktiv));
        reiter.tabIndex = aktiv ? 0 : -1;
        el(`ansicht-${name}`).hidden = !aktiv;
    }
    if (ansicht === "ausweis") {
        zeichneAusweis();
    }
    if (fokus) {
        el("inhalt").focus();
        window.scrollTo({ top: 0 });
    }
}

for (const name of ["ausweis", "daten"] as const) {
    el(`reiter-${name}`).addEventListener("click", () => zeige(name));
    el(`reiter-${name}`).addEventListener("keydown", ereignis => {
        if (ereignis.key === "ArrowLeft" || ereignis.key === "ArrowRight") {
            const anderer = name === "ausweis" ? "daten" : "ausweis";
            zeige(anderer);
            el(`reiter-${anderer}`).focus();
        }
    });
}
el("leer-zur-maske").addEventListener("click", () => zeige("daten", true));
el("zur-maske").addEventListener("click", () => zeige("daten", true));
el("zum-ausweis").addEventListener("click", () => zeige("ausweis", true));

// ---- Strichcode als SVG ----------------------------------------------------

const SVG = "http://www.w3.org/2000/svg";

/** Strichcode mit Ruhezone; immer schwarz auf weiß, auch in den dunklen Anzeigemodi. */
function strichcodeSvg(module: string): SVGSVGElement {
    const breite = module.length + 2 * RUHEZONE;
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", `0 0 ${breite} 10`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    const grund = document.createElementNS(SVG, "rect");
    grund.setAttribute("width", String(breite));
    grund.setAttribute("height", "10");
    grund.setAttribute("fill", "#fff");
    svg.append(grund);
    let x = RUHEZONE;
    let weg = "";
    strichcodeLaeufe(module).forEach((lauf, stelle) => {
        if (stelle % 2 === 0) {
            weg += `M${x} 0h${lauf}v10h-${lauf}z`;
        }
        x += lauf;
    });
    const striche = document.createElementNS(SVG, "path");
    striche.setAttribute("d", weg);
    striche.setAttribute("fill", "#000");
    svg.append(striche);
    return svg;
}

/** Module des aktuellen Ausweises, oder der Grund, warum es keinen Strichcode gibt. */
function aktuellerStrichcode(): { module: string } | { fehler: string } {
    const inhalt = strichcodeInhalt(ausweis);
    const fehler = strichcodeFehler(ausweis.strichcodeArt, inhalt);
    return fehler === null ? { module: strichcodeModule(ausweis.strichcodeArt, inhalt) } : { fehler };
}

// ---- Ausweisansicht --------------------------------------------------------

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

function zeichneAusweis(): void {
    const vollstaendig = fehlendeAngaben(ausweis).length === 0;
    el("ausweis-leer").hidden = vollstaendig;
    el("ausweis-voll").hidden = !vollstaendig;
    if (!vollstaendig) {
        return;
    }
    el("a-dienststelle").textContent = ausweis.dienststelle;
    el("a-stelle-zeile").hidden = ausweis.dienststelle === "";
    el("a-nachname").textContent = ausweis.nachname || "–";
    el("a-vorname").textContent = ausweis.vorname || "–";
    el("a-geburtsdatum").textContent = datumDeutsch(ausweis.geburtsdatum) || "–";
    el("a-gueltig").textContent = datumDeutsch(ausweis.gueltigBis) || "–";
    el("a-nummer").textContent = ausweis.nummer;
    fotoElement(el("a-foto"));

    const hinweis = el("abgelaufen");
    hinweis.hidden = !abgelaufen(ausweis.gueltigBis);
    hinweis.textContent = `Der Dienstausweis ist seit dem ${datumDeutsch(ausweis.gueltigBis)} abgelaufen.`;

    const rechte = berechtigungenAnzeige(ausweis);
    el("a-marken").replaceChildren(...rechte.map(recht => {
        const marke = neu("li", abgelaufen(recht.bis) ? "abgelaufen" : "", recht.kurz);
        marke.title = recht.name;
        return marke;
    }));
    el("a-marken").hidden = rechte.length === 0;
    el("rechte-karte").hidden = rechte.length === 0;
    el("rechte-liste").replaceChildren(...rechte.map(recht => {
        const zeile = neu("li", abgelaufen(recht.bis) ? "abgelaufen" : "");
        zeile.append(neu("span", "", recht.name));
        if (recht.bis) {
            zeile.append(neu("span", "frist", `${abgelaufen(recht.bis) ? "abgelaufen am" : "bis"} ${datumDeutsch(recht.bis)}`));
        }
        return zeile;
    }));

    const feld = el<HTMLButtonElement>("a-strichcode");
    const code = aktuellerStrichcode();
    feld.replaceChildren();
    feld.disabled = "fehler" in code;
    el<HTMLButtonElement>("gross-oeffnen").disabled = "fehler" in code;
    if ("fehler" in code) {
        feld.append(neu("span", "fehler", code.fehler));
    } else {
        feld.append(strichcodeSvg(code.module), neu("span", "daten", strichcodeInhalt(ausweis)));
    }
    walletStand();
}

// ---- Strichcode groß -------------------------------------------------------

interface Wachhalter { release(): Promise<void> }
let wach: Wachhalter | undefined;

function grossZeigen(): void {
    const code = aktuellerStrichcode();
    if ("fehler" in code) {
        return;
    }
    const dialog = el<HTMLDialogElement>("gross");
    el("gross-code").replaceChildren(strichcodeSvg(code.module));
    el("gross-nummer").textContent = strichcodeInhalt(ausweis);
    el("gross-name").textContent = vollerName(ausweis);
    // Im Hochformat quer legen, wenn ein Modul sonst schmaler als zwei Pixel würde:
    // So fein liest ein Scanner nicht mehr sicher vom Bildschirm.
    const module = code.module.length + 2 * RUHEZONE;
    dialog.classList.toggle("quer", window.innerWidth < window.innerHeight && window.innerWidth / module < 2);
    dialog.showModal();
    // Bildschirm anlassen, solange der Strichcode vor dem Terminal hängt.
    const sperre = (navigator as Navigator & { wakeLock?: { request(art: "screen"): Promise<Wachhalter> } }).wakeLock;
    sperre?.request("screen").then(halter => (wach = halter)).catch(() => undefined);
}

el("gross-oeffnen").addEventListener("click", grossZeigen);
el("a-strichcode").addEventListener("click", grossZeigen);
el("gross-schliessen").addEventListener("click", () => el<HTMLDialogElement>("gross").close());
el("gross").addEventListener("close", () => {
    wach?.release().catch(() => undefined);
    wach = undefined;
});

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
    el("strichcode-stand").textContent = `${ausweis.strichcodeArt === "code39" ? "Code 39" : "Code 128"}${inhalt ? `, „${inhalt}“` : ""}`;
    // Ein Fehler darf nicht im zugeklappten Bereich verschwinden.
    if (fehler !== null) {
        el<HTMLDetailsElement>("strichcode-karte").open = true;
    }
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

// ---- Datensicherung --------------------------------------------------------

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

el("sicherung-speichern").addEventListener("click", () => {
    if (leer()) {
        kurzmeldung("Es gibt noch nichts zu sichern.");
        return;
    }
    const inhalt = JSON.stringify({ format: "dienstausweis", version: 1, ausweis, foto }, null, 2);
    ladeHerunter(new Blob([inhalt], { type: "application/json" }), "dienstausweis-sicherung.json");
    kurzmeldung("Sicherungsdatei gespeichert. Sie enthält deine Ausweisdaten im Klartext.");
});

el<HTMLInputElement>("sicherung-datei").addEventListener("change", async ereignis => {
    const eingabe = ereignis.target as HTMLInputElement;
    const datei = eingabe.files?.[0];
    eingabe.value = "";
    if (!datei) {
        return;
    }
    try {
        const inhalt = JSON.parse(await datei.text()) as { format?: unknown; ausweis?: unknown; foto?: unknown };
        if (inhalt.format !== "dienstausweis") {
            throw new Error("keine Sicherung dieser App");
        }
        const davor = { ausweis, foto };
        ausweis = bereinige(inhalt.ausweis);
        foto = fotoGueltig(inhalt.foto) ? inhalt.foto : "";
        sichere();
        fuelleMaske();
        kurzmeldung("Sicherung geladen. Der bisherige Ausweis wurde ersetzt.", () => {
            ({ ausweis, foto } = davor);
            sichere();
            fuelleMaske();
        });
    } catch (fehler) {
        kurzmeldung(`Die Datei ließ sich nicht laden: ${fehlertext(fehler)}`);
    }
});

el("alles-loeschen").addEventListener("click", () => {
    if (leer()) {
        kurzmeldung("Auf diesem Gerät liegt kein Ausweis.");
        return;
    }
    const davor = { ausweis, foto };
    ausweis = { ...LEER };
    foto = "";
    sichere();
    fuelleMaske();
    kurzmeldung("Ausweis von diesem Gerät gelöscht. Ein Pass in der Wallet bleibt dort, bis du ihn entfernst.", () => {
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
    } catch {
        wallet = null;
    }
    walletStand();
}

function walletStand(): void {
    const text = el("wallet-text");
    const bereit = Boolean(wallet && (wallet.apple || wallet.google));
    el("wallet-knoepfe").hidden = !bereit;
    el("wallet-hinweis").hidden = !bereit;
    el("wallet-apple").hidden = !wallet?.apple;
    el("wallet-google").hidden = !wallet?.google;
    if (wallet === undefined) {
        text.textContent = "Prüfe, ob der Server Wallet-Pässe ausstellt …";
    } else if (!bereit) {
        text.textContent = navigator.onLine
            ? "Dieser Server stellt keine Wallet-Pässe aus. Der Ausweis hier in der App funktioniert trotzdem, auch ohne Netz."
            : "Ohne Netz lässt sich kein Wallet-Pass ausstellen. Der Ausweis hier in der App funktioniert trotzdem.";
    } else if (wallet?.apple && ausweis.strichcodeArt === "code39") {
        text.textContent = "Der Pass trägt deine Angaben und den Strichcode. Apple Wallet zeichnet Code 39 nicht selbst: Der Strichcode liegt dort als Bild im Pass, das Foto entfällt.";
    } else {
        text.textContent = "Der Pass trägt deine Angaben und den Strichcode. Änderst du hier später etwas, stell den Pass neu aus und lösche den alten.";
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
    const beschriftung = knopf.textContent;
    knopf.disabled = true;
    knopf.classList.add("arbeitet");
    knopf.textContent = "Pass wird ausgestellt …";
    try {
        await arbeit();
    } catch (fehler) {
        kurzmeldung(`Der Pass ließ sich nicht ausstellen: ${navigator.onLine ? fehlertext(fehler) : "keine Verbindung."}`, undefined, 12_000);
    } finally {
        knopf.disabled = false;
        knopf.classList.remove("arbeitet");
        knopf.textContent = beschriftung;
    }
}

el<HTMLButtonElement>("wallet-apple").addEventListener("click", ereignis => mitKnopf(ereignis.currentTarget as HTMLButtonElement, async () => {
    // Das Foto passt nur in den Pass mit eigenem Strichcode (Code 128), siehe server/apple.ts.
    const bild = foto && ausweis.strichcodeArt === "code128" ? await fotoFuerPass(foto) : undefined;
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
fuelleMaske();
sichere();
zeige(fehlendeAngaben(ausweis).length === 0 || leer() ? "ausweis" : "daten");
void frageWallet();
window.addEventListener("online", () => void frageWallet());

el("fassung").textContent = `Fassung ${__FASSUNG__}`;

if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register("./sw.js").then(() => {
        el("offline-stand").hidden = false;
    }).catch(() => undefined);
}
