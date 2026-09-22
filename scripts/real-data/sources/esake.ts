import { createHttpClient, type HttpClient } from '../lib/http';
import { greekNameToLatin, isGreekScript, nameSimilarity, nationFromGreek } from '../lib/greek';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { plausibleBirthDate, toNameCase, toPosition } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  aggregateEsakeBoxScores,
  matchBbref,
  parseBbrefTotals,
  parseEsakeBio,
  parseEsakeBoxScore,
  parseEsakePlayers,
  parseEsakeResults,
  parseEsakeStandings,
  splitBbrefName,
  type BbrefRow,
  type EsakeBoxLine,
  type EsakeGame,
  type EsakeListPlayer,
  type EsakePlayerStats
} from './esake-parse';

/**
 * Extractor de la A1 griega, la Stoiximan GBL, desde esake.gr (la web de la
 * liga), con los nombres en latino de basketball-reference.
 *
 *   pnpm real:esake            usa la caché de descargas
 *   pnpm real:esake --force    lo vuelve a descargar todo
 *
 * La GBL 2025-26 tuvo 13 equipos y la A1 del juego tiene 14: la plaza que
 * falta es para el campeón de la Elite League, que sube (`pnpm real:hbf`).
 *
 * - esake.gr es HTML de servidor sin API: clasificación, plantillas (con
 *   fecha, altura, puesto y país en griego) y las actas de las 26 jornadas,
 *   de las que salen las estadísticas con los minutos exactos. Un segundo
 *   entre peticiones.
 * - esake escribe los nombres de muchos jugadores en griego, también los de
 *   los extranjeros («ΣΜΙΘΕΡΣΟΝ»), y esa transcripción no se puede deshacer.
 *   Los extranjeros toman el nombre de la tabla de totales de
 *   basketball-reference (una sola página), emparejados por equipo y
 *   estadísticas; los griegos se transliteran con ELOT 743. Lo que no casa va
 *   a mano en `resources/real-data/manual/esake-nombres.json`.
 * - Los entrenadores del inicio de temporada van todos a mano: esake sólo da
 *   el cuerpo técnico de hoy y sus actas no traen entrenador.
 */

const SITE = 'https://www.esake.gr';
const BBREF = 'https://www.basketball-reference.com';
const SEASON_START_YEAR = 2025;
/** `idchampionship` de la Stoiximan GBL 2025-26. */
const CHAMPIONSHIP = '44B80BEB';
const ROUNDS = 26;

interface TeamInfo {
  name: string;
  city: string;
  pavilion: string;
  capacity: number;
  /** Tramo de la ruta del equipo en basketball-reference. */
  bbref: string;
}

/**
 * Los clubes, por id de esake: nombre completo sin patrocinador (esake da el
 * comercial en griego, «ΠΑΝΑΘΗΝΑΪΚΟΣ AKTOR»), ciudad, y pabellón y aforo de
 * la 2025-26 según la Wikipedia inglesa («2025–26 Greek Basket League»;
 * esake sólo da los de hoy).
 */
const TEAMS: Record<string, TeamInfo> = {
  '00000002': {
    name: 'Olympiacos BC',
    city: 'El Pireo',
    pavilion: 'Peace and Friendship Stadium',
    capacity: 11_319,
    bbref: 'olympiakos'
  },
  '00000001': {
    name: 'Panathinaikos BC',
    city: 'Atenas',
    pavilion: 'Telekom Center Athens',
    capacity: 19_443,
    bbref: 'panathinaikos'
  },
  '0000000C': {
    name: 'PAOK BC',
    city: 'Tesalónica',
    pavilion: 'PAOK Sports Arena',
    capacity: 8_500,
    bbref: 'paok'
  },
  '00000010': {
    name: 'AEK BC',
    city: 'Atenas',
    pavilion: 'Ano Liosia Olympic Hall',
    capacity: 9_327,
    bbref: 'aek-athens'
  },
  '00000005': {
    name: 'Aris BC',
    city: 'Tesalónica',
    pavilion: 'Alexandreio Melathron',
    capacity: 5_138,
    bbref: 'aris'
  },
  '0000000D': {
    name: 'Peristeri BC',
    city: 'Peristeri',
    pavilion: 'Peristeri Arena',
    capacity: 4_000,
    bbref: 'peristeri'
  },
  BB4B460F: {
    name: 'Mykonos BC',
    city: 'Míkonos',
    pavilion: 'P. Chanioti Ano Mera Indoor Hall',
    capacity: 1_000,
    bbref: 'mykonos'
  },
  '0000000A': {
    name: 'Kolossos Rodou BC',
    city: 'Rodas',
    pavilion: 'Kallithea Palais des Sports',
    capacity: 1_400,
    bbref: 'rhodes'
  },
  '00000011': {
    name: 'Iraklis BC',
    city: 'Tesalónica',
    pavilion: 'Ivanofeio Sports Arena',
    capacity: 2_580,
    bbref: 'iraklis'
  },
  '2A25C696': {
    name: 'Promitheas Patras BC',
    city: 'Patras',
    pavilion: 'Dimitris Tofalos Arena',
    capacity: 4_150,
    bbref: 'promitheas'
  },
  B742845D: {
    name: 'AS Karditsas',
    city: 'Karditsa',
    pavilion: 'Karditsa New Indoor Hall',
    capacity: 3_000,
    bbref: 'karditsas'
  },
  '0000000F': {
    name: 'Maroussi BC',
    city: 'Marusi',
    pavilion: 'Maroussi Saint Thomas Indoor Hall',
    capacity: 1_700,
    bbref: 'maroussi'
  },
  '00000003': {
    name: 'Panionios BC',
    city: 'Nea Smyrni',
    pavilion: 'National Athletic Center Glyfada',
    capacity: 3_500,
    bbref: 'panionios'
  }
};

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `esake-entrenadores.json`: el entrenador que empezó la liga, por id de
 *   equipo de esake (`inicio`), con nombre de uso y nacimiento como la FEB, y
 *   la fuente. Con `despues`, quién le sustituyó, para el aviso.
 * - `esake-nombres.json`: el nombre en latino de los jugadores que esake da en
 *   griego y no casan con basketball-reference, por id de jugador de esake, y
 *   la fecha de nacimiento (`birthDate`) de los que esake da con una imposible
 *   y la nacionalidad (`nationality`, COI) de los que no la tienen.
 */
interface EsakeCoaches {
  inicio: Record<string, ManualCoach & { despues?: string }>;
}

interface EsakeNames {
  jugadores: Record<
    string,
    { firstName?: string; lastName?: string; birthDate?: string; nationality?: string }
  >;
}

const COACHES = loadManualJson<EsakeCoaches>('esake-entrenadores.json', { inicio: {} });
const NAMES = loadManualJson<EsakeNames>('esake-nombres.json', { jugadores: {} });

const log = (message: string): void => console.log(message);

function esake(client: HttpClient, path: string): Promise<string> {
  return client.get(`${SITE}${path}`, { accept: (body) => body.includes('esake') });
}

interface NameChoice {
  firstName: string;
  lastName: string;
  /** De dónde sale, para el resumen. */
  from: 'esake' | 'elot' | 'bbref' | 'manual' | 'elot-sin-casar';
}

/**
 * El nombre en latino de un jugador: el de `esake-nombres.json` si está; los
 * extranjeros, el de basketball-reference; los griegos escritos en griego,
 * transliterados con ELOT 743; los escritos ya en latino, tal cual. Los
 * nacionalizados con nombre de fuera, que esake transcribe al griego
 * («ΤΖΟΝΣΟΝ»), van a mano: la transliteración no los devuelve.
 */
function nameOf(
  player: EsakeListPlayer,
  nationality: string | null,
  bbref: BbrefRow | undefined
): NameChoice {
  const manual = NAMES.jugadores[player.playerId];
  if (manual?.firstName && manual.lastName) {
    return { firstName: manual.firstName, lastName: manual.lastName, from: 'manual' };
  }
  const greek = isGreekScript(`${player.lastName} ${player.firstName}`);
  const lastWords = player.lastName.trim().split(/\s+/).length;
  const fromBbref = bbref ? splitBbrefName(bbref.name, lastWords) : null;
  // Los extranjeros, con el nombre de basketball-reference siempre que casen.
  if (nationality !== 'GRE' && fromBbref) return { ...fromBbref, from: 'bbref' };
  if (!greek) {
    let firstName = toNameCase(player.firstName);
    let lastName = toNameCase(player.lastName);
    // esake pone a veces nombre y apellido al revés: basketball-reference lo dice.
    if (
      fromBbref &&
      nameSimilarity(firstName, fromBbref.lastName) > nameSimilarity(lastName, fromBbref.lastName)
    ) {
      [firstName, lastName] = [lastName, firstName];
    }
    return { firstName, lastName, from: 'esake' };
  }
  const firstName = greekNameToLatin(player.firstName);
  const lastName = greekNameToLatin(player.lastName);
  if (nationality === 'GRE') return { firstName, lastName, from: 'elot' };
  return { firstName, lastName, from: 'elot-sin-casar' };
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 1_000, force, log });
  // basketball-reference corta a quien pasa de unas veinte peticiones por
  // minuto; aquí sólo se pide una página.
  const bbrefClient = createHttpClient({ minDelayMs: 5_000, force, log });
  const started = Date.now();
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  log('Stoiximan GBL 2025-26: clasificación…');
  const standings = parseEsakeStandings(
    await esake(client, `/el/action/EsakeRanking?idchampionship=${CHAMPIONSHIP}&day=${ROUNDS}-1`)
  );
  if (standings.length === 0) throw new Error('La clasificación de esake ha salido vacía.');
  for (const row of standings) {
    if (!TEAMS[row.teamId]) warn(`${row.name} (${row.teamId}): sin datos de club en TEAMS`);
  }

  log(`${ROUNDS} jornadas y sus actas…`);
  const games: EsakeGame[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    games.push(
      ...parseEsakeResults(
        await esake(
          client,
          `/el/action/EsakeResults?idchampionship=${CHAMPIONSHIP}&idteam=&idseason=00000001&series=${round}`
        )
      )
    );
  }
  const expected = standings.length * (standings.length - 1);
  if (games.length !== expected) {
    warn(`el calendario trae ${games.length} partidos y deberían ser ${expected}`);
  }
  const lines: EsakeBoxLine[] = [];
  for (const game of games) {
    const box = parseEsakeBoxScore(
      await esake(client, `/el/action/EsakegameView?idgame=${game.gameId}&mode=3`)
    );
    for (const [teamId, score] of [
      [game.homeId, game.homeScore],
      [game.awayId, game.awayScore]
    ] as const) {
      const points = box
        .filter((line) => line.teamId === teamId)
        .reduce((sum, line) => sum + line.points, 0);
      if (score !== null && points !== score) {
        warn(
          `acta ${game.gameId} (jornada ${game.round}): ${teamId} suma ${points} y el tanteo es ${score}`
        );
      }
    }
    lines.push(...box);
  }
  const statsByTeam = new Map<string, EsakePlayerStats[]>();
  for (const entry of aggregateEsakeBoxScores(lines)) {
    statsByTeam.set(entry.teamId, [...(statsByTeam.get(entry.teamId) ?? []), entry]);
  }

  log('basketball-reference: totales de la liga regular…');
  const bbrefRows = parseBbrefTotals(
    await bbrefClient.get(`${BBREF}/international/greek-basket-league/2026_totals.html`, {
      accept: (body) => body.includes('totals-stats')
    })
  );
  if (bbrefRows.length === 0)
    throw new Error('basketball-reference no ha dado la tabla de totales.');

  const counts = { esake: 0, elot: 0, bbref: 0, manual: 0, 'elot-sin-casar': 0 };
  const teams: SourceTeam[] = [];
  for (const standing of standings) {
    const info = TEAMS[standing.teamId];
    const label = info?.name ?? standing.name;
    log(`${standing.rank}. ${label}`);
    const teamStats = statsByTeam.get(standing.teamId) ?? [];
    const maxGames = Math.max(0, ...teamStats.map((entry) => entry.stats.games));
    if (standing.games !== null && maxGames > standing.games) {
      warn(`${label}: un jugador con ${maxGames} partidos de ${standing.games}`);
    }
    const roster = parseEsakePlayers(
      await esake(
        client,
        `/el/action/EsakePlayers?idchampionship=${CHAMPIONSHIP}&idteam=${standing.teamId}&letter=&post=&name=`
      )
    );
    // Quien jugó y ya no está en la plantilla de la temporada (se fue a
    // mitad): su ficha, de su página de jugador, y el nombre del acta.
    const listed = new Set(roster.map((player) => player.playerId));
    for (const entry of teamStats) {
      if (listed.has(entry.playerId)) continue;
      const bio = parseEsakeBio(
        await esake(
          client,
          `/el/action/EsakeplayerView?idplayer=${entry.playerId}&idchampionship=${CHAMPIONSHIP}`
        )
      );
      roster.push({
        playerId: entry.playerId,
        lastName: entry.lastName,
        firstName: entry.firstName,
        shirtNumber: null,
        ...bio
      });
      listed.add(entry.playerId);
    }
    const statsById = new Map(teamStats.map((entry) => [entry.playerId, entry]));
    const bbrefTeam = bbrefRows.filter((row) => row.teamSlug === info?.bbref);
    const matched = matchBbref(teamStats, bbrefTeam);

    const players: SourcePlayer[] = [];
    const seen = new Set<string>();
    for (const player of roster) {
      if (seen.has(player.playerId)) continue;
      seen.add(player.playerId);
      const entry = statsById.get(player.playerId);
      const nationality =
        NAMES.jugadores[player.playerId]?.nationality ?? nationFromGreek(player.country);
      if (player.country && !nationality) {
        warn(
          `${label}: ${player.lastName} ${player.firstName}: país no reconocido «${player.country}»`
        );
      }
      const bbrefRow = entry ? matched.get(entry) : undefined;
      const name = nameOf(player, nationality, bbrefRow);
      counts[name.from] += 1;
      if (name.from === 'elot' && bbrefRow) {
        const other = splitBbrefName(bbrefRow.name, name.lastName.split(' ').length);
        if (nameSimilarity(name.lastName, other.lastName) < 0.8) {
          log(
            `  revisar: ${name.firstName} ${name.lastName} (${player.playerId}) es «${bbrefRow.name}» en basketball-reference`
          );
        }
      }
      const fullLabel = `${label}: ${name.firstName} ${name.lastName} (${player.playerId})`;
      if (name.from === 'elot-sin-casar') {
        if (!entry) {
          // Un extranjero sin partidos y sin nombre legible: no aporta nada.
          warn(`${fullLabel}: extranjero sin partidos ni nombre en latino; no entra`);
          counts[name.from] -= 1;
          continue;
        }
        warn(`${fullLabel}: extranjero sin pareja en basketball-reference; nombre transliterado`);
      }
      const position = toPosition(player.position);
      if (player.position && !position)
        warn(`${fullLabel}: posición no reconocida «${player.position}»`);
      // La fecha a mano (`AAAA-MM-DD`) corrige las que esake da mal.
      const manualBirth = NAMES.jugadores[player.playerId]?.birthDate;
      const birthDate = plausibleBirthDate(manualBirth ?? player.birthDate, SEASON_START_YEAR);
      if (player.birthDate && !birthDate && !manualBirth) {
        warn(`${fullLabel}: fecha de nacimiento imposible «${player.birthDate}»; sin fecha`);
      }
      players.push({
        sourceId: player.playerId,
        firstName: name.firstName,
        lastName: name.lastName,
        nickname: null,
        birthDate,
        age: null,
        nationality,
        nationalityRaw: player.country,
        position,
        positionRaw: player.position,
        heightCm: player.heightCm,
        weightKg: null,
        shirtNumber: player.shirtNumber,
        licence: null,
        stats: entry?.stats ?? null
      });
    }
    for (const entry of teamStats) {
      if (!matched.has(entry)) {
        warn(
          `${label}: ${entry.name} (${entry.playerId}, ${entry.stats.games} partidos) sin pareja en basketball-reference`
        );
      }
    }

    const manualCoach = COACHES.inicio[standing.teamId];
    if (!manualCoach) warn(`${label}: sin entrenador del inicio en esake-entrenadores.json`);
    else if (!manualCoach.birth && manualCoach.age === undefined) {
      warn(
        `${label}: entrenador ${manualCoach.firstName} ${manualCoach.lastName} sin fecha de nacimiento`
      );
    } else if (manualCoach.despues) {
      warn(
        `${label}: empezó ${manualCoach.firstName} ${manualCoach.lastName}; después, ${manualCoach.despues}`
      );
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
      coach: manualCoach ? coachFromManual(manualCoach, `equipo-${standing.teamId}`) : null
    });
  }

  const league: SourceLeague = {
    competitionId: 'grecia-1',
    name: 'Stoiximan GBL',
    shortName: 'GBL',
    country: 'GRE',
    seasonStartYear: SEASON_START_YEAR,
    source: SITE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
  const file = sourceFile('esake-gbl', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(
    `  nombres: ${counts.elot} transliterados, ${counts.bbref} de basketball-reference, ` +
      `${counts.esake} en latino en esake, ${counts.manual} a mano, ` +
      `${counts['elot-sin-casar']} transliterados sin pareja`
  );
  log(file);
  log(
    `\n${client.networkRequests + bbrefClient.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
