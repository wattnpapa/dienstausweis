// Katalog der Berechtigungen. Neue Einträge hier ergänzen: Maske, Ausweis und
// Wallet-Pässe lesen alle aus dieser Liste. Eine einmal vergebene `id` bleibt,
// sonst verlieren gespeicherte Ausweise den Eintrag.

export interface BerechtigungsArt {
    /** Bleibt für immer gleich; steht in gespeicherten Ausweisen. */
    id: string;
    /** Kurzzeichen für die Marke auf dem Ausweis. */
    kurz: string;
    name: string;
    /** Läuft ab (Nachuntersuchung, Verlängerung): Die Maske fragt nach „gültig bis“. */
    befristet?: boolean;
}

export interface BerechtigungsGruppe {
    titel: string;
    arten: BerechtigungsArt[];
}

function klasse(kurz: string, befristet = false): BerechtigungsArt {
    return { id: `fe-${kurz.toLowerCase()}`, kurz, name: `Klasse ${kurz}`, ...(befristet ? { befristet } : {}) };
}

export const KATALOG: readonly BerechtigungsGruppe[] = [
    {
        titel: "Fahrerlaubnis",
        arten: [
            klasse("B"), klasse("BE"),
            klasse("C1", true), klasse("C1E", true), klasse("C", true), klasse("CE", true),
            klasse("D1", true), klasse("D1E", true), klasse("D", true), klasse("DE", true),
            klasse("T"), klasse("L"),
            { id: "fb-475", kurz: "4,75 t", name: "Fahrberechtigung bis 4,75 t" },
            { id: "fb-75", kurz: "7,5 t", name: "Fahrberechtigung bis 7,5 t" }
        ]
    },
    {
        titel: "Einsatz und Gerät",
        arten: [
            { id: "agt", kurz: "AGT", name: "Atemschutzgeräteträger", befristet: true },
            { id: "csa", kurz: "CSA", name: "Träger Chemikalienschutzanzug", befristet: true },
            { id: "motorsaege", kurz: "MKS", name: "Motorsägenführer" },
            { id: "ladekran", kurz: "Kran", name: "Ladekranführer" },
            { id: "stapler", kurz: "Stapler", name: "Fahrer Flurförderzeuge" },
            { id: "hubarbeitsbuehne", kurz: "HAB", name: "Bediener Hubarbeitsbühne" },
            { id: "bootsfuehrer", kurz: "Boot", name: "Bootsführer" },
            { id: "sprechfunker", kurz: "Funk", name: "Sprechfunker" },
            { id: "sanitaetshelfer", kurz: "San", name: "Sanitätshelfer", befristet: true }
        ]
    }
];

const NACH_ID = new Map(KATALOG.flatMap(gruppe => gruppe.arten).map(art => [art.id, art]));

export function berechtigungsArt(id: string): BerechtigungsArt | undefined {
    return NACH_ID.get(id);
}
