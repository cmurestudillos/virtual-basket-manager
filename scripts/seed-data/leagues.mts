/**
 * El mapa del mundo de la partida: qué ligas hay y con qué clubes.
 *
 * **Todo es inventado**, ciudades incluidas. Ni un nombre de club real, ni uno
 * que se le parezca: un dataset con marcas reales condiciona después qué se
 * puede distribuir, y arrastrar ese problema desde el primer día sale mucho más
 * caro que evitarlo. Lo que sí es real es la *forma* de cada liga —cuántos
 * equipos tiene, cuántas categorías, qué reglamento— porque eso no lo protege
 * nadie y es lo que hace que cada país se juegue distinto.
 *
 * Dos ligas del mismo país son dos categorías: sube y baja gente entre ellas.
 * Dos países en la misma liga —la BNXT, la Adriática— son una sola competición
 * con clubes de varias banderas, como en la realidad.
 */

export interface LeagueTier {
  id: string;
  name: string;
  shortName: string;
  teams: number;
  /** Equipos que juegan el playoff final; 0 = campeón el primero de la tabla. */
  playoffTeams: number;
  playoffSeriesLength: number;
  /** De cuánta reputación va el mejor de la liga al peor. */
  reputation: [number, number];
  /** Aforo medio del país, para que el pabellón case con la liga. */
  capacity: number;
}

export interface LeagueCountry {
  /** Código de la competición: puede no ser un país (BNXT, Adriática). */
  code: string;
  continent: 'EUR' | 'AME' | 'OCE';
  rulesetId: 'fiba' | 'nba';
  /** Prefijos de club del país: genéricos, nunca marcas. */
  prefixes: string[];
  /** Ciudades inventadas; una por club, y sobran para crecer. */
  cities: string[];
  /** Banderas posibles de los clubes: varias sólo en las ligas multipaís. */
  flags: string[];
  tiers: LeagueTier[];
}

export const WORLD: LeagueCountry[] = [
  {
    code: 'ESP',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['CB', 'Club Baloncesto', 'Basket', 'BC'],
    cities: [],
    flags: ['ESP'],
    // España ya existe en el generador: aquí sólo se declara para el reparto
    // de plazas europeas. Sus equipos se generan aparte, con las ciudades y la
    // semilla de siempre, para no mover ni un dígito del dataset que ya había.
    tiers: [
      {
        id: 'liga-nacional',
        name: 'Liga Nacional',
        shortName: 'LN',
        teams: 18,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        // El club de arriba tiene que ser un candidato al título de verdad: es
        // el listón contra el que se calibró todo lo demás del juego.
        reputation: [84, 34],
        capacity: 9000
      },
      {
        id: 'liga-plata',
        name: 'Liga Plata',
        shortName: 'LP',
        teams: 18,
        playoffTeams: 0,
        playoffSeriesLength: 1,
        reputation: [30, 7],
        capacity: 4000
      }
    ]
  },
  {
    code: 'TUR',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['SK', 'Basketbol', 'BK'],
    cities: [
      'Kayalar',
      'Denizyaka',
      'Altınova',
      'Beykoru',
      'Yeşiltepe',
      'Karabel',
      'Gökçesu',
      'Sarıkavak',
      'Toprakkale',
      'Uzunyayla',
      'Çamlıdere',
      'Akpınar',
      'Doğanşehir',
      'Elmalıca',
      'Ferahköy',
      'Güneyçam'
    ],
    flags: ['TUR'],
    tiers: [
      {
        id: 'turquia-1',
        name: 'Süper Basketbol Ligi',
        shortName: 'SBL',
        teams: 16,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [80, 44],
        capacity: 9500
      }
    ]
  },
  {
    code: 'GRE',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['AS', 'GS', 'AO'],
    cities: [
      'Kalithéa',
      'Néa Pýrgos',
      'Thermýli',
      'Panorámi',
      'Vrysoúla',
      'Elaiónas',
      'Kastrópolis',
      'Aigialós',
      'Petrálona',
      'Livádia',
      'Anthoúsa',
      'Melíssia',
      'Argyrós',
      'Xilókastro',
      'Ampeliá',
      'Kryonéri',
      'Peristéra',
      'Vathýlakkos',
      'Dafnoúla',
      'Skalochóri',
      'Mesóvouno',
      'Platanórema',
      'Sykiés',
      'Trapezoúnta',
      'Faneroméni',
      'Chrysoúpoli',
      'Orfanó',
      'Limnochóri'
    ],
    flags: ['GRE'],
    tiers: [
      {
        id: 'grecia-1',
        name: 'A1 Ethnikí',
        shortName: 'A1',
        teams: 14,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [79, 40],
        capacity: 8500
      },
      {
        id: 'grecia-2',
        name: 'A2 Ethnikí',
        shortName: 'A2',
        teams: 14,
        playoffTeams: 0,
        playoffSeriesLength: 1,
        reputation: [36, 14],
        capacity: 3200
      }
    ]
  },
  {
    code: 'ITA',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['Pallacanestro', 'Basket', 'PB'],
    cities: [
      'Montefiore',
      'Valserra',
      'Colleluna',
      'Rocca Bianca',
      'Portoverde',
      'Santa Lucia di Mare',
      'Belmonte',
      'Cascine',
      'Torreggio',
      'Fontanella',
      'Lagoscuro',
      'Pietralba',
      'Vallenova',
      'Corteolona',
      'Marinella',
      'Selvabella'
    ],
    flags: ['ITA'],
    tiers: [
      {
        id: 'italia-1',
        name: 'Serie A Cestistica',
        shortName: 'SAC',
        teams: 16,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [74, 38],
        capacity: 7500
      }
    ]
  },
  {
    code: 'FRA',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['BC', 'Basket Club', 'ASB'],
    cities: [
      'Villeneuve-la-Roche',
      'Saint-Aubin-du-Lac',
      'Montclair',
      'Beauregard',
      'Pont-Vieux',
      'Chênebourg',
      'Val-Fleury',
      'La Tourelle',
      'Roquemaure',
      'Fontaine-Basse',
      'Cap-Ferrand',
      'Aubevoie',
      'Grandchamp',
      'La Verrerie',
      'Sainte-Claire',
      'Mareuil',
      'Bois-Joli',
      'Clairval',
      'Puy-Saint-Loup',
      'La Grange-aux-Bois',
      'Ferrières-le-Haut',
      'Aubignac',
      'Coulonges',
      'Meillant',
      'Saint-Yrieix-la-Plaine',
      'La Chapelle-Rouge',
      'Bellecombe',
      'Trévignac',
      'Montsalvy',
      'Le Vieux-Port',
      'Nanteuil-sur-Loir',
      'Cormery',
      'La Roche-Guyon',
      'Vaussieux',
      'Béthisy',
      'Salornay'
    ],
    flags: ['FRA'],
    tiers: [
      {
        id: 'francia-1',
        name: 'Pro A',
        shortName: 'PRA',
        teams: 18,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [72, 36],
        capacity: 7000
      },
      {
        id: 'francia-2',
        name: 'Pro B',
        shortName: 'PRB',
        teams: 18,
        playoffTeams: 0,
        playoffSeriesLength: 1,
        reputation: [34, 12],
        capacity: 3000
      }
    ]
  },
  {
    code: 'GER',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['SG', 'BC', 'TSV'],
    cities: [
      'Rotenfels',
      'Neustetten',
      'Hohenbach',
      'Lindenau',
      'Weissenberg',
      'Grünwalde',
      'Talheim',
      'Steinbrück',
      'Eichfeld',
      'Moorburg',
      'Königsau',
      'Falkenstein',
      'Birkenhof',
      'Seewalde',
      'Ahrensbach',
      'Kirchdorn',
      'Sonnenstein',
      'Wolfsgrund',
      'Erlenbach',
      'Nordheide',
      'Buchenstein',
      'Altwiesen',
      'Rheinfeld',
      'Dornburg',
      'Haselhorst',
      'Graufels',
      'Silberbach',
      'Waldeck-Süd',
      'Hohenlinde',
      'Elsterau',
      'Marbach-Ost',
      'Tannenberg',
      'Uferstadt',
      'Zellendorf'
    ],
    flags: ['GER'],
    tiers: [
      {
        id: 'alemania-1',
        name: 'Basketball Bundesliga',
        shortName: 'BBL',
        teams: 18,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [71, 35],
        capacity: 7200
      },
      {
        id: 'alemania-2',
        name: 'ProA',
        shortName: 'PA',
        teams: 16,
        playoffTeams: 0,
        playoffSeriesLength: 1,
        reputation: [33, 12],
        capacity: 2800
      }
    ]
  },
  {
    code: 'ISR',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['BC', 'Ironi', 'Hapoel'],
    cities: [
      'Kfar Naveh',
      'Givat Tamar',
      'Ramat Shoham',
      'Nahal Oren',
      'Beit Arava',
      'Tel Yarden',
      'Even Sapir',
      'Har Zafon',
      'Migdal Or',
      'Ein Dorot',
      'Kiryat Erez',
      'Sde Rimon'
    ],
    flags: ['ISR'],
    tiers: [
      {
        id: 'israel-1',
        name: 'Ligat HaAl',
        shortName: 'LHA',
        teams: 12,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [73, 38],
        capacity: 6000
      }
    ]
  },
  {
    code: 'LTU',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['BC', 'KK', 'Krepšinio'],
    cities: [
      'Aukštupys',
      'Girionys',
      'Vilkupiai',
      'Šaltiniai',
      'Nemunėlis',
      'Paluknys',
      'Ąžuolynas',
      'Varnupiai',
      'Rasupys',
      'Miškiniai',
      'Daugliai',
      'Smiltynė',
      'Kalnupiai',
      'Baltupys',
      'Rudginiai',
      'Vėjupiai',
      'Sakalynė',
      'Tilupiai',
      'Gervėnai',
      'Pušalotas',
      'Lieporiai',
      'Naujakiemis',
      'Šilėnai',
      'Beržupys'
    ],
    flags: ['LTU'],
    tiers: [
      {
        id: 'lituania-1',
        name: 'Lietuvos Krepšinio Lyga',
        shortName: 'LKL',
        teams: 12,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [70, 34],
        capacity: 6500
      },
      {
        id: 'lituania-2',
        name: 'Nacionalinė Lyga',
        shortName: 'NKL',
        teams: 12,
        playoffTeams: 0,
        playoffSeriesLength: 1,
        reputation: [30, 11],
        capacity: 2200
      }
    ]
  },
  {
    code: 'ABA',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['KK', 'BC'],
    cities: [
      'Bela Reka',
      'Zlatibrod',
      'Dunavgrad',
      'Kamenica',
      'Sutomorje',
      'Jezerski',
      'Vrbanja',
      'Lipovac',
      'Modrica Nova',
      'Podgora',
      'Slavonska Ves',
      'Trebinjac',
      'Kotorina',
      'Savski Breg',
      'Ravnogorje',
      'Drinopolje',
      'Vrelo Polje',
      'Brodarevac',
      'Jablanica Nova',
      'Krivaja',
      'Sutjeska Grad',
      'Banja Vrucica',
      'Orlovac',
      'Kupreško',
      'Mostina',
      'Zelenkovac',
      'Prigorje',
      'Grahovlje',
      'Tara Most',
      'Solinac'
    ],
    // La liga de los países adriáticos: una competición, varias banderas.
    flags: ['SRB', 'CRO', 'SLO', 'MNE', 'BIH'],
    tiers: [
      {
        id: 'adriatica-1',
        name: 'Liga Adriática',
        shortName: 'ABA',
        teams: 16,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [72, 36],
        capacity: 6800
      },
      {
        id: 'adriatica-2',
        name: 'Segunda Adriática',
        shortName: 'ABA2',
        teams: 14,
        playoffTeams: 0,
        playoffSeriesLength: 1,
        reputation: [32, 11],
        capacity: 2400
      }
    ]
  },
  {
    code: 'BNL',
    continent: 'EUR',
    rulesetId: 'fiba',
    prefixes: ['BC', 'Basketbal', 'BBC'],
    cities: [
      'Hoogveld',
      'Zandbergen',
      'Meerhout-Zuid',
      'Nieuwkerke',
      'Waterlo-Noord',
      'Duinstad',
      'Eikenhorst',
      'Steenwijkerdam',
      'Lierbeek',
      'Vlietvoorde',
      'Rozendaal',
      'Kanaalzicht',
      'Haverdijk',
      'Oostmolen',
      'Groenenburg',
      'Schelderode',
      'Veldhorst',
      'Bruggenhof'
    ],
    // Bélgica y Países Bajos juegan la misma liga, como la BNXT de verdad.
    flags: ['BEL', 'NED'],
    tiers: [
      {
        id: 'bnxt-1',
        name: 'Liga BeNe',
        shortName: 'BNXT',
        teams: 18,
        playoffTeams: 8,
        playoffSeriesLength: 3,
        reputation: [58, 28],
        capacity: 4200
      }
    ]
  },
  {
    code: 'ARG',
    continent: 'AME',
    rulesetId: 'fiba',
    prefixes: ['Club', 'Atlético', 'CA'],
    cities: [
      'Villa Esperanza',
      'San Rafael del Sur',
      'Punta Arenosa',
      'Los Naranjos',
      'Río Salado',
      'Colonia Belgrano',
      'Puerto Nuevo',
      'La Pampita',
      'Sierra Chica',
      'Monte Verde',
      'Costa Azul',
      'El Ombú',
      'Las Lomitas',
      'Santa Rosa del Este',
      'Valle Hermoso',
      'Bahía Grande',
      'Campo Alegre',
      'Cerro Azul',
      'Laguna Larga',
      'Tres Álamos'
    ],
    flags: ['ARG'],
    tiers: [
      {
        id: 'argentina-1',
        name: 'Liga Nacional Argentina',
        shortName: 'LNA',
        teams: 20,
        playoffTeams: 8,
        playoffSeriesLength: 5,
        reputation: [62, 30],
        capacity: 4500
      }
    ]
  },
  {
    code: 'CHI',
    continent: 'AME',
    rulesetId: 'fiba',
    prefixes: ['Club', 'CD', 'Deportivo'],
    cities: [
      'Puerto Frío',
      'Valle Andino',
      'Los Maitenes',
      'Quebrada Honda',
      'Bahía Mansa',
      'Cerro Blanco',
      'Río Claro',
      'Salitral',
      'Alto Lircay',
      'Punta Ñuble',
      'Lago Azul',
      'Villa Tricao'
    ],
    flags: ['CHI'],
    tiers: [
      {
        id: 'chile-1',
        name: 'Liga Nacional de Chile',
        shortName: 'LNCH',
        teams: 12,
        playoffTeams: 8,
        playoffSeriesLength: 3,
        reputation: [48, 22],
        capacity: 3000
      }
    ]
  },
  {
    code: 'USA',
    continent: 'AME',
    rulesetId: 'nba',
    prefixes: [''],
    cities: [
      'Redstone',
      'Bayshore',
      'Fairhaven',
      'Ironvale',
      'Lakemont',
      'Northgate',
      'Silver Creek',
      'Cedar Falls',
      'Grand Harbor',
      'Copper Ridge',
      'Willowbrook',
      'Stonebridge',
      'Easthaven',
      'Highpoint',
      'Riverton',
      'Pine Hollow',
      'Summit City',
      'Clearwater Bay',
      'Amberfield',
      'Rockport',
      'Greenhill',
      'Blue Harbor',
      'Foxborough',
      'Marblehead',
      'Sandcastle',
      'Thunder Valley',
      'Westport',
      'Golden Mesa',
      'Silverton',
      'Kingsport',
      'Redwood City',
      'Frostburg',
      'Lakeview Falls',
      'Cobalt Springs',
      'Mesquite',
      'Harborview',
      'Ridgefield',
      'Saltmarsh',
      'Two Rivers',
      'Pinecrest',
      'Brightwater',
      'Eagle Pass',
      'Coalton',
      'Windmere',
      'Fort Sable',
      'Larkspur'
    ],
    flags: ['USA'],
    tiers: [
      {
        id: 'usa-1',
        // La liga más rica del mundo. Aquí es una liga como las demás: las
        // conferencias, el draft y el tope salarial son otra pieza del roadmap.
        name: 'Liga Profesional Americana',
        shortName: 'LPA',
        teams: 30,
        playoffTeams: 8,
        playoffSeriesLength: 7,
        reputation: [92, 60],
        capacity: 18000
      },
      {
        id: 'usa-2',
        name: 'Liga de Desarrollo',
        shortName: 'LDA',
        teams: 16,
        playoffTeams: 8,
        playoffSeriesLength: 3,
        reputation: [45, 20],
        capacity: 3500
      }
    ]
  },
  {
    code: 'AUS',
    continent: 'OCE',
    rulesetId: 'fiba',
    prefixes: ['BC', 'Basketball Club'],
    cities: [
      'Port Kembala',
      'Wallaroo Bay',
      'Mount Tarra',
      'Kangaroo Flats',
      'Coral Point',
      'Riverina Heights',
      'Bendooley',
      'Southern Cross',
      'Gippsvale',
      'Yarrabin'
    ],
    flags: ['AUS'],
    tiers: [
      {
        id: 'australia-1',
        name: 'National Basketball League',
        shortName: 'NBL',
        teams: 10,
        playoffTeams: 4,
        playoffSeriesLength: 5,
        reputation: [60, 34],
        capacity: 7000
      }
    ]
  }
];

/** Los clubes de un país que no es España: los que genera este mapa. */
export const GENERATED_COUNTRIES = WORLD.filter((country) => country.code !== 'ESP');

export interface ContinentalCompetition {
  id: string;
  name: string;
  shortName: string;
  continent: 'EUR' | 'AME' | 'OCE';
  /** 1 es la mejor del continente; la 2 recoge a los que no entran en ella. */
  tier: number;
}

/**
 * Las competiciones de clubes por encima de las ligas.
 *
 * Tres escalones en Europa, como en la realidad, y uno en América. Se llenan por
 * orden: los mejores del continente van a la primera, los siguientes a la
 * segunda, y así. Todas se juegan con el mismo formato —fase de liga a una
 * vuelta, cuartos y Final Four— porque lo que las distingue es contra quién
 * juegas y cuánto paga, no el reglamento.
 */
export const CONTINENTAL_COMPETITIONS: ContinentalCompetition[] = [
  { id: 'euroliga', name: 'Euroliga', shortName: 'EL', continent: 'EUR', tier: 1 },
  { id: 'eurocup', name: 'Eurocup', shortName: 'EC', continent: 'EUR', tier: 2 },
  { id: 'europe-league', name: 'Europe League', shortName: 'ELG', continent: 'EUR', tier: 3 },
  { id: 'american-league', name: 'American League', shortName: 'AML', continent: 'AME', tier: 1 }
];
