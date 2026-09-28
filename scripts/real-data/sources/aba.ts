import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { toNationCode } from '../lib/nationalities';
import { plausibleBirthDate, usualFirstName } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type {
  SourceCoach,
  SourceLeague,
  SourcePlayer,
  SourcePosition,
  SourceStats,
  SourceTeam
} from '../lib/source-types';
import {
  abaNationality,
  abaPosition,
  aggregateAbaBoxScores,
  parseAbaBoxScore,
  parseAbaRoster,
  parseAbaStandings,
  plainName,
  speakersByTeam,
  splitAbaName,
  type AbaGame,
  type AbaRosterPlayer,
  type AbaStanding
} from './aba-parse';

/**
 * Extractor de la Liga Adriática y de su segunda división.
 *
 *   pnpm real:aba            usa la caché de descargas
 *   pnpm real:aba --force    lo vuelve a descargar todo
 *
 * ABA (`adriatica-1`), de aba-liga.com:
 * - La 2025-26 tuvo 18 equipos y la liga del juego tiene 16: las dos
 *   invitaciones de fuera de la región, U-BT Cluj-Napoca (Rumanía) y BC Vienna
 *   (Austria), se valoran con los demás y no entran (`excluded`). Dubai
 *   Basketball (Emiratos), el campeón, sí.
 * - Liga regular: la fase de grupos (dos grupos de 9, 16 partidos cada club),
 *   las actas 1 a 144. El Top 8 y el Play-out que vinieron después cruzan los
 *   grupos y no son iguales para todos: no cuentan. El puesto final sí es el
 *   de esa segunda fase (Top 8 del 1 al 8, Play-out del 9 al 18), que es la
 *   clasificación oficial.
 *
 * ABA2 (`adriatica-2`), de druga.aba-liga.com (la misma aplicación):
 * - 16 equipos para 14 plazas: los dos macedonios (MZT y TFT Skopje) no
 *   entran, porque Macedonia del Norte no es de la liga del juego.
 * - Liga regular: 8 partidos por club (actas 1 a 64), por sorteo.
 *
 * Las dos: la plantilla de cada club en la temporada (con los que se
 * fueron); los entrenadores, a mano (`aba-entrenadores.json`,
 * `aba2-entrenadores.json`): la web no los da, sólo lo que dijeron después de
 * cada partido, que sirve para avisar. Cada club lleva su país
 * (`SourceTeam.country`). Un segundo y medio entre peticiones.
 */

const SEASON_START_YEAR = 2025;
/** La temporada 2025-26 en las rutas de la web. */
const SEASON = '25';

interface TeamInfo {
  slug: string;
  name: string;
  shortName: string;
  /** País del club (COI). */
  country: string;
  city: string;
  pavilion: string;
  /** Aforo de la Wikipedia; `null` si no se sabe (lo estima el montaje). */
  capacity: number | null;
}

interface LeagueConfig {
  label: string;
  competitionId: string;
  name: string;
  shortName: string;
  site: string;
  /** La competición en las rutas: 1 la ABA, 2 la ABA2. */
  competition: string;
  firstGame: number;
  lastGame: number;
  /** Partidos de liga regular de cada club. */
  games: number;
  teams: Record<string, TeamInfo>;
  excluded: string[];
  coachesFile: string;
}

/**
 * Los clubes de la ABA, por id de la web (no cambia de una temporada a otra):
 * nombre sin patrocinador (se quedan las marcas que son del club: Cedevita
 * Olimpija, U-BT Cluj-Napoca, Dubai Basketball), la abreviatura del
 * calendario, el país, la ciudad y el pabellón con el aforo de la Wikipedia
 * inglesa («2025–26 ABA League First Division»).
 */
const ABA_TEAMS: Record<string, TeamInfo> = {
  '95': {
    slug: 'dubai-basketball',
    name: 'Dubai Basketball',
    shortName: 'DUB',
    country: 'UAE',
    city: 'Dubai',
    pavilion: 'Coca-Cola Arena',
    capacity: 17_000
  },
  '22': {
    slug: 'partizan-mozzart-bet',
    name: 'Partizan',
    shortName: 'PAR',
    country: 'SRB',
    city: 'Beograd',
    pavilion: 'Beogradska arena',
    capacity: 18_386
  },
  '18': {
    slug: 'crvena-zvezda-meridianbet',
    name: 'Crvena zvezda',
    shortName: 'CZV',
    country: 'SRB',
    city: 'Beograd',
    pavilion: 'Hala Aleksandar Nikolić',
    capacity: 8_000
  },
  '12': {
    slug: 'buducnost-voli',
    name: 'Budućnost',
    shortName: 'BUD',
    country: 'MNE',
    city: 'Podgorica',
    pavilion: 'Sportski centar Morača',
    capacity: 6_000
  },
  '100': {
    slug: 'u-bt-cluj-napoca',
    name: 'U-BT Cluj-Napoca',
    shortName: 'CLU',
    country: 'ROU',
    city: 'Cluj-Napoca',
    pavilion: 'BT Arena',
    capacity: 10_000
  },
  '66': {
    slug: 'cedevita-olimpija',
    name: 'Cedevita Olimpija',
    shortName: 'COL',
    country: 'SLO',
    city: 'Ljubljana',
    pavilion: 'Arena Stožice',
    capacity: 12_480
  },
  '1': {
    slug: 'bosna-bh-telecom',
    name: 'Bosna',
    shortName: 'BOS',
    country: 'BIH',
    city: 'Sarajevo',
    pavilion: 'Olimpijska dvorana Zetra',
    capacity: 12_000
  },
  '30': {
    slug: 'igokea-m-tel',
    name: 'Igokea',
    shortName: 'IGO',
    country: 'BIH',
    city: 'Aleksandrovac',
    pavilion: 'Sportska dvorana Laktaši',
    capacity: 3_050
  },
  '91': {
    slug: 'spartak-office-shoes',
    name: 'Spartak',
    shortName: 'SPA',
    country: 'SRB',
    city: 'Subotica',
    pavilion: 'Dudova šuma',
    capacity: 2_000
  },
  '3': {
    slug: 'zadar',
    name: 'Zadar',
    shortName: 'ZAD',
    country: 'CRO',
    city: 'Zadar',
    pavilion: 'Dvorana Krešimir Ćosić',
    capacity: 7_997
  },
  '33': {
    slug: 'mega-superbet',
    name: 'Mega',
    shortName: 'MEG',
    country: 'SRB',
    city: 'Beograd',
    pavilion: 'Hala sportova Ranko Žeravica',
    capacity: 5_000
  },
  '17': {
    slug: 'fmp',
    name: 'FMP',
    shortName: 'FMP',
    country: 'SRB',
    city: 'Beograd',
    pavilion: 'Hala Železnik',
    capacity: 3_000
  },
  '10': {
    slug: 'krka',
    name: 'Krka',
    shortName: 'KRK',
    country: 'SLO',
    city: 'Novo Mesto',
    pavilion: 'Dvorana Leona Štuklja',
    capacity: 2_500
  },
  '92': {
    slug: 'perspektiva-ilirija',
    name: 'Ilirija',
    shortName: 'ILI',
    country: 'SLO',
    city: 'Ljubljana',
    pavilion: 'Hala Tivoli',
    capacity: 6_800
  },
  '101': {
    slug: 'vienna',
    name: 'BC Vienna',
    shortName: 'VIE',
    country: 'AUT',
    city: 'Wien',
    pavilion: 'Hallmann Dome',
    capacity: 1_399
  },
  '74': {
    slug: 'sc-derby',
    name: 'SC Derby',
    shortName: 'SCD',
    country: 'MNE',
    city: 'Podgorica',
    pavilion: 'Sportski centar Morača',
    capacity: 6_000
  },
  '43': {
    slug: 'borac-mozzart',
    name: 'Borac Čačak',
    shortName: 'BOR',
    country: 'SRB',
    city: 'Čačak',
    pavilion: 'Hala Borac',
    capacity: 4_000
  },
  '7': {
    slug: 'split',
    name: 'Split',
    shortName: 'SPL',
    country: 'CRO',
    city: 'Split',
    pavilion: 'Arena Gripe',
    capacity: 3_500
  }
};

/**
 * Los clubes de la ABA2, por id (el mismo espacio de ids que la ABA): nombre
 * sin patrocinador, abreviatura del calendario, país, ciudad y el pabellón de
 * sus actas. Ni la web ni la Wikipedia dan aforos: los estima el montaje.
 */
const ABA2_TEAMS: Record<string, TeamInfo> = {
  '6': team('hkk-siroki-tt-kabeli', 'Široki', 'SIR', 'BIH', 'Široki Brijeg', 'Dvorana Pecara'),
  '70': team('zlatibor-mozzart', 'Zlatibor', 'ZLA', 'SRB', 'Čajetina', 'Sportska dvorana Čajetina'),
  '37': team(
    'sutjeska-elektroprivreda',
    'Sutjeska',
    'SUT',
    'MNE',
    'Nikšić',
    'Sportski centar Nikšić'
  ),
  '82': team('vojvodina-mts', 'Vojvodina', 'VOJ', 'SRB', 'Novi Sad', 'SPENS'),
  '20': team(
    'kansai-helios-domzale',
    'Helios Suns',
    'HEL',
    'SLO',
    'Domžale',
    'Športna dvorana Domžale'
  ),
  '48': team('sloboda-energoinvest', 'Sloboda Tuzla', 'SLT', 'BIH', 'Tuzla', 'SKPC Mejdan'),
  '87': team('tft-skopje', 'TFT Skopje', 'TFT', 'MKD', 'Skopje', 'SRC Kale'),
  '102': team('jahorina-pale', 'Jahorina', 'JAH', 'BIH', 'Pale', 'SPC Peki'),
  '76': team('borac-wwin', 'Borac Banja Luka', 'BBL', 'BIH', 'Banja Luka', 'SC Borik'),
  '32': team('mzt-skopje-aerodrom', 'MZT Skopje', 'MZT', 'MKD', 'Skopje', 'SC Jane Sandanski'),
  '104': team('primorje-1945', 'Primorje', 'PRM', 'MNE', 'Herceg Novi', 'Sportski centar Igalo'),
  '103': team(
    'student-m-tel',
    'Student Igokea',
    'STU',
    'BIH',
    'Aleksandrovac',
    'SC Nenad Baštinac'
  ),
  '21': team('vrsac-meridianbet', 'Vršac', 'VRS', 'SRB', 'Vršac', 'Millennium centar'),
  '38': team('mornar-barsko-zlato', 'Mornar', 'MOR', 'MNE', 'Bar', 'SRC Topolica'),
  '75': team('podgorica-bemax', 'Podgorica', 'POD', 'MNE', 'Podgorica', 'Bemax Arena'),
  '107': team('radnicki', 'Radnički Kragujevac', 'RDK', 'SRB', 'Kragujevac', 'Hala Jezero')
};

function team(
  slug: string,
  name: string,
  shortName: string,
  country: string,
  city: string,
  pavilion: string
): TeamInfo {
  return { slug, name, shortName, country, city, pavilion, capacity: null };
}

const LEAGUES: LeagueConfig[] = [
  {
    label: 'ABA',
    competitionId: 'adriatica-1',
    name: 'ABA League',
    shortName: 'ABA',
    site: 'https://www.aba-liga.com',
    competition: '1',
    firstGame: 1,
    lastGame: 144,
    games: 16,
    teams: ABA_TEAMS,
    // Las dos invitaciones de fuera de la región: U-BT Cluj-Napoca y BC Vienna.
    excluded: ['100', '101'],
    coachesFile: 'aba-entrenadores.json'
  },
  {
    label: 'ABA2',
    competitionId: 'adriatica-2',
    name: 'ABA League 2',
    shortName: 'ABA2',
    site: 'https://druga.aba-liga.com',
    competition: '2',
    firstGame: 1,
    lastGame: 64,
    games: 8,
    teams: ABA2_TEAMS,
    // Los dos de Macedonia del Norte, que no es de la liga del juego.
    excluded: ['32', '87'],
    coachesFile: 'aba2-entrenadores.json'
  }
];

/* ------------------------------------------------------------ a mano */

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `aba-entrenadores.json` / `aba2-entrenadores.json`: `inicio`, por id de
 *   club, el primer entrenador de la temporada (nombre de uso con sus tildes,
 *   nacimiento como la FEB «dd/mm/aaaa», `nationality`, la fuente y
 *   `despues`), y `enActa` si las declaraciones de la web lo escriben de otra
 *   forma («Janis Sferopulos»). Sin fecha, el juego se lo inventa.
 * - `aba-jugadores.json`: `jugadores`, por id de jugador de la web (el mismo en
 *   las dos ligas), lo que la web da mal o no da: nombre de uso o con sus
 *   diacríticos (`firstName`, `lastName`) y, si hace falta, `birthDate`
 *   (AAAA-MM-DD), `nationality` (COI), `heightCm` o `position`.
 */
type CoachEntry = ManualCoach & { despues?: string; enActa?: string };

interface CoachesManual {
  inicio: Record<string, CoachEntry>;
}

interface PlayerFix {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number;
  position?: SourcePosition;
}

const PLAYERS = loadManualJson<{ jugadores: Record<string, PlayerFix> }>('aba-jugadores.json', {
  jugadores: {}
});

type Log = (message: string) => void;
type Warn = (message: string) => void;

/* ------------------------------------------------------ entrenadores */

function manualCoach(
  manual: CoachesManual,
  teamId: string,
  teamName: string,
  speakers: readonly string[],
  warn: Warn,
  log: Log
): SourceCoach | null {
  if (speakers.length > 1)
    log(`  ${teamName}: hablan después de los partidos ${speakers.join(', ')}`);
  const entry = manual.inicio[teamId];
  if (!entry) {
    warn(
      `${teamName}: sin entrenador a mano${speakers[0] ? ` (el primero que habla: ${speakers[0]})` : ''}; se inventa`
    );
    return null;
  }
  const known = [entry.enActa, `${entry.firstName} ${entry.lastName}`]
    .filter((name): name is string => Boolean(name))
    .map(plainName);
  if (speakers[0] && !known.includes(plainName(speakers[0]))) {
    warn(
      `${teamName}: el primero que habla es ${speakers[0]} y a mano está ${entry.firstName} ${entry.lastName}`
    );
  }
  const coach = coachFromManual(entry, `equipo-${teamId}`);
  if (!coach.birthDate && coach.age === null) {
    log(
      `  ${teamName}: ${entry.firstName} ${entry.lastName} sin fecha; el juego se inventa el entrenador`
    );
  }
  if (!coach.nationality) warn(`${teamName}: entrenador sin nacionalidad`);
  return coach;
}

/* -------------------------------------------------------- extracción */

/** El puesto final: el de la tabla de la segunda fase (ABA) o el de la única (ABA2). */
function finalPositions(
  config: LeagueConfig,
  html: string
): {
  final: Map<string, AbaStanding & { position: number }>;
  regular: AbaStanding[];
} {
  const tables = parseAbaStandings(html);
  const final = new Map<string, AbaStanding & { position: number }>();
  let regular: AbaStanding[];
  if (config.competition === '1') {
    const top = tables.find((table) => /^Top 8/i.test(table.title));
    const playout = tables.find((table) => /^Play-out/i.test(table.title));
    if (!top || !playout) throw new Error('ABA: no están las tablas del Top 8 y del Play-out.');
    for (const row of top.rows) final.set(row.teamId, { ...row, position: row.rank });
    for (const row of playout.rows) {
      final.set(row.teamId, { ...row, position: top.rows.length + row.rank });
    }
    regular = tables.filter((table) => /^Group/i.test(table.title)).flatMap((table) => table.rows);
  } else {
    const table = tables.find((entry) => /Regular Season/i.test(entry.title)) ?? tables[0];
    if (!table) throw new Error('ABA2: no está la clasificación.');
    for (const row of table.rows) final.set(row.teamId, { ...row, position: row.rank });
    regular = table.rows;
  }
  return { final, regular };
}

async function extractLeague(
  client: HttpClient,
  config: LeagueConfig,
  log: Log
): Promise<SourceLeague> {
  const warnings: string[] = [];
  const warn: Warn = (message) => {
    warnings.push(message);
    log(`  aviso ${config.label}: ${message}`);
  };
  const base = `${config.site}`;
  const path = `${SEASON}/${config.competition}`;
  log(`${config.label} 2025-26: clasificación…`);
  const { final, regular } = finalPositions(
    config,
    await client.get(`${base}/standings/${path}/`, {
      accept: (body) => body.includes('league_standings_table')
    })
  );
  if (final.size !== Object.keys(config.teams).length) {
    throw new Error(`${config.label}: la clasificación trae ${final.size} equipos.`);
  }

  log(`${config.label}: ${config.lastGame - config.firstGame + 1} actas de liga regular…`);
  const games: AbaGame[] = [];
  for (let id = config.firstGame; id <= config.lastGame; id++) {
    const game = parseAbaBoxScore(
      await client.get(`${base}/match/${id}/${path}/Boxscore/`, {
        accept: (body) => body.includes('match_boxscore_team_table')
      }),
      String(id)
    );
    if (!game) {
      warn(`acta ${id}: no se ha podido leer`);
      continue;
    }
    for (const side of [game.home, game.away]) {
      const lines = game.lines.filter((line) => line.teamId === side.teamId);
      const points = lines.reduce((sum, line) => sum + line.points, 0);
      if (points !== side.score) {
        warn(`acta ${id}: ${side.name} suma ${points} y el tanteo es ${side.score}`);
      }
      const starters = lines.filter((line) => line.starter).length;
      if (starters !== 5) warn(`acta ${id}: ${side.name} con ${starters} titulares`);
    }
    games.push(game);
  }
  const statsByTeam = new Map<string, Map<string, SourceStats>>();
  for (const entry of aggregateAbaBoxScores(games.flatMap((game) => game.lines))) {
    const teamStats = statsByTeam.get(entry.teamId) ?? new Map<string, SourceStats>();
    teamStats.set(entry.playerId, entry.stats);
    statsByTeam.set(entry.teamId, teamStats);
  }
  // Cómo escribe el acta a cada jugador («Mubaarak Brantley K.») y su último dorsal.
  const boxNames = new Map<string, { shortName: string; shirtNumber: number | null }>();
  for (const line of games.flatMap((game) => game.lines)) {
    boxNames.set(`${line.playerId}|${line.teamId}`, {
      shortName: line.shortName,
      shirtNumber: line.shirtNumber
    });
  }
  const speakers = speakersByTeam(games);
  const coaches = loadManualJson<CoachesManual>(config.coachesFile, { inicio: {} });

  const teams: SourceTeam[] = [];
  const ordered = [...final.values()].sort((a, b) => a.position - b.position);
  for (const standing of ordered) {
    const info = config.teams[standing.teamId];
    if (!info)
      throw new Error(`${config.label}: club desconocido ${standing.teamId} (${standing.name})`);
    log(`${config.label} ${standing.position}. ${info.name}`);
    const teamGames = games.filter(
      (game) => game.home.teamId === standing.teamId || game.away.teamId === standing.teamId
    );
    if (teamGames.length !== config.games) {
      warn(`${info.name}: ${teamGames.length} actas y deberían ser ${config.games}`);
    }
    const wins = teamGames.filter((game) =>
      game.home.teamId === standing.teamId
        ? game.home.score > game.away.score
        : game.away.score > game.home.score
    ).length;
    const inTable = regular.find((row) => row.teamId === standing.teamId);
    if (inTable && inTable.wins !== wins) {
      warn(`${info.name}: ${wins} victorias en las actas y ${inTable.wins} en la clasificación`);
    }

    const roster = parseAbaRoster(
      await client.get(`${base}/team/${standing.teamId}/${path}/0/${info.slug}/`, {
        accept: (body) => body.includes('Roster, Season')
      })
    );
    if (roster.length === 0) warn(`${info.name}: sin plantilla`);
    const teamStats = statsByTeam.get(standing.teamId) ?? new Map<string, SourceStats>();
    for (const playerId of teamStats.keys()) {
      if (!roster.some((entry) => entry.playerId === playerId)) {
        warn(`${info.name}: el jugador ${playerId} jugó y no está en la plantilla; no entra`);
      }
    }
    const players = roster.map((listed) =>
      abaPlayer(
        listed,
        teamStats.get(listed.playerId) ?? null,
        boxNames.get(`${listed.playerId}|${standing.teamId}`) ?? null,
        info,
        warn,
        log
      )
    );

    teams.push({
      sourceId: standing.teamId,
      name: info.name,
      shortName: info.shortName,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: standing.position,
      players,
      coach: manualCoach(
        coaches,
        standing.teamId,
        info.name,
        speakers.get(standing.teamId) ?? [],
        warn,
        log
      ),
      country: info.country
    });
  }

  return {
    competitionId: config.competitionId,
    name: config.name,
    shortName: config.shortName,
    country: 'ABA',
    seasonStartYear: SEASON_START_YEAR,
    source: config.site,
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    excluded: config.excluded
  };
}

/**
 * Un jugador con lo de la plantilla, sus actas y lo puesto a mano. El nombre
 * de pila de la plantilla es el legal: se queda el primero (`usualFirstName`)
 * y el acta dice dónde empieza el apellido.
 */
function abaPlayer(
  listed: AbaRosterPlayer,
  stats: SourceStats | null,
  box: { shortName: string; shirtNumber: number | null } | null,
  info: TeamInfo,
  warn: Warn,
  log: Log
): SourcePlayer {
  const fix = PLAYERS.jugadores[listed.playerId];
  const split = splitAbaName(listed.fullName, box?.shortName ?? null, usualFirstName);
  const firstName = fix?.firstName ?? split.firstName;
  const lastName = fix?.lastName ?? split.lastName;
  const label = `${info.name}: ${firstName} ${lastName} (${listed.playerId})`;
  if (!fix?.firstName && `${firstName} ${lastName}` !== listed.fullName) {
    log(`  nombre de uso: ${info.name}: «${listed.fullName}» → «${firstName} ${lastName}»`);
  }
  const nationality =
    (fix?.nationality ? toNationCode(fix.nationality) : null) ??
    abaNationality(listed.nationalityRaw);
  if (!nationality) {
    warn(`${label}: nacionalidad «${listed.nationalityRaw ?? ''}» (se pone la del club)`);
  }
  const heightCm = fix?.heightCm ?? listed.heightCm;
  if (heightCm === null) warn(`${label}: sin altura`);
  const position = fix?.position ?? abaPosition(listed.positionRaw);
  if (!position)
    warn(`${label}: sin puesto${listed.positionRaw ? ` («${listed.positionRaw}»)` : ''}`);
  const rawBirth = fix?.birthDate ?? listed.birthDate;
  const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (!birthDate) warn(`${label}: sin fecha de nacimiento${rawBirth ? ` («${rawBirth}»)` : ''}`);
  return {
    sourceId: listed.playerId,
    firstName,
    lastName,
    nickname: null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: listed.nationalityRaw,
    position,
    positionRaw: listed.positionRaw,
    heightCm,
    weightKg: null,
    shirtNumber: box?.shirtNumber ?? null,
    licence: null,
    stats
  };
}

const log: Log = (message) => console.log(message);

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  // Las dos webs son la misma aplicación (y el mismo servidor): una detrás de otra.
  const client = createHttpClient({ minDelayMs: 1_500, force, log });
  for (const [slug, config] of [
    ['aba', LEAGUES[0]],
    ['aba2', LEAGUES[1]]
  ] as const) {
    const league = await extractLeague(client, config as LeagueConfig, log);
    const file = sourceFile(slug, SEASON_START_YEAR);
    writeSourceLeague(file, league);
    log('');
    log(summarizeLeague(league));
    log(file);
  }
  log(
    `\n${client.networkRequests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
