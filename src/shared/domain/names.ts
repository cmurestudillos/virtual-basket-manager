/**
 * Nombres del juego.
 *
 * Están aquí y no en el generador del dataset porque el juego sigue inventando
 * gente después de empezar: juveniles cada verano y técnicos en el mercado. Con
 * una sola lista, un chaval que sale de la cantera en 2031 se llama como los que
 * venían de fábrica, que es justo lo que hace que el mundo parezca uno solo.
 *
 * Todos inventados a propósito, como el resto del dataset.
 */

import type { Rng } from '@shared/engine/basketball/rng';

export const FIRST_NAMES = [
  'Álvaro',
  'Íñigo',
  'Rubén',
  'Sergi',
  'Mateo',
  'Nicolás',
  'Adrián',
  'Óscar',
  'Bruno',
  'Guillem',
  'Héctor',
  'Pau',
  'Marcos',
  'Ignacio',
  'Diego',
  'Aitor',
  'Jonás',
  'Emilio',
  'Rodrigo',
  'Kilian',
  'Darius',
  'Milan',
  'Tomas',
  'Andrei',
  'Ousmane',
  'Dwayne',
  'Marcus',
  'Trevor',
  'Kendrick',
  'Lamar'
] as const;

export const LAST_NAMES = [
  'Arroyo',
  'Bermúdez',
  'Cifuentes',
  'Delgado',
  'Escobar',
  'Fuentes',
  'Gallardo',
  'Herrera',
  'Iriarte',
  'Jáuregui',
  'Lorenzo',
  'Maldonado',
  'Nogales',
  'Olmedo',
  'Peñarroya',
  'Quesada',
  'Robledo',
  'Salgado',
  'Terrazas',
  'Ugarte',
  'Vidal',
  'Zabala',
  'Novak',
  'Petrovic',
  'Vasiliev',
  'Kowalski',
  'Diallo',
  'Okafor',
  'Brooks',
  'Whitaker'
] as const;

/**
 * Y los nombres del resto del mundo, por bandera.
 *
 * Un pívot lituano llamado Pau Vidal rompe la ilusión antes que cualquier
 * número mal calibrado, y con veinte ligas en la partida eso pasaría en casi
 * todas. Las banderas que no están aquí tiran de la lista española, que es la
 * del país donde arranca el juego.
 */
export const NAMES_BY_FLAG: Record<string, { first: readonly string[]; last: readonly string[] }> =
  {
    USA: {
      first: ['Marcus', 'Trevor', 'Dwayne', 'Kendrick', 'Lamar', 'Jalen', 'Tyrese', 'Donovan'],
      last: ['Brooks', 'Whitaker', 'Hollis', 'Barnett', 'Coleman', 'Rhodes', 'Vaughn', 'Sinclair']
    },
    FRA: {
      first: ['Ousmane', 'Théo', 'Baptiste', 'Amadou', 'Clément', 'Yanis', 'Léandre', 'Mathis'],
      last: [
        'Diallo',
        'Lefèvre',
        'Moreau',
        'Brissaud',
        'Ndiaye',
        'Charpentier',
        'Roussel',
        'Pernot'
      ]
    },
    GER: {
      first: ['Jonas', 'Lennart', 'Maximilian', 'Fabian', 'Tobias', 'Elias', 'Niklas', 'Moritz'],
      last: ['Brandt', 'Wagner', 'Hoffmann', 'Steinbach', 'Keller', 'Lindner', 'Reuter', 'Winkler']
    },
    ITA: {
      first: [
        'Lorenzo',
        'Matteo',
        'Riccardo',
        'Alessio',
        'Davide',
        'Tommaso',
        'Federico',
        'Nicolò'
      ],
      last: ['Bellini', 'Caruso', 'Fontana', 'Marchetti', 'Rizzo', 'Vitale', 'Grassi', 'Doriani']
    },
    GRE: {
      first: ['Nikos', 'Yannis', 'Stavros', 'Dimitris', 'Kostas', 'Thanasis', 'Vasilis', 'Petros'],
      last: [
        'Kalantzis',
        'Vlachos',
        'Papadeas',
        'Stergiou',
        'Mavridis',
        'Doukas',
        'Zafiris',
        'Roussos'
      ]
    },
    TUR: {
      first: ['Emre', 'Kerem', 'Bora', 'Sinan', 'Onur', 'Deniz', 'Berk', 'Yiğit'],
      last: ['Aydın', 'Korkmaz', 'Şahin', 'Demirel', 'Yalçın', 'Ersoy', 'Kaplan', 'Öztürk']
    },
    ISR: {
      first: ['Itay', 'Noam', 'Yonatan', 'Omri', 'Eitan', 'Guy', 'Roi', 'Amit'],
      last: ['Ben-Ari', 'Shalev', 'Peretz', 'Gadot', 'Harel', 'Ziv', 'Ohana', 'Barkat']
    },
    LTU: {
      first: ['Tomas', 'Darius', 'Mantas', 'Rokas', 'Jonas', 'Paulius', 'Arvydas', 'Lukas'],
      last: [
        'Vaitkus',
        'Jankauskas',
        'Butkus',
        'Petrauskas',
        'Sabonas',
        'Gudaitis',
        'Rimkus',
        'Stankevičius'
      ]
    },
    SRB: {
      first: ['Milan', 'Nikola', 'Stefan', 'Vuk', 'Dušan', 'Marko', 'Bogdan', 'Aleksa'],
      last: ['Novak', 'Petrovic', 'Jovanović', 'Ilić', 'Radovan', 'Miletić', 'Vuković', 'Stanković']
    },
    CRO: {
      first: ['Ivan', 'Luka', 'Toni', 'Josip', 'Mario', 'Filip', 'Dario', 'Bruno'],
      last: ['Horvat', 'Babić', 'Kovačić', 'Šarić', 'Perišić', 'Mandarić', 'Tomić', 'Vrdoljak']
    },
    SLO: {
      first: ['Žiga', 'Jaka', 'Klemen', 'Matic', 'Anže', 'Rok', 'Gregor', 'Blaž'],
      last: ['Zupan', 'Kranjc', 'Dolinar', 'Potočnik', 'Hribar', 'Golob', 'Vidmar', 'Oblak']
    },
    MNE: {
      first: ['Balša', 'Nikola', 'Vasilije', 'Danilo', 'Miloš', 'Petar', 'Andrija', 'Lazar'],
      last: [
        'Đurović',
        'Kaluđerović',
        'Bulatović',
        'Vujačić',
        'Radulović',
        'Šćepanović',
        'Perović',
        'Krstajić'
      ]
    },
    BIH: {
      first: ['Amar', 'Edin', 'Haris', 'Dino', 'Emir', 'Tarik', 'Adnan', 'Nedim'],
      last: ['Hodžić', 'Begović', 'Softić', 'Mujkić', 'Alispahić', 'Karadža', 'Zukić', 'Selimović']
    },
    BEL: {
      first: ['Jarne', 'Wout', 'Senne', 'Lars', 'Robbe', 'Milan', 'Thibaut', 'Seppe'],
      last: [
        'Vermeulen',
        'De Backer',
        'Claes',
        'Peeters',
        'Wouters',
        'Maes',
        'Janssens',
        'Verhoeven'
      ]
    },
    NED: {
      first: ['Sem', 'Daan', 'Bram', 'Thijs', 'Jurre', 'Stijn', 'Koen', 'Ruben'],
      last: ['van Dijk', 'de Groot', 'Bakker', 'Visser', 'Hendriks', 'Kuipers', 'Smeets', 'Jansen']
    },
    ARG: {
      first: [
        'Facundo',
        'Gonzalo',
        'Tomás',
        'Juan Cruz',
        'Lautaro',
        'Santino',
        'Bautista',
        'Nahuel'
      ],
      last: ['Ferreyra', 'Quiroga', 'Peralta', 'Gimenez', 'Bustos', 'Ledesma', 'Ocampo', 'Sosa']
    },
    CHI: {
      first: [
        'Matías',
        'Vicente',
        'Benjamín',
        'Cristóbal',
        'Joaquín',
        'Ignacio',
        'Felipe',
        'Renato'
      ],
      last: [
        'Fuenzalida',
        'Maturana',
        'Salinas',
        'Valenzuela',
        'Cáceres',
        'Pizarro',
        'Riquelme',
        'Acuña'
      ]
    },
    AUS: {
      first: ['Cooper', 'Angus', 'Lachlan', 'Riley', 'Jesse', 'Brodie', 'Harrison', 'Callum'],
      last: [
        'Kirkwood',
        'Hollingsworth',
        'Bramble',
        'Mercer',
        'Dalton',
        'Whitcombe',
        'Prosser',
        'Lawler'
      ]
    }
  };

/** Un nombre completo. Determinista: mismo generador, mismo nombre. */
export function randomName(rng: Rng): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)] as string,
    lastName: LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)] as string
  };
}

/**
 * Un nombre de una bandera concreta.
 *
 * Gasta **las mismas dos tiradas** que {@link randomName} pase lo que pase: así
 * añadir banderas al juego no mueve ni un dígito del dataset que ya existía.
 */
export function randomNameFor(flag: string, rng: Rng): { firstName: string; lastName: string } {
  const first = rng.int(0, FIRST_NAMES.length - 1);
  const last = rng.int(0, LAST_NAMES.length - 1);
  const pool = NAMES_BY_FLAG[flag];
  if (!pool) {
    return { firstName: FIRST_NAMES[first] as string, lastName: LAST_NAMES[last] as string };
  }

  return {
    firstName: pool.first[first % pool.first.length] as string,
    lastName: pool.last[last % pool.last.length] as string
  };
}
