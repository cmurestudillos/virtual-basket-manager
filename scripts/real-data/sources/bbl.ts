import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { plausibleBirthDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  aggregateBblBoxScores,
  bblNationality,
  bblPosition,
  parseBblGame,
  parseBblTeamSeason,
  parseProaKader,
  parseProaPlayerPage,
  proaFirstName,
  proaNationality,
  proaCalendarName,
  proaRecord,
  splitCoachName,
  type BblCoachRow,
  type BblGame,
  type BblPlayerStats,
  type ProaPerson
} from './bbl-parse';

/**
 * Extractor de las dos ligas alemanas: la easyCredit BBL (`alemania-1`) y la
 * ProA (`alemania-2`).
 *
 *   pnpm real:bbl            usa la caché de descargas
 *   pnpm real:bbl --force    lo vuelve a descargar todo
 *
 * - **BBL** (easycredit-bbl.de): la página de cada equipo en la temporada
 *   (`/teams/<id>/2025`) da la plantilla, el pabellón con su aforo y el puesto;
 *   las estadísticas son la suma de las 306 actas de liga regular
 *   (`/spiele/<id>`, ids seguidos), porque los totales del equipo incluyen los
 *   playoffs. Del acta del primer partido de cada club sale su entrenador.
 *   Tres segundos entre peticiones: las páginas pesan casi un mega.
 * - **ProA** (2basketballbundesliga.de): la plantilla de cada equipo en la
 *   temporada (`/teams/kader/<id>`, por formulario) da cuerpo técnico,
 *   jugadores y estadísticas de liga regular. La 2025-26 tuvo 18 equipos y la
 *   liga del juego tiene 16: los dos que bajaron se valoran con su liga pero no
 *   entran (`excluded`).
 */

const BBL_SITE = 'https://www.easycredit-bbl.de';
const PROA_SITE = 'https://www.2basketballbundesliga.de';
const SEASON_START_YEAR = 2025;
/** La temporada 2025-26 en la BBL. */
const BBL_SEASON = 2025;
/** Y en el formulario de la ProA. */
const PROA_SEASON = '2025/2026';
/** Las actas de liga regular de la BBL 2025-26: 34 jornadas de 9, ids seguidos. */
const FIRST_GAME = 2003986;
const LAST_GAME = 2004291;
const ROUNDS = 34;

interface BblTeamInfo {
  name: string;
  city: string;
  /** El pabellón con su nombre de siempre; el aforo es el oficial de la temporada. */
  pavilion: string;
}

/**
 * Los clubes de la BBL, por id de la liga: nombre sin patrocinador puro (se
 * quedan las marcas que son del club, como en «Anadolu Efes»), ciudad y
 * pabellón.
 */
const BBL_TEAMS: Record<string, BblTeamInfo> = {
  '486': { name: 'FC Bayern München', city: 'Múnich', pavilion: 'BMW Park' },
  '413': { name: 'Alba Berlin', city: 'Berlín', pavilion: 'Uber Arena' },
  '420': { name: 'Bamberg Baskets', city: 'Bamberg', pavilion: 'Brose Arena' },
  '415': { name: 'Telekom Baskets Bonn', city: 'Bonn', pavilion: 'Telekom Dome' },
  '540': { name: 'Würzburg Baskets', city: 'Wurzburgo', pavilion: 'tectake Arena' },
  '418': { name: 'ratiopharm Ulm', city: 'Ulm', pavilion: 'ratiopharm arena' },
  '541': { name: 'Rasta Vechta', city: 'Vechta', pavilion: 'Rasta Dome' },
  '414': { name: 'Gladiators Trier', city: 'Tréveris', pavilion: 'SWT-Arena' },
  '551': { name: 'Rostock Seawolves', city: 'Rostock', pavilion: 'Stadthalle Rostock' },
  '433': { name: 'Riesen Ludwigsburg', city: 'Ludwigsburg', pavilion: 'MHPArena' },
  '430': { name: 'Baskets Oldenburg', city: 'Oldemburgo', pavilion: 'Große EWE Arena' },
  '485': { name: 'Niners Chemnitz', city: 'Chemnitz', pavilion: 'Messe Chemnitz' },
  '428': { name: 'Mitteldeutscher BC', city: 'Weißenfels', pavilion: 'Stadthalle Weißenfels' },
  '554': { name: 'Hamburg Towers', city: 'Hamburgo', pavilion: 'Inselpark Arena' },
  '426': { name: 'Skyliners Frankfurt', city: 'Fráncfort', pavilion: 'Süwag Energie Arena' },
  '483': { name: 'Science City Jena', city: 'Jena', pavilion: 'Sparkassen-Arena' },
  '422': { name: 'Löwen Braunschweig', city: 'Brunswick', pavilion: 'Volkswagen Halle' },
  '488': { name: 'Academics Heidelberg', city: 'Heidelberg', pavilion: 'SNP Dome' }
};

interface ProaTeamInfo {
  id: string;
  name: string;
  city: string;
  pavilion: string;
  capacity: number;
  /** Victorias en liga regular, para comprobar el orden. */
  wins: number;
}

/**
 * Los 18 de la ProA 2025-26 en el orden de la clasificación de liga regular
 * (la web sólo publica la de la temporada en curso; el orden, con sus
 * desempates, es el de la Wikipedia alemana «ProA 2025/26»), con nombre sin
 * patrocinador, ciudad, y pabellón y aforo de esa misma Wikipedia.
 */
const PROA_TEAMS: ProaTeamInfo[] = [
  {
    id: '473',
    name: 'Phoenix Hagen',
    city: 'Hagen',
    pavilion: 'Ischelandhalle',
    capacity: 3_145,
    wins: 28
  },
  {
    id: '446',
    name: 'Crailsheim Merlins',
    city: 'Crailsheim',
    pavilion: 'Arena Hohenlohe',
    capacity: 3_000,
    wins: 28
  },
  {
    id: '477',
    name: 'BG Göttingen',
    city: 'Gotinga',
    pavilion: 'Sparkassen-Arena',
    capacity: 3_447,
    wins: 23
  },
  {
    id: '439',
    name: 'Eisbären Bremerhaven',
    city: 'Bremerhaven',
    pavilion: 'Stadthalle Bremerhaven',
    capacity: 3_950,
    wins: 23
  },
  {
    id: '435',
    name: 'Artland Dragons',
    city: 'Quakenbrück',
    pavilion: 'Artland Arena',
    capacity: 3_000,
    wins: 21
  },
  {
    id: '527',
    name: 'Kirchheim Knights',
    city: 'Kirchheim unter Teck',
    pavilion: 'Sporthalle Stadtmitte',
    capacity: 1_800,
    wins: 20
  },
  {
    id: '421',
    name: 'Gießen 46ers',
    city: 'Gießen',
    pavilion: 'Sporthalle Gießen-Ost',
    capacity: 3_030,
    wins: 18
  },
  {
    id: '557',
    name: 'Karlsruhe Lions',
    city: 'Karlsruhe',
    pavilion: 'Europahalle',
    capacity: 3_024,
    wins: 17
  },
  {
    id: '447',
    name: 'Nürnberg Falcons',
    city: 'Núremberg',
    pavilion: 'KIA Metropol Arena',
    capacity: 3_881,
    wins: 16
  },
  {
    id: '425',
    name: 'BBC Bayreuth',
    city: 'Bayreuth',
    pavilion: 'Oberfrankenhalle',
    capacity: 3_050,
    wins: 15
  },
  {
    id: '436',
    name: 'VfL Bochum',
    city: 'Bochum',
    pavilion: 'Rundsporthalle Bochum',
    capacity: 1_536,
    wins: 15
  },
  {
    id: '556',
    name: 'RheinStars Köln',
    city: 'Colonia',
    pavilion: 'Motorworld Köln',
    capacity: 1_700,
    wins: 14
  },
  {
    id: '432',
    name: 'Tigers Tübingen',
    city: 'Tubinga',
    pavilion: 'Paul Horn-Arena',
    capacity: 3_132,
    wins: 13
  },
  {
    id: '569',
    name: 'Baskets Koblenz',
    city: 'Coblenza',
    pavilion: 'EPG Arena',
    capacity: 4_022,
    wins: 13
  },
  {
    id: '570',
    name: 'Börde Baskets',
    city: 'Wolmirstedt',
    pavilion: 'Wolfgang-Lakenmacher-Halle',
    capacity: 1_502,
    wins: 12
  },
  {
    id: '475',
    name: 'Paderborn Baskets',
    city: 'Paderborn',
    pavilion: 'Sportzentrum Maspernplatz',
    capacity: 1_999,
    wins: 12
  },
  {
    id: '416',
    name: 'Bayer Giants Leverkusen',
    city: 'Leverkusen',
    pavilion: 'Ostermann-Arena',
    capacity: 2_771,
    wins: 10
  },
  {
    id: '562',
    name: 'UBC Münster',
    city: 'Münster',
    pavilion: 'Sporthalle Berg Fidel',
    capacity: 3_000,
    wins: 8
  }
];

/** Los que bajaron a la ProB: se valoran con la ProA, pero no entran en el juego. */
const PROA_EXCLUDED = ['416', '562'];

const POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `bbl-entrenadores.json` / `proa-entrenadores.json`: `inicio`, por id de
 *   equipo, el entrenador que empezó la temporada, con nombre de uso,
 *   nacimiento como la FEB («dd/mm/aaaa Ciudad (País)») o `age`, `nationality`
 *   (COI), la fuente y `despues`. En la BBL manda el acta del primer partido
 *   (se avisa si el nombre no casa) y la fecha puede salir de la web; en la
 *   ProA no hay actas y la web no dice quién empezó.
 * - `bbl-nombres.json` / `proa-nombres.json`: `jugadores`, por id de la liga,
 *   lo que la fuente da mal: nombre con sus tildes o el de uso
 *   (`firstName`, `lastName`) y, si hace falta, `birthDate` (AAAA-MM-DD),
 *   `nationality` (COI) o `heightCm`.
 */
interface CoachesManual {
  inicio: Record<string, ManualCoach & { despues?: string; fuente?: string }>;
}

interface PlayerFix {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  nationality?: string;
  heightCm?: number;
}

interface PlayersManual {
  jugadores: Record<string, PlayerFix>;
}

const BBL_COACHES = loadManualJson<CoachesManual>('bbl-entrenadores.json', { inicio: {} });
const PROA_COACHES = loadManualJson<CoachesManual>('proa-entrenadores.json', { inicio: {} });
const BBL_PLAYERS = loadManualJson<PlayersManual>('bbl-nombres.json', { jugadores: {} });
const PROA_PLAYERS = loadManualJson<PlayersManual>('proa-nombres.json', { jugadores: {} });

const log = (message: string): void => console.log(message);

function plainName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/[^a-z]/g, '');
}

const sameName = (a: string, b: string): boolean => plainName(a) === plainName(b);

type Warn = (message: string) => void;

function bblGet(client: HttpClient, path: string, marker: string): Promise<string> {
  return client.get(`${BBL_SITE}${path}`, {
    accept: (body) => body.includes('__NEXT_DATA__') && body.includes(marker)
  });
}

function proaPost(client: HttpClient, path: string, marker: string): Promise<string> {
  return client.request(`${PROA_SITE}${path}`, {
    method: 'POST',
    form: { season: PROA_SEASON },
    accept: (body) => body.includes(marker)
  });
}

async function extractBbl(client: HttpClient, warn: Warn): Promise<SourceLeague> {
  log(`BBL ${SEASON_START_YEAR}-26: ${LAST_GAME - FIRST_GAME + 1} actas de liga regular…`);
  const games: BblGame[] = [];
  for (let id = FIRST_GAME; id <= LAST_GAME; id++) {
    const game = parseBblGame(await bblGet(client, `/spiele/${id}`, '"initialGameStats":{'));
    if (!game) {
      warn(`BBL: acta ${id} sin estadísticas`);
      continue;
    }
    if (game.stage !== 'MAIN_ROUND' || game.seasonId !== BBL_SEASON) {
      warn(`BBL: acta ${id} es «${game.stage ?? '?'}» de ${game.seasonId ?? '?'}`);
      continue;
    }
    for (const [teamId, score] of [
      [game.homeId, game.homeScore],
      [game.awayId, game.awayScore]
    ] as const) {
      const points = game.lines
        .filter((line) => line.teamId === teamId)
        .reduce((sum, line) => sum + line.points, 0);
      if (score !== null && points !== score) {
        warn(`BBL: acta ${id}: el equipo ${teamId} suma ${points} y el tanteo es ${score}`);
      }
    }
    games.push(game);
  }
  const statsByTeam = new Map<string, BblPlayerStats[]>();
  for (const entry of aggregateBblBoxScores(games.flatMap((game) => game.lines))) {
    statsByTeam.set(entry.teamId, [...(statsByTeam.get(entry.teamId) ?? []), entry]);
  }

  const teams: SourceTeam[] = [];
  for (const [teamId, info] of Object.entries(BBL_TEAMS)) {
    const page = parseBblTeamSeason(
      await bblGet(client, `/teams/${teamId}/${BBL_SEASON}`, '"seasonTeam"')
    );
    if (!page || page.seasonId !== BBL_SEASON) {
      throw new Error(`BBL: la página del equipo ${teamId} no es la de ${BBL_SEASON}.`);
    }
    log(`${page.rank ?? '?'}. ${info.name}`);
    const teamGames = games.filter((game) => game.homeId === teamId || game.awayId === teamId);
    if (teamGames.length !== ROUNDS) {
      warn(`${info.name}: ${teamGames.length} actas de liga regular y deberían ser ${ROUNDS}`);
    }
    const wins = teamGames.filter((game) => {
      const home = game.homeId === teamId;
      const [own, other] = home
        ? [game.homeScore, game.awayScore]
        : [game.awayScore, game.homeScore];
      return own !== null && other !== null && own > other;
    }).length;
    if (page.wins !== null && wins !== page.wins) {
      warn(`${info.name}: ${wins} victorias en las actas y ${page.wins} en la clasificación`);
    }

    const teamStats = statsByTeam.get(teamId) ?? [];
    const statsById = new Map(teamStats.map((entry) => [entry.playerId, entry]));
    const listed = new Set(page.players.map((player) => player.playerId));
    for (const entry of teamStats) {
      if (!listed.has(entry.playerId)) {
        warn(
          `${info.name}: ${entry.firstName} ${entry.lastName} (${entry.playerId}) ` +
            'jugó y no está en la plantilla; sin ficha'
        );
      }
    }

    const players: SourcePlayer[] = page.players.map((player) => {
      const fix = BBL_PLAYERS.jugadores[player.playerId];
      const firstName = fix?.firstName ?? player.firstName;
      const lastName = fix?.lastName ?? player.lastName;
      const label = `${info.name}: ${firstName} ${lastName} (${player.playerId})`;
      const nationality = fix?.nationality ?? bblNationality(player.nationalities);
      if (!nationality)
        warn(`${label}: nacionalidad no reconocida «${player.nationalities.join(',')}»`);
      const position = bblPosition(player.position);
      if (player.position && !position) warn(`${label}: puesto no reconocido «${player.position}»`);
      const rawBirth = fix?.birthDate ?? player.birthDate;
      const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
      if (rawBirth && !birthDate) warn(`${label}: fecha de nacimiento imposible «${rawBirth}»`);
      return {
        sourceId: player.playerId,
        firstName,
        lastName,
        nickname: null,
        birthDate,
        age: null,
        nationality,
        nationalityRaw: player.nationalities.join(',') || null,
        position,
        positionRaw: player.position,
        heightCm: fix?.heightCm ?? player.heightCm,
        weightKg: player.weightKg,
        shirtNumber: player.shirtNumber,
        licence: null,
        stats: statsById.get(player.playerId)?.stats ?? null
      };
    });

    if (!page.venue?.capacity) warn(`${info.name}: la web no da el aforo del pabellón`);
    teams.push({
      sourceId: teamId,
      name: info.name,
      shortName: null,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: page.venue?.capacity ?? null,
      finalPosition: page.rank,
      players,
      coach: bblCoachOf(teamId, teamGames, page.coaches, warn, info.name)
    });
  }
  teams.sort((a, b) => (a.finalPosition ?? 99) - (b.finalPosition ?? 99));

  return {
    competitionId: 'alemania-1',
    name: 'easyCredit BBL',
    shortName: 'BBL',
    country: 'GER',
    seasonStartYear: SEASON_START_YEAR,
    source: BBL_SITE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings: []
  };
}

/**
 * El entrenador del acta del primer partido de liga regular del club (por
 * fecha), con el nombre, la fecha y la nacionalidad del fichero a mano; la
 * fecha, si no está a mano, del cuerpo técnico de la web. Avisa de cada cambio.
 */
function bblCoachOf(
  teamId: string,
  teamGames: readonly BblGame[],
  staff: readonly BblCoachRow[],
  warn: Warn,
  label: string
): SourceCoach | null {
  const sequence: { date: string; name: string }[] = [];
  const byDate = [...teamGames].sort(
    (a, b) =>
      (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '') ||
      Number(a.gameId) - Number(b.gameId)
  );
  for (const game of byDate) {
    const name = game.homeId === teamId ? game.homeCoach : game.awayCoach;
    if (name && sequence[sequence.length - 1]?.name !== name) {
      sequence.push({ date: (game.scheduledTime ?? '?').slice(0, 10), name });
    }
  }
  if (sequence.length > 1) {
    warn(
      `${label}: entrenadores en las actas: ` +
        sequence.map((entry) => `${entry.name} (desde ${entry.date})`).join(', ')
    );
  }
  const first = sequence[0];
  if (!first) {
    warn(`${label}: sin entrenador en las actas`);
    return null;
  }
  const fromStaff = staff.find((row) => sameName(`${row.firstName} ${row.lastName}`, first.name));
  const manual = BBL_COACHES.inicio[teamId];
  if (!manual) {
    const name = splitCoachName(first.name);
    warn(`${label}: entrenador ${first.name} sin nacionalidad a mano`);
    return {
      sourceId: `equipo-${teamId}`,
      firstName: name.firstName,
      lastName: name.lastName,
      birthDate: fromStaff?.birthDate ?? null,
      age: null,
      nationality: null,
      nationalityRaw: null
    };
  }
  // Por el apellido: el acta quita las tildes y a veces usa otra forma del nombre.
  if (!sameName(manual.lastName, splitCoachName(first.name).lastName)) {
    warn(
      `${label}: el acta da a ${first.name} y a mano está ${manual.firstName} ${manual.lastName}`
    );
  }
  const coach = coachFromManual(manual, `equipo-${teamId}`);
  const birthDate = coach.birthDate ?? fromStaff?.birthDate ?? null;
  if (coach.birthDate && fromStaff?.birthDate && coach.birthDate !== fromStaff.birthDate) {
    warn(
      `${label}: ${first.name} nació el ${coach.birthDate} a mano y el ${fromStaff.birthDate} en la web`
    );
  }
  if (!birthDate && coach.age === null) warn(`${label}: entrenador ${first.name} sin fecha`);
  if (!coach.nationality) warn(`${label}: entrenador ${first.name} sin nacionalidad`);
  return { ...coach, birthDate, age: birthDate ? null : coach.age };
}

async function extractProa(client: HttpClient, warn: Warn): Promise<SourceLeague> {
  log(`\nProA ${SEASON_START_YEAR}-26: plantillas de los ${PROA_TEAMS.length} equipos…`);
  const teams: SourceTeam[] = [];
  let previousWins = Infinity;
  for (const [index, info] of PROA_TEAMS.entries()) {
    log(`${index + 1}. ${info.name}`);
    const kader = parseProaKader(await proaPost(client, `/teams/kader/${info.id}`, 'id="kader"'));
    if (kader.stats.length === 0) throw new Error(`ProA: ${info.name} sin estadísticas.`);
    if (kader.games.length !== 34) {
      warn(`${info.name}: ${kader.games.length} partidos de liga regular en su calendario`);
    }
    const calendarName = proaCalendarName(kader.games);
    const record = calendarName ? proaRecord(kader.games, calendarName) : null;
    if (!record || record.wins !== info.wins) {
      warn(
        `${info.name}: ${record?.wins ?? '?'} victorias en su calendario y ${info.wins} en PROA_TEAMS`
      );
    }
    if (info.wins > previousWins) warn(`${info.name}: PROA_TEAMS no está en orden de victorias`);
    previousWins = info.wins;

    const roster = kader.players.filter((person) => POSITIONS.has(person.role.toUpperCase()));
    const byId = new Map(
      roster.flatMap((person) => (person.personId ? [[person.personId, person]] : []))
    );
    const statsById = new Map(kader.stats.map((row) => [row.personId ?? '', row]));
    // Quien jugó y ya no sale en la plantilla, de su ficha.
    for (const row of kader.stats) {
      if (!row.personId || byId.has(row.personId)) continue;
      const bio = parseProaPlayerPage(
        await client.get(`${PROA_SITE}/teams/kader/spieler/${row.personId}`, {
          accept: (body) => body.includes('Geburtstag')
        })
      );
      const person: ProaPerson = {
        personId: row.personId,
        firstName: bio.firstName ?? row.name.split(' ')[0] ?? '',
        lastName: bio.lastName ?? row.name.split(' ').slice(1).join(' '),
        birthDate: bio.birthDate,
        role: bio.position ?? '',
        flag: null,
        country: bio.country,
        heightCm: bio.heightCm,
        weightKg: bio.weightKg,
        shirtNumber: null
      };
      roster.push(person);
      byId.set(row.personId, person);
    }

    const players: SourcePlayer[] = roster.map((person) => {
      const id = person.personId ?? `${info.id}-${person.lastName}`;
      const fix = PROA_PLAYERS.jugadores[id];
      const firstName = fix?.firstName ?? proaFirstName(person.firstName);
      const lastName = fix?.lastName ?? person.lastName;
      const label = `${info.name}: ${firstName} ${lastName} (${id})`;
      const nationality = fix?.nationality ?? proaNationality(person.flag, person.country);
      if (!nationality) {
        warn(`${label}: nacionalidad no reconocida «${person.flag ?? person.country ?? ''}»`);
      }
      const position = bblPosition(person.role);
      if (person.role && !position) warn(`${label}: puesto no reconocido «${person.role}»`);
      const rawBirth = fix?.birthDate ?? person.birthDate;
      const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
      if (rawBirth && !birthDate) warn(`${label}: fecha de nacimiento imposible «${rawBirth}»`);
      return {
        sourceId: id,
        firstName,
        lastName,
        nickname: null,
        birthDate,
        age: null,
        nationality,
        nationalityRaw: person.flag ?? person.country,
        position,
        positionRaw: person.role || null,
        heightCm: fix?.heightCm ?? person.heightCm,
        weightKg: person.weightKg,
        shirtNumber: person.shirtNumber,
        licence: null,
        stats: statsById.get(id)?.stats ?? null
      };
    });

    teams.push({
      sourceId: info.id,
      name: info.name,
      shortName: null,
      city: info.city,
      pavilionName: info.pavilion,
      pavilionCapacity: info.capacity,
      finalPosition: index + 1,
      players,
      coach: proaCoachOf(info.id, kader.staff, warn, info.name)
    });
  }

  return {
    competitionId: 'alemania-2',
    name: 'ProA',
    shortName: 'ProA',
    country: 'GER',
    seasonStartYear: SEASON_START_YEAR,
    source: PROA_SITE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings: [],
    excluded: PROA_EXCLUDED
  };
}

/**
 * El entrenador que empezó la temporada, del fichero a mano; lo que no esté a
 * mano (fecha, nacionalidad), del cuerpo técnico de la web si el nombre casa.
 * Sin fichero, el único «Trainer» de la web, avisando si hay más de uno (la
 * web no dice quién empezó).
 */
function proaCoachOf(
  teamId: string,
  staff: readonly ProaPerson[],
  warn: Warn,
  label: string
): SourceCoach | null {
  const heads = staff.filter((person) => person.role === 'Trainer');
  const unique = heads.filter(
    (person, index) =>
      heads.findIndex((other) => sameName(other.lastName, person.lastName)) === index
  );
  const manual = PROA_COACHES.inicio[teamId];
  if (unique.length > 1) {
    warn(
      `${label}: varios primeros entrenadores en la web: ` +
        unique.map((person) => `${person.firstName} ${person.lastName}`).join(', ')
    );
  }
  if (!manual) {
    const only = unique.length === 1 ? unique[0] : undefined;
    if (!only) {
      warn(`${label}: sin entrenador a mano y la web no dice quién empezó`);
      return null;
    }
    warn(`${label}: entrenador ${only.firstName} ${only.lastName} de la web, sin comprobar a mano`);
    return {
      sourceId: only.personId ?? `equipo-${teamId}`,
      firstName: proaFirstName(only.firstName),
      lastName: only.lastName,
      birthDate: only.birthDate,
      age: null,
      nationality: proaNationality(only.flag, only.country),
      nationalityRaw: only.flag ?? only.country
    };
  }
  const coach = coachFromManual(manual, `equipo-${teamId}`);
  const web = staff.find(
    (person) =>
      sameName(person.lastName, manual.lastName) &&
      plainName(person.firstName).startsWith(plainName(manual.firstName).slice(0, 3))
  );
  if (!web)
    warn(`${label}: ${manual.firstName} ${manual.lastName} no está en el cuerpo técnico de la web`);
  const birthDate = coach.birthDate ?? web?.birthDate ?? null;
  if (coach.birthDate && web?.birthDate && coach.birthDate !== web.birthDate) {
    warn(
      `${label}: ${manual.lastName} nació el ${coach.birthDate} a mano y el ${web.birthDate} en la web`
    );
  }
  const nationality = coach.nationality ?? (web ? proaNationality(web.flag, web.country) : null);
  if (!birthDate && coach.age === null) warn(`${label}: entrenador ${manual.lastName} sin fecha`);
  if (!nationality) warn(`${label}: entrenador ${manual.lastName} sin nacionalidad`);
  return {
    ...coach,
    birthDate,
    age: birthDate ? null : coach.age,
    nationality,
    nationalityRaw: coach.nationalityRaw ?? web?.flag ?? null
  };
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const bblClient = createHttpClient({ minDelayMs: 3_000, force, log });
  const proaClient = createHttpClient({ minDelayMs: 3_000, force, log });
  const started = Date.now();

  for (const [slug, extract, client] of [
    ['bbl', extractBbl, bblClient],
    ['proa', extractProa, proaClient]
  ] as const) {
    const warnings: string[] = [];
    const warn: Warn = (message) => {
      warnings.push(message);
      log(`  aviso: ${message}`);
    };
    const league = await extract(client, warn);
    league.warnings = warnings;
    const file = sourceFile(slug, SEASON_START_YEAR);
    writeSourceLeague(file, league);
    log('');
    log(summarizeLeague(league));
    log(file);
  }
  log(
    `\n${bblClient.networkRequests + proaClient.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
