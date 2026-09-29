import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { plausibleBirthDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type {
  SourceCoach,
  SourceLeague,
  SourcePlayer,
  SourcePosition,
  SourceTeam
} from '../lib/source-types';
import {
  aggregateNblBoxScores,
  correctWithTotals,
  nblName,
  nblNationality,
  nblPosition,
  parseNblBoxScore,
  parseNblLeaders,
  parseNblMatches,
  parseNblPerson,
  parseNblRoster,
  rosettaData,
  slimNblMatch,
  TOTAL_FIELDS,
  type NblBoxLine,
  type NblMatch,
  type NblPerson,
  type NblPlayerStats,
  type NblSlimMatch,
  type NblTotals
} from './nbl-parse';

/**
 * Extractor de la NBL australiana (`australia-1`), la «NBL26».
 *
 *   pnpm real:nbl            usa la caché de descargas
 *   pnpm real:nbl --force    lo vuelve a descargar todo
 *
 * - Temporada 2025-26: fase regular del 18-09-2025 al 20-02-2026, 165
 *   partidos, 33 por club. Cuentan sólo esos: los de la Ignite Cup van
 *   dentro (cuentan para la liga); su final, el play-in y los playoffs, no.
 * - Diez clubes, los del juego; uno es de Nueva Zelanda (`country: 'NZL'`).
 *   Clasificación de la liga, fija aquí y comprobada con los partidos.
 * - Fuente: la API «Rosetta» de la web de la liga (datos de Synergy). Pide la
 *   cabecera `Origin` de la web. Las actas pesan más de 1 MB: se guardan en
 *   caché ya reducidas (`slimNblMatch`).
 * - Algunas actas se quedan cortas (la suma de los jugadores no llega al
 *   marcador): a quien jugó en ellas se le corrige con los totales oficiales
 *   de la temporada (`nbl/stats/leaders`), que incluyen los playoffs, así que
 *   se comparan con la suma de todas las actas de liga y playoffs.
 * - Quien jugó en dos clubes se queda en el que más minutos jugó.
 * - El puesto sale de la altura y del juego (`nblPosition`): la fuente sólo
 *   da G/F/C.
 * - Entrenadores: no están en la API; el del primer partido, a mano
 *   (`nbl-entrenadores.json`).
 */

const SEASON_START_YEAR = 2025;
const ROSETTA = 'https://prod.rosetta.nbl.com.au/get';
/** La temporada «NBL26» en Rosetta. */
const SEASON_ID = '1f8e4a79-e98b-457b-85a5-e4b898c6c0bd';
/** Sin esta cabecera la API contesta 403. */
const HEADERS = { Origin: 'https://www.nbl.com.au', Accept: 'application/json' };

const REGULAR_GAMES = 165;
const GAMES_PER_TEAM = 33;

interface ClubInfo {
  /** Id de Rosetta: el que pide la ruta de la plantilla. */
  rosettaId: string;
  position: number;
  wins: number;
  name: string;
  shortName: string;
  city: string;
  pavilion: string;
  capacity: number;
  /** País del club si no es Australia. */
  country?: string;
}

/**
 * Los diez, por id de Synergy (su `sourceId`): id de Rosetta, puesto y
 * victorias de la fase regular (desempate por porcentaje de puntos), nombre
 * sin patrocinio, abreviatura (la de la NBL, salvo la de Nueva Zelanda, que
 * es el código del país), ciudad, pabellón con su nombre actual y aforo (de
 * la Wikipedia: la API no lo da).
 */
const CLUBS: Record<string, ClubInfo> = {
  'bf06cec9-410c-11f0-8100-1b3c55488bbb': {
    rosettaId: '39fc4268-0cdf-455f-9ca1-12e344064000',
    position: 1,
    wins: 24,
    name: 'Sydney Kings',
    shortName: 'SYD',
    city: 'Sídney',
    pavilion: 'Qudos Bank Arena',
    capacity: 18_200
  },
  'bed4fbfb-410c-11f0-aaa8-1b3c55488bbb': {
    rosettaId: '3164912c-7e74-463b-8fc3-5f7d45edfcc6',
    position: 2,
    wins: 23,
    name: 'Adelaide 36ers',
    shortName: 'ADL',
    city: 'Adelaida',
    pavilion: 'Adelaide Entertainment Centre',
    capacity: 11_300
  },
  'bf90ae8e-410c-11f0-adfd-1b3c55488bbb': {
    rosettaId: '3bdb8ad6-7cf0-464d-b62c-eaca9145d06e',
    position: 3,
    wins: 22,
    name: 'South East Melbourne Phoenix',
    shortName: 'SEM',
    city: 'Melbourne',
    pavilion: 'John Cain Arena',
    capacity: 10_175
  },
  'befee10a-410c-11f0-b3f4-1b3c55488bbb': {
    rosettaId: 'bc5327d5-322e-4796-b103-4c3b63869edb',
    position: 4,
    wins: 21,
    name: 'Perth Wildcats',
    shortName: 'PER',
    city: 'Perth',
    pavilion: 'RAC Arena',
    capacity: 14_800
  },
  'bf6cf4f0-410c-11f0-8107-1b3c55488bbb': {
    rosettaId: '41c8f340-4d0a-4d68-a3c7-1b31f643f803',
    position: 5,
    wins: 20,
    name: 'Melbourne United',
    shortName: 'MEL',
    city: 'Melbourne',
    pavilion: 'John Cain Arena',
    capacity: 10_175
  },
  'bfab212e-410c-11f0-b95c-1b3c55488bbb': {
    rosettaId: '0602b1bc-8dfb-488c-ac11-7895de1a7556',
    position: 6,
    wins: 14,
    name: 'Tasmania JackJumpers',
    shortName: 'TAS',
    city: 'Hobart',
    pavilion: 'MyState Bank Arena',
    capacity: 4_340
  },
  'bedd705b-410c-11f0-8d69-1b3c55488bbb': {
    rosettaId: 'bbae77db-317d-4c17-aa04-75d53d20ad15',
    position: 7,
    wins: 13,
    name: 'New Zealand Breakers',
    shortName: 'NZB',
    city: 'Auckland',
    pavilion: 'Spark Arena',
    capacity: 9_740,
    country: 'NZL'
  },
  'bf59b516-410c-11f0-abf1-1b3c55488bbb': {
    rosettaId: '105249a3-251d-4a9d-94f4-f57b8e0854b3',
    position: 8,
    wins: 13,
    name: 'Illawarra Hawks',
    shortName: 'ILL',
    city: 'Wollongong',
    pavilion: 'WIN Entertainment Centre',
    capacity: 6_000
  },
  'bf4cfb88-410c-11f0-82f6-1b3c55488bbb': {
    rosettaId: '6bf2a6e3-2626-491d-962b-48805205c06e',
    position: 9,
    wins: 9,
    name: 'Cairns Taipans',
    shortName: 'CNS',
    city: 'Cairns',
    pavilion: 'Cairns Convention Centre',
    capacity: 5_300
  },
  'bf3d7137-410c-11f0-8229-1b3c55488bbb': {
    rosettaId: 'f8185bc5-2674-4293-a2a7-aeb8c7549b30',
    position: 10,
    wins: 6,
    name: 'Brisbane Bullets',
    shortName: 'BRI',
    city: 'Brisbane',
    pavilion: 'Brisbane Entertainment Centre',
    capacity: 10_500
  }
};

/* ------------------------------------------------------------ a mano */

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `nbl-entrenadores.json`: `inicio`, por abreviatura del club, el primer
 *   entrenador: nombre, nacimiento («dd/mm/aaaa») o, sin fecha, la edad
 *   (`age`, regla del 1 de julio), `nationality`, la fuente y `despues`.
 * - `nbl-jugadores.json`: `jugadores`, por id de Synergy, lo que la API no da
 *   o da mal: `firstName`, `lastName`, `birthDate`, `nationality`,
 *   `heightCm` o `position`.
 */
type CoachEntry = ManualCoach & { despues?: string; fuente?: string };

interface PlayerFix {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number;
  position?: SourcePosition;
}

const PLAYERS = loadManualJson<{ jugadores: Record<string, PlayerFix> }>('nbl-jugadores.json', {
  jugadores: {}
});
const COACHES = loadManualJson<{ inicio: Record<string, CoachEntry> }>('nbl-entrenadores.json', {
  inicio: {}
});

type Log = (message: string) => void;

/* ---------------------------------------------------------- descargas */

async function rosetta(client: HttpClient, path: string, minRows = 1): Promise<string> {
  return client.get(`${ROSETTA}/${path}`, {
    headers: HEADERS,
    accept: (body) => (rosettaData(body)?.length ?? 0) >= minRows
  });
}

/**
 * El acta de un partido, reducida. Se descarga sin caché (pesa más de 1 MB)
 * y se guarda la versión reducida en la caché con la URL de siempre.
 */
async function matchBox(
  client: HttpClient,
  matchId: string,
  force: boolean
): Promise<NblSlimMatch> {
  const url = `${ROSETTA}/match/${matchId}/live/all`;
  if (!force && client.isCached(url)) {
    return JSON.parse(await client.get(url)) as NblSlimMatch;
  }
  const body = await client.get(url, {
    headers: HEADERS,
    noCache: true,
    accept: (text) => slimNblMatch(text) !== null
  });
  const slim = slimNblMatch(body)!;
  client.store(url, {}, JSON.stringify(slim));
  return slim;
}

/* ------------------------------------------------------ entrenadores */

function teamCoach(shortName: string, teamName: string, warn: Log, log: Log): SourceCoach | null {
  const entry = COACHES.inicio[shortName];
  if (!entry) {
    warn(`${teamName}: sin entrenador a mano; se inventa`);
    return null;
  }
  if (entry.despues)
    log(`  ${teamName}: empezó ${entry.firstName} ${entry.lastName}; después, ${entry.despues}`);
  const coach = coachFromManual(entry, `club-${shortName}`);
  if (!coach.birthDate && coach.age === null)
    warn(`${teamName}: ${entry.firstName} ${entry.lastName} sin fecha ni edad; se inventa`);
  if (!coach.nationality) warn(`${teamName}: entrenador sin nacionalidad`);
  return coach;
}

/* ---------------------------------------------------------- jugadores */

function nblPlayer(
  entry: NblPlayerStats,
  person: NblPerson | null,
  club: ClubInfo,
  warn: Log
): SourcePlayer {
  const fix = PLAYERS.jugadores[entry.personId];
  const named = nblName(
    person?.firstName || entry.line.firstName,
    person?.lastName || entry.line.lastName
  );
  const firstName = fix?.firstName ?? named.firstName;
  const lastName = fix?.lastName ?? named.lastName;
  const minutes = Math.round(entry.stats.seconds / 60);
  const label = `${club.name}: ${firstName} ${lastName} (${entry.personId}, ${minutes} min)`;
  if (!person) warn(`${label}: sin ficha en la API`);

  const fromSource = nblNationality(person?.nationalityRaw);
  const manualNation = fix?.nationality ? nblNationality(fix.nationality) : null;
  // Sin nacionalidad, la del club.
  const nationality = manualNation ?? fromSource ?? club.country ?? 'AUS';
  if (!fromSource && !manualNation) {
    warn(
      `${label}: nacionalidad «${person?.nationalityRaw ?? 'vacía'}» sin reconocer; se pone ${nationality}`
    );
  }
  const heightCm = fix?.heightCm ?? person?.heightCm ?? null;
  if (heightCm === null && minutes >= 100) warn(`${label}: sin altura`);
  const position = fix?.position ?? nblPosition(person?.positionRaw, heightCm, entry.stats);
  const rawBirth = fix?.birthDate ?? person?.birthDate ?? null;
  const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
  if (!birthDate) warn(`${label}: sin fecha de nacimiento${rawBirth ? ` («${rawBirth}»)` : ''}`);
  return {
    sourceId: entry.personId,
    firstName,
    lastName,
    nickname: null,
    birthDate,
    age: null,
    nationality,
    nationalityRaw: fix?.nationality ?? person?.nationalityRaw ?? null,
    position,
    positionRaw: person?.positionRaw ?? null,
    heightCm,
    weightKg: person?.weightKg ?? null,
    shirtNumber: entry.line.shirtNumber ?? person?.shirtNumber ?? null,
    licence: null,
    stats: entry.stats
  };
}

/* -------------------------------------------------------- extracción */

const log: Log = (message) => console.log(message);

function emptyTotals(personId: string, teamId: string): NblTotals {
  const totals = { personId, teamId } as NblTotals;
  for (const field of TOTAL_FIELDS) totals[field] = 0;
  return totals;
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const started = Date.now();
  const client = createHttpClient({ minDelayMs: 1_000, force, log, retries: 6 });
  const warnings: string[] = [];
  const warn: Log = (message) => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  // Todos los partidos de la temporada: los de liga cuentan; los de
  // playoffs sólo sirven para comparar con los totales oficiales.
  const matches = parseNblMatches(
    await rosetta(
      client,
      `nbl/matches/in/season/${SEASON_START_YEAR}/regular?limit=500&offset=0`,
      REGULAR_GAMES
    )
  );
  const regular = matches.filter((match) => match.type === 'regular');
  const finals = matches.filter((match) => match.type === 'final');
  log(
    `${matches.length} partidos: ${regular.length} de liga, ${finals.length} de playoffs y ` +
      `${matches.length - regular.length - finals.length} fuera de las dos (la final de la Ignite Cup)`
  );
  if (regular.length !== REGULAR_GAMES)
    warn(`${regular.length} partidos de liga y deberían ser ${REGULAR_GAMES}`);

  const record = new Map<string, { wins: number; games: number }>();
  for (const match of regular) {
    if (match.homeScore === null || match.awayScore === null) {
      warn(`${match.date} ${match.homeCode}–${match.awayCode}: sin resultado`);
      continue;
    }
    for (const [teamId, won] of [
      [match.homeId, match.homeScore > match.awayScore],
      [match.awayId, match.awayScore > match.homeScore]
    ] as const) {
      if (!CLUBS[teamId]) warn(`${match.date}: equipo desconocido ${teamId}`);
      const current = record.get(teamId) ?? { wins: 0, games: 0 };
      current.games++;
      if (won) current.wins++;
      record.set(teamId, current);
    }
  }

  log(`${regular.length + finals.length} actas…`);
  const lines: NblBoxLine[] = [];
  /** Lo sumado por jugador y club en liga y playoffs, para comparar con los totales oficiales. */
  const summed = new Map<string, NblTotals>();
  /** Jugador y club que jugaron en un acta que se queda corta. */
  const shortSides = new Set<string>();
  let missingPoints = 0;
  const label = (match: NblMatch): string =>
    `${match.date} ${CLUBS[match.homeId]?.name ?? match.homeCode}–${CLUBS[match.awayId]?.name ?? match.awayCode}`;
  for (const match of [...regular, ...finals]) {
    const box = parseNblBoxScore(await matchBox(client, match.id, force));
    const isRegular = match.type === 'regular';
    if (isRegular && !box.hasPlayByPlay)
      warn(
        `${label(match)}: sin jugada a jugada (faltas recibidas, mates y tapones recibidos a 0)`
      );
    for (const side of box.sides) {
      const played = side.lines.filter((line) => line.participated || line.seconds > 0);
      const points = played.reduce((sum, line) => sum + line.points, 0);
      const starters = played.filter((line) => line.starter).length;
      const name = CLUBS[side.teamId]?.name ?? side.teamId;
      if (isRegular && starters !== 5) warn(`${label(match)}: ${name} con ${starters} titulares`);
      if (points !== side.score) {
        warn(
          `${label(match)}: ${name} suma ${points} y el marcador es ${side.score}; se corrige con los totales oficiales`
        );
        missingPoints += side.score - points;
        for (const line of played) shortSides.add(`${line.personId}|${line.teamId}`);
      }
      for (const line of played) {
        const key = `${line.personId}|${line.teamId}`;
        const totals = summed.get(key) ?? emptyTotals(line.personId, line.teamId);
        for (const field of TOTAL_FIELDS) totals[field] += line[field];
        summed.set(key, totals);
        if (isRegular) lines.push(line);
      }
    }
  }

  const all = aggregateNblBoxScores(lines);

  // Las actas cortas, con los totales oficiales.
  if (shortSides.size > 0) {
    const official = new Map(
      parseNblLeaders(
        await rosetta(
          client,
          `nbl/stats/leaders/for/season/id/${SEASON_ID}?limit=500&offset=0`,
          100
        )
      ).map((row) => [`${row.personId}|${row.teamId}`, row])
    );
    let fixedPoints = 0;
    for (const entry of all) {
      const key = `${entry.personId}|${entry.teamId}`;
      if (!shortSides.has(key)) continue;
      const row = official.get(key);
      const sums = summed.get(key);
      if (!row || !sums) {
        warn(`${entry.line.firstName} ${entry.line.lastName}: sin totales oficiales`);
        continue;
      }
      const changed = correctWithTotals(entry.stats, row, sums);
      fixedPoints += changed.points ?? 0;
      if (Object.keys(changed).length > 0)
        log(
          `  ${entry.line.firstName} ${entry.line.lastName} (${CLUBS[entry.teamId]?.shortName}): ` +
            Object.entries(changed)
              .map(([field, delta]) => `${field} ${delta > 0 ? '+' : ''}${delta}`)
              .join(', ')
        );
    }
    log(`  actas cortas: faltaban ${missingPoints} puntos; corregidos ${fixedPoints}`);
    if (fixedPoints !== missingPoints)
      warn(`faltaban ${missingPoints} puntos en las actas y se han corregido ${fixedPoints}`);
  }

  // Cada persona en el club donde más minutos jugó.
  const kept = new Map<string, NblPlayerStats>();
  for (const entry of all) {
    if (!CLUBS[entry.teamId]) continue;
    const current = kept.get(entry.personId);
    if (!current || entry.stats.seconds > current.stats.seconds) kept.set(entry.personId, entry);
  }
  for (const entry of all) {
    const winner = kept.get(entry.personId);
    if (!winner || winner === entry) continue;
    log(
      `  ${entry.line.firstName} ${entry.line.lastName} jugó en ${CLUBS[entry.teamId]?.name} ` +
        `(${Math.round(entry.stats.seconds / 60)} min) y en ${CLUBS[winner.teamId]?.name} ` +
        `(${Math.round(winner.stats.seconds / 60)} min): se queda en el segundo`
    );
  }

  log('Plantillas…');
  const people = new Map<string, NblPerson>();
  for (const info of Object.values(CLUBS)) {
    const roster = parseNblRoster(
      await rosetta(
        client,
        `nbl/players/for/team/${info.rosettaId}/in/season/${SEASON_START_YEAR}?limit=500&offset=0`,
        10
      )
    );
    for (const person of roster)
      if (!people.has(person.personId)) people.set(person.personId, person);
  }
  for (const personId of kept.keys()) {
    if (people.has(personId)) continue;
    const person = parseNblPerson(await rosetta(client, `nbl/player/${personId}`));
    if (person) people.set(personId, person);
  }

  const teams: SourceTeam[] = [];
  const ordered = Object.entries(CLUBS).sort(([, a], [, b]) => a.position - b.position);
  for (const [teamId, info] of ordered) {
    const games = record.get(teamId) ?? { wins: 0, games: 0 };
    if (games.games !== GAMES_PER_TEAM)
      warn(`${info.name}: ${games.games} partidos y deberían ser ${GAMES_PER_TEAM}`);
    if (games.wins !== info.wins)
      warn(
        `${info.name}: ${games.wins} victorias en los partidos y ${info.wins} en la clasificación`
      );
    const players = [...kept.values()]
      .filter((entry) => entry.teamId === teamId)
      .sort((a, b) => b.stats.seconds - a.stats.seconds)
      .map((entry) => nblPlayer(entry, people.get(entry.personId) ?? null, info, warn));
    log(
      `${info.position}. ${info.name}: ${games.wins}-${games.games - games.wins}, ${players.length} jugadores`
    );
    teams.push({
      sourceId: teamId,
      name: info.name,
      shortName: info.shortName,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: info.position,
      players,
      coach: teamCoach(info.shortName, info.name, warn, log),
      ...(info.country ? { country: info.country } : {})
    });
  }

  const league: SourceLeague = {
    competitionId: 'australia-1',
    name: 'National Basketball League',
    shortName: 'NBL',
    country: 'AUS',
    seasonStartYear: SEASON_START_YEAR,
    source: 'https://www.nbl.com.au',
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
  const file = sourceFile('nbl', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(file);
  log(
    `\n${client.networkRequests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
