import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { plausibleBirthDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import { parseBbrefTotals } from './esake-parse';
import {
  aggregateTblBoxScores,
  completeFromBbref,
  matchTblBbref,
  parseBbrefBio,
  parseTblGame,
  parseTblPlayerPage,
  parseTblStandings,
  parseTblTeamPage,
  splitTblName,
  tblNationality,
  toBbrefPosition,
  type TblCoachRow,
  type TblGame,
  type TblPlayerStats,
  type TblRosterPlayer
} from './tblstat-parse';

/**
 * Extractor de la Basketbol Süper Ligi turca (`turquia-1`) desde tblstat.net,
 * con lo que falta de basketball-reference.
 *
 *   pnpm real:tblstat            usa la caché de descargas
 *   pnpm real:tblstat --force    lo vuelve a descargar todo
 *
 * La BSL 2025-26 tuvo 16 equipos, los mismos que la liga del juego.
 *
 * - La web oficial (tbf.org.tr) está tras la comprobación anti-robots de
 *   Cloudflare. tblstat.net, una web de estadísticas de aficionado, es HTML de
 *   servidor sin API: clasificación, plantillas (fecha, altura a veces y
 *   nacionalidad) y las actas de las 30 jornadas (los partidos 60001 a 60240),
 *   de las que salen las estadísticas con los minutos al segundo y el
 *   entrenador de cada partido. Un segundo y medio entre peticiones.
 * - Las actas no traen rebotes de ataque y defensa, tapones ni faltas: salen
 *   de la tabla de totales de liga regular de basketball-reference, con cada
 *   fila emparejada por equipo y estadísticas. Y el puesto (y la altura que
 *   tblstat no tenga), de la ficha de cada jugador en basketball-reference
 *   (una petición por jugador, una vez: esa web corta a quien pasa de unas
 *   veinte por minuto).
 * - El entrenador es el del acta del primer partido de liga regular de cada
 *   club, con la nacionalidad de tblstat y la fecha a mano
 *   (`tblstat-entrenadores.json`).
 */

const SITE = 'https://www.tblstat.net';
const BBREF = 'https://www.basketball-reference.com';
const SEASON = '2526';
const SEASON_START_YEAR = 2025;
/** Los partidos de liga regular: 30 jornadas de 8. Los siguientes son de playoffs. */
const FIRST_GAME = 60001;
const LAST_GAME = 60240;
const ROUNDS = 30;

interface TeamInfo {
  name: string;
  city: string;
  pavilion: string;
  capacity: number;
  /** Tramo de la ruta del equipo en basketball-reference. */
  bbref: string;
}

/**
 * Los clubes, por id de tblstat: nombre sin patrocinador (tblstat da el
 * comercial, «Fenerbahçe Beko»), ciudad, y pabellón y aforo de la 2025-26
 * según la Wikipedia inglesa («2025–26 Basketbol Süper Ligi»).
 */
const TEAMS: Record<string, TeamInfo> = {
  '4': {
    name: 'Fenerbahçe',
    city: 'Estambul',
    pavilion: 'Ülker Sports Arena',
    capacity: 13_800,
    bbref: 'ulker-fenerbahce'
  },
  '9': {
    name: 'Beşiktaş',
    city: 'Estambul',
    pavilion: 'Akatlar Arena',
    capacity: 3_200,
    bbref: 'besiktas'
  },
  '78': {
    name: 'Bahçeşehir Koleji',
    city: 'Estambul',
    pavilion: 'Sinan Erdem Spor Salonu',
    capacity: 13_800,
    bbref: 'bahcesehir'
  },
  '1': {
    name: 'Anadolu Efes',
    city: 'Estambul',
    pavilion: 'Basketbol Gelişim Merkezi',
    capacity: 10_000,
    bbref: 'anadolu-efes'
  },
  '3': {
    name: 'Türk Telekom',
    city: 'Ankara',
    pavilion: 'Ankara Arena',
    capacity: 10_400,
    bbref: 'turk-telekom'
  },
  '93': {
    name: 'Trabzonspor',
    city: 'Trebisonda',
    pavilion: 'Hayri Gür Arena',
    capacity: 7_500,
    bbref: 'trabzonspor'
  },
  '10': {
    name: 'Galatasaray',
    city: 'Estambul',
    pavilion: 'Basketbol Gelişim Merkezi',
    capacity: 10_000,
    bbref: 'galatasaray'
  },
  '92': {
    name: 'Esenler Erokspor',
    city: 'Estambul',
    pavilion: 'Sinan Erdem Spor Salonu',
    capacity: 13_800,
    bbref: 'esenler'
  },
  '84': {
    name: 'Merkezefendi Belediyesi Denizli Basket',
    city: 'Denizli',
    pavilion: 'Pamukkale Üniversitesi Spor Salonu',
    capacity: 3_490,
    bbref: 'denizli'
  },
  '20': {
    name: 'Tofaş',
    city: 'Bursa',
    pavilion: 'Tofaş Nilüfer Spor Salonu',
    capacity: 7_500,
    bbref: 'tofas'
  },
  '86': {
    name: 'Manisa Basket',
    city: 'Manisa',
    pavilion: 'Muradiye Spor Salonu',
    capacity: 3_500,
    bbref: 'manisa'
  },
  '79': {
    name: 'Bursaspor Basketbol',
    city: 'Bursa',
    pavilion: 'Tofaş Nilüfer Spor Salonu',
    capacity: 7_500,
    bbref: 'bursaspor'
  },
  '81': {
    name: 'Aliağa Petkimspor',
    city: 'Aliağa',
    pavilion: 'Aliağa Belediyesi ENKA Spor Salonu',
    capacity: 3_000,
    bbref: 'socar'
  },
  '11': {
    name: 'Karşıyaka Basket',
    city: 'Esmirna',
    pavilion: 'Karşıyaka Arena',
    capacity: 5_000,
    bbref: 'karsiyaka'
  },
  '91': {
    name: 'Mersin MSK',
    city: 'Mersin',
    pavilion: 'Servet Tazegül Spor Salonu',
    capacity: 7_500,
    bbref: 'mersin'
  },
  '74': {
    name: 'Büyükçekmece Basketbol',
    city: 'Estambul',
    pavilion: 'Gazanfer Bilge Spor Salonu',
    capacity: 3_000,
    bbref: 'buyukcekmece'
  }
};

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `tblstat-entrenadores.json`: por id de equipo de tblstat (`inicio`), el
 *   entrenador del acta del primer partido, con nombre de uso, nacimiento como
 *   la FEB (o, sin fecha exacta, `age`), la fuente y `despues`, quién le
 *   sustituyó. Sin fecha ni edad, el club se queda sin entrenador real.
 * - `tblstat-jugadores.json`: por id de jugador de tblstat, lo que tblstat da
 *   mal: el nombre de los nacionalizados que escribe a la turca, nombres que
 *   no se parten por la última palabra, y si hace falta fecha (`birthDate`,
 *   `AAAA-MM-DD`), nacionalidad (COI) o altura (`heightCm`).
 */
interface TblCoachesManual {
  inicio: Record<string, ManualCoach & { despues?: string }>;
}

interface TblPlayersManual {
  jugadores: Record<
    string,
    {
      firstName?: string;
      lastName?: string;
      birthDate?: string;
      nationality?: string;
      heightCm?: number;
    }
  >;
}

const COACHES = loadManualJson<TblCoachesManual>('tblstat-entrenadores.json', { inicio: {} });
const PLAYERS = loadManualJson<TblPlayersManual>('tblstat-jugadores.json', { jugadores: {} });

const log = (message: string): void => console.log(message);

function tblstat(client: HttpClient, path: string): Promise<string> {
  return client.get(`${SITE}/${path}`, { accept: (body) => body.includes('TBLStat') });
}

function sameName(a: string, b: string): boolean {
  const plain = (text: string): string =>
    text
      .toLocaleLowerCase('tr')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/ı/g, 'i')
      .replace(/[^a-z]/g, '');
  return plain(a) === plain(b);
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 1_500, force, log });
  const bbrefClient = createHttpClient({ minDelayMs: 3_500, force, log });
  const started = Date.now();
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  log('Basketbol Süper Ligi 2025-26: clasificación…');
  const standings = parseTblStandings(await tblstat(client, `standings/${SEASON}`));
  if (standings.length === 0) throw new Error('La clasificación de tblstat ha salido vacía.');
  for (const row of standings) {
    if (!TEAMS[row.teamId]) warn(`${row.name} (${row.teamId}): sin datos de club en TEAMS`);
  }

  log(`${LAST_GAME - FIRST_GAME + 1} actas de liga regular…`);
  const games: TblGame[] = [];
  for (let id = FIRST_GAME; id <= LAST_GAME; id++) {
    const game = parseTblGame(await tblstat(client, `game/${id}`), String(id));
    if (!game) {
      warn(`acta ${id}: no se ha podido leer`);
      continue;
    }
    if (game.phase !== 'Regular Season') warn(`acta ${id}: fase «${game.phase ?? '?'}»`);
    for (const [teamId, score] of [
      [game.homeId, game.homeScore],
      [game.awayId, game.awayScore]
    ] as const) {
      const points = game.lines
        .filter((line) => line.teamId === teamId)
        .reduce((sum, line) => sum + line.points, 0);
      if (score !== null && points !== score) {
        warn(
          `acta ${id} (jornada ${game.round}): ${teamId} suma ${points} y el tanteo es ${score}`
        );
      }
    }
    games.push(game);
  }
  const statsByTeam = new Map<string, TblPlayerStats[]>();
  for (const entry of aggregateTblBoxScores(games.flatMap((game) => game.lines))) {
    statsByTeam.set(entry.teamId, [...(statsByTeam.get(entry.teamId) ?? []), entry]);
  }

  log('basketball-reference: totales de la liga regular…');
  const bbrefRows = parseBbrefTotals(
    await bbrefClient.get(`${BBREF}/international/turkey-super-league/2026_totals.html`, {
      accept: (body) => body.includes('totals-stats')
    })
  );
  if (bbrefRows.length === 0)
    throw new Error('basketball-reference no ha dado la tabla de totales.');

  const counts = { bbrefBio: 0, sinPareja: 0 };
  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    const info = TEAMS[standing.teamId];
    const label = info?.name ?? standing.name;
    log(`${standing.rank}. ${label}`);
    const teamGames = games.filter(
      (game) => game.homeId === standing.teamId || game.awayId === standing.teamId
    );
    if (teamGames.length !== ROUNDS) {
      warn(`${label}: ${teamGames.length} actas de liga regular y deberían ser ${ROUNDS}`);
    }
    const page = parseTblTeamPage(await tblstat(client, `team/${standing.teamId}/${SEASON}`));
    const teamStats = statsByTeam.get(standing.teamId) ?? [];
    const statsById = new Map(teamStats.map((entry) => [entry.playerId, entry]));

    // La plantilla y los canteranos que jugaron; quien jugó y no sale en
    // ninguna lista, de su ficha.
    const roster: Omit<TblRosterPlayer, 'section'>[] = page.players.filter(
      (player) => player.section !== 'cantera' || statsById.has(player.playerId)
    );
    const listed = new Set(roster.map((player) => player.playerId));
    for (const entry of teamStats) {
      if (listed.has(entry.playerId)) continue;
      roster.push(
        parseTblPlayerPage(
          await tblstat(client, `player/${entry.playerId}/${SEASON}`),
          entry.playerId
        )
      );
      listed.add(entry.playerId);
    }

    const bbrefTeam = bbrefRows.filter((row) => row.teamSlug === info?.bbref);
    if (bbrefTeam.length === 0) warn(`${label}: sin filas en basketball-reference`);
    const matched = matchTblBbref(teamStats, bbrefTeam);

    const players: SourcePlayer[] = [];
    const seen = new Set<string>();
    for (const player of roster) {
      if (seen.has(player.playerId)) continue;
      seen.add(player.playerId);
      const manual = PLAYERS.jugadores[player.playerId];
      const split = splitTblName(player.name);
      const firstName = manual?.firstName ?? split.firstName;
      const lastName = manual?.lastName ?? split.lastName;
      const fullLabel = `${label}: ${firstName} ${lastName} (${player.playerId})`;
      const entry = statsById.get(player.playerId);
      const bbrefRow = entry ? matched.get(entry) : undefined;
      if (entry) {
        if (!bbrefRow) {
          counts.sinPareja += 1;
          warn(
            `${fullLabel}: ${entry.stats.games} partidos sin pareja en basketball-reference; ` +
              'sin rebotes de ataque, tapones ni faltas'
          );
        } else if (!completeFromBbref(entry.stats, bbrefRow)) {
          warn(`${fullLabel}: la tabla de basketball-reference no trae rebotes, tapones y faltas`);
        }
      }
      const bio = bbrefRow
        ? parseBbrefBio(
            await bbrefClient.get(`${BBREF}${bbrefRow.playerPath}`, {
              accept: (body) => body.includes('id="meta"')
            })
          )
        : null;
      if (bio) counts.bbrefBio += 1;

      const nationality =
        manual?.nationality ?? tblNationality(player.flag, player.country) ?? null;
      if (!nationality) {
        warn(`${fullLabel}: nacionalidad no reconocida «${player.country ?? player.flag ?? ''}»`);
      }
      const heightCm = manual?.heightCm ?? player.heightCm ?? bio?.heightCm ?? null;
      const position = toBbrefPosition(bio?.position, heightCm);
      if (bio?.position && !position) {
        warn(`${fullLabel}: puesto no reconocido «${bio.position}»`);
      }
      const rawBirth = manual?.birthDate ?? player.birthDate;
      const birthDate = plausibleBirthDate(rawBirth, SEASON_START_YEAR);
      if (rawBirth && !birthDate) {
        warn(`${fullLabel}: fecha de nacimiento imposible «${rawBirth}»; sin fecha`);
      }
      if (bio?.birthDate && birthDate && bio.birthDate !== birthDate) {
        log(`  revisar: ${fullLabel}: nacido el ${birthDate} y ${bio.birthDate} en b-reference`);
      }
      players.push({
        sourceId: player.playerId,
        firstName,
        lastName,
        nickname: null,
        birthDate,
        age: null,
        nationality,
        nationalityRaw: player.country,
        position,
        positionRaw: bio?.position ?? null,
        heightCm,
        weightKg: bio?.weightKg ?? null,
        shirtNumber: null,
        licence: null,
        stats: entry?.stats ?? null
      });
    }

    teams.push({
      sourceId: standing.teamId,
      name: label,
      shortName: null,
      city: info?.city ?? null,
      pavilionName: info?.pavilion ?? null,
      pavilionCapacity: info?.capacity ?? null,
      finalPosition: standing.rank,
      players,
      coach: coachOf(standing.teamId, teamGames, page.coaches, warn, label)
    });
  }

  const league: SourceLeague = {
    competitionId: 'turquia-1',
    name: 'Basketbol Süper Ligi',
    shortName: 'BSL',
    country: 'TUR',
    seasonStartYear: SEASON_START_YEAR,
    source: SITE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
  const file = sourceFile('tblstat-bsl', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(
    `  basketball-reference: ${counts.bbrefBio} fichas; ` +
      `${counts.sinPareja} jugadores con partidos sin pareja`
  );
  log(file);
  log(
    `\n${client.networkRequests + bbrefClient.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

/**
 * El entrenador del acta del primer partido de liga regular del club (por
 * fecha), con la nacionalidad de la ficha del equipo en tblstat y la fecha de
 * nacimiento del fichero a mano. Sin fecha ni edad a mano, se queda sin
 * entrenador real (el montaje lo descarta). Avisa de cada cambio.
 */
function coachOf(
  teamId: string,
  teamGames: readonly TblGame[],
  coachRows: readonly TblCoachRow[],
  warn: (message: string) => void,
  label: string
): SourceCoach | null {
  const sequence: { date: string; name: string }[] = [];
  const byDate = [...teamGames].sort(
    (a, b) => (a.date ?? '').localeCompare(b.date ?? '') || Number(a.gameId) - Number(b.gameId)
  );
  for (const game of byDate) {
    const name = game.homeId === teamId ? game.homeCoach : game.awayCoach;
    if (name && sequence[sequence.length - 1]?.name !== name) {
      sequence.push({ date: game.date ?? '?', name });
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
  const row = coachRows.find((entry) => sameName(entry.name, first.name));
  const nationality = row ? tblNationality(row.flag, row.country) : null;
  if (!nationality) warn(`${label}: sin nacionalidad para el entrenador ${first.name}`);
  const manual = COACHES.inicio[teamId];
  if (!manual) {
    const name = splitTblName(first.name);
    warn(`${label}: entrenador ${first.name} sin fecha de nacimiento a mano`);
    return {
      sourceId: `equipo-${teamId}`,
      firstName: name.firstName,
      lastName: name.lastName,
      birthDate: null,
      age: null,
      nationality,
      nationalityRaw: row?.country ?? null
    };
  }
  if (!sameName(`${manual.firstName} ${manual.lastName}`, first.name)) {
    warn(
      `${label}: el acta da a ${first.name} y a mano está ${manual.firstName} ${manual.lastName}`
    );
  }
  if (!manual.birth && manual.age === undefined) {
    warn(`${label}: entrenador ${manual.firstName} ${manual.lastName} sin fecha de nacimiento`);
  }
  const coach = coachFromManual(manual, `equipo-${teamId}`);
  if (nationality && coach.nationality && coach.nationality !== nationality) {
    warn(
      `${label}: ${manual.firstName} ${manual.lastName} es ${nationality} en tblstat y ` +
        `${coach.nationality} a mano; manda tblstat`
    );
  }
  return {
    ...coach,
    nationality: nationality ?? coach.nationality,
    nationalityRaw: row?.country ?? coach.nationalityRaw
  };
}

await main();
