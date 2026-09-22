import { greekNameToLatin, isGreekScript, nationFromGreek } from '../lib/greek';
import { createHttpClient, type HttpClient } from '../lib/http';
import { coachFromManual, loadManualJson, type ManualCoach } from '../lib/manual';
import { plausibleBirthDate } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceCoach, SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  aggregateHbfBoxScores,
  hbfName,
  parseHbfGame,
  parseHbfGameIds,
  parseHbfStandings,
  parseHbfTeamPage,
  parseHbfTeams,
  toHbfPosition,
  type HbfGame,
  type HbfPlayerStats,
  type HbfRosterPlayer
} from './hbf-parse';

/**
 * Extractor de la A2 griega, la Elite League, desde stats.basket.gr (la web
 * de estadísticas de la federación, HBF).
 *
 *   pnpm real:hbf            usa la caché de descargas
 *   pnpm real:hbf --force    lo vuelve a descargar todo
 *
 * La Elite League 2025-26 tuvo 16 inscritos, pero el Trikala se retiró y sus
 * partidos se anularon: jugaron 15, a doble vuelta (28 partidos). La A2 del
 * juego tiene 14: el campeón, Doxa Lefkadas (primero de la liga regular,
 * ascenso directo), sube a la A1 del juego, que con la GBL real tenía 13
 * (`promoted`, como Roanne y Pau en Francia).
 *
 * - Las estadísticas se suman de las actas de la liga regular: los totales
 *   de la ficha del equipo cuentan también los partidos anulados y la fase
 *   final. Un segundo entre peticiones.
 * - La federación no da la nacionalidad: los extranjeros (los que vienen en
 *   latino) la llevan a mano en `resources/real-data/manual/hbf-jugadores.json`,
 *   y los griegos, el nombre de pila de uso en vez del legal (Ioannis →
 *   Giannis) con la lista del mismo fichero.
 * - El entrenador es el del acta del primer partido de liga regular de cada
 *   club, con la fecha y el país a mano (`hbf-entrenadores.json`).
 */

const STATS = 'https://stats.basket.gr';
const SEASON = '2025-2026';
const SEASON_START_YEAR = 2025;
const COMPETITION = `${STATS}/${SEASON}/elite-league`;

/** El Trikala, que se retiró: sus partidos se anularon y no cuentan. */
const WITHDRAWN_TEAM_ID = '507427FA-370A-455C-A9BD-7C56BC0438F3';

/** El campeón, Doxa Lefkadas: sube a la A1 del juego. */
const PROMOTED_TEAM_IDS = ['4023C53C-7708-46FC-A3F3-4E2E874E0FFA'];

/**
 * Los clubes, por id de la federación: el nombre sin patrocinador (la
 * federación da el comercial en griego, «ΔΟΞΑ ΛΕΥΚΑΔΑΣ ΒΙΚΟΣ COLA») y la
 * ciudad. Uno que falte se queda con el nombre transliterado y se avisa.
 */
const TEAMS: Record<string, { name: string; city: string }> = {
  '4023C53C-7708-46FC-A3F3-4E2E874E0FFA': { name: 'Doxa Lefkadas BC', city: 'Léucade' },
  'DE6BE9CE-8CC7-4D2A-A76C-140A19B471BC': { name: 'Neaniki Estia Megaridas', city: 'Mégara' },
  '0E53A8A5-F263-49D4-BFC2-D467B52438C4': { name: 'Vikos Falcons', city: 'Ioánina' },
  'B3FA7726-B737-45EB-A67D-15181CA77C62': { name: 'Proteas Voulas', city: 'Vula' },
  '59116018-AE39-4072-B7B7-96934038C626': { name: 'AO Papagou', city: 'Papagou' },
  'C03FA255-664C-4F55-97FA-56027424FBF3': { name: 'AGE Chalkidas', city: 'Calcis' },
  '5C29B244-66AC-441C-A246-B8697961985B': { name: 'AE Psychikou', city: 'Psychiko' },
  '72CD4268-3FFD-4F73-A92E-5AE7A739A092': { name: 'Lavrio BC', city: 'Laurio' },
  'CDCB0A6F-0835-4073-A1BE-7CCC88AE1F8A': { name: 'Koroivos Amaliadas', city: 'Amaliada' },
  '1BC51562-E531-43E0-8BF1-ACB47AA5FE68': { name: 'Panerythraikos', city: 'Nea Erythraia' },
  'A873A0DC-2DDB-4168-A636-B0ED28245516': { name: 'GS Sofadon', city: 'Sofades' },
  '220EEDAB-C876-484B-A133-DE64750290EF': { name: 'AO Dafnis', city: 'Dafni' },
  '8E075EE0-9BE2-4BAA-8EEF-90F0403FE130': { name: 'Machites Peiramatiko', city: 'Pefka' },
  'E58B1550-9E72-4D29-AF38-71105F8BE3B8': { name: 'Niki Volou', city: 'Volos' },
  'A021EC10-C5F8-4D85-AEA5-54AA366F775D': { name: 'AO Aigaleo', city: 'Egaleo' }
};

/**
 * Lo que va a mano (`resources/real-data/manual/`, fuera de git):
 *
 * - `hbf-jugadores.json`: `habituales`, el nombre de pila de uso de los
 *   nombres legales griegos («Ioannis» → «Giannis»), y `jugadores`, por id de
 *   jugador de la federación, la nacionalidad de los extranjeros (código COI)
 *   y, si hace falta, su nombre y apellido bien partidos y la fecha de nacimiento
 *   cuando la de la federación está mal.
 * - `hbf-entrenadores.json`: por id de equipo (`inicio`), el entrenador del
 *   primer partido con su nombre de uso, nacimiento como la FEB y la fuente;
 *   y `pabellones`, el aforo de los pabellones que lo tienen publicado.
 */
interface HbfPlayersManual {
  habituales: Record<string, string>;
  jugadores: Record<
    string,
    { nationality?: string; firstName?: string; lastName?: string; birthDate?: string }
  >;
}

interface HbfCoachesManual {
  inicio: Record<string, ManualCoach & { despues?: string }>;
  pabellones: Record<string, { pavilion?: string; capacity?: number }>;
}

const PLAYERS = loadManualJson<HbfPlayersManual>('hbf-jugadores.json', {
  habituales: {},
  jugadores: {}
});
const COACHES = loadManualJson<HbfCoachesManual>('hbf-entrenadores.json', {
  inicio: {},
  pabellones: {}
});

const log = (message: string): void => console.log(message);

function page(client: HttpClient, url: string): Promise<string> {
  return client.get(url, { accept: (body) => body.includes('contentmain1') });
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 1_000, force, log });
  const started = Date.now();
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    log(`  aviso: ${message}`);
  };

  log('Elite League 2025-26: equipos y clasificación…');
  const refs = parseHbfTeams(await page(client, `${COMPETITION}/teams`));
  const standings = parseHbfStandings(await page(client, `${COMPETITION}/standings`));
  if (standings.length === 0) throw new Error('La clasificación de la federación ha salido vacía.');
  const playoffIds = new Set(
    parseHbfGameIds(await page(client, `${COMPETITION}/games-playoffs-playouts`))
  );

  const teamPages = new Map<string, ReturnType<typeof parseHbfTeamPage>>();
  for (const ref of refs) {
    teamPages.set(
      ref.teamId,
      parseHbfTeamPage(await page(client, `${COMPETITION}/teamdetails/id/${ref.teamId}`))
    );
  }

  // Las actas de la liga regular: las de todos los equipos, sin las de la
  // fase final ni las de los partidos anulados del Trikala.
  const gameIds = [...new Set([...teamPages.values()].flatMap((entry) => entry.gameIds))]
    .filter((id) => !playoffIds.has(id))
    .sort();
  log(`${gameIds.length} actas…`);
  const games: HbfGame[] = [];
  for (const gameId of gameIds) {
    const game = parseHbfGame(
      await page(client, `${COMPETITION}/gamedetails/id/${gameId}`),
      gameId
    );
    if (game.homeId === WITHDRAWN_TEAM_ID || game.awayId === WITHDRAWN_TEAM_ID) continue;
    if (!game.homeId || !game.awayId) {
      warn(`acta ${gameId}: sin equipos; no cuenta`);
      continue;
    }
    for (const [teamId, score] of [
      [game.homeId, game.homeScore],
      [game.awayId, game.awayScore]
    ] as const) {
      const lines = game.lines.filter((line) => line.teamId === teamId);
      const points = lines.reduce((sum, line) => sum + line.points, 0);
      const starters = lines.filter((line) => line.starter).length;
      if (score !== null && points !== score) {
        warn(
          `acta ${game.date ?? '?'} ${gameId}: un equipo suma ${points} y el tanteo es ${score}`
        );
      }
      if (starters !== 5) warn(`acta ${game.date ?? '?'} ${gameId}: ${starters} titulares`);
    }
    games.push(game);
  }
  const expected = standings.length * (standings.length - 1);
  if (games.length !== expected) {
    warn(`hay ${games.length} actas de liga regular y deberían ser ${expected}`);
  }
  const statsByTeam = new Map<string, HbfPlayerStats[]>();
  for (const entry of aggregateHbfBoxScores(games.flatMap((game) => game.lines))) {
    statsByTeam.set(entry.teamId, [...(statsByTeam.get(entry.teamId) ?? []), entry]);
  }

  const teams: SourceTeam[] = [];
  let foreigners = 0;
  let foreignersWithoutNation = 0;
  for (const standing of standings) {
    const ref = refs.find((entry) => entry.name === standing.name);
    if (!ref) {
      warn(`${standing.name}: está en la clasificación y no en la lista de equipos`);
      continue;
    }
    const info = TEAMS[ref.teamId];
    if (!info) warn(`${standing.name} (${ref.teamId}): sin nombre ni ciudad en TEAMS`);
    const label = info?.name ?? greekNameToLatin(standing.name);
    log(`${standing.rank}. ${label}`);
    const teamGames = games.filter(
      (game) => game.homeId === ref.teamId || game.awayId === ref.teamId
    );
    if (teamGames.length !== standing.games) {
      warn(
        `${label}: la clasificación da ${standing.games} partidos y hay ${teamGames.length} actas`
      );
    }
    const teamStats = statsByTeam.get(ref.teamId) ?? [];
    const statsById = new Map(teamStats.map((entry) => [entry.playerId, entry]));
    const roster = teamPages.get(ref.teamId)?.roster ?? [];
    const players: SourcePlayer[] = [];
    const listed = new Set<string>();

    const addPlayer = (player: HbfRosterPlayer): void => {
      listed.add(player.playerId);
      const manual = PLAYERS.jugadores[player.playerId];
      const greek = isGreekScript(player.fullName);
      const name = hbfName(player.fullName, PLAYERS.habituales);
      const nationality = manual?.nationality ?? (greek ? 'GRE' : null);
      if (!greek) {
        foreigners += 1;
        if (!manual?.nationality) {
          foreignersWithoutNation += 1;
          warn(
            `${label}: ${player.fullName} (${player.playerId}): extranjero sin nacionalidad a mano`
          );
        }
      }
      // La fecha a mano (`AAAA-MM-DD`) corrige las que la federación da mal.
      const birthDate = plausibleBirthDate(
        manual?.birthDate ?? player.birthDate,
        SEASON_START_YEAR
      );
      if (player.birthDate && !birthDate) {
        warn(
          `${label}: ${player.fullName}: fecha de nacimiento imposible «${player.birthDate}»; sin fecha`
        );
      }
      const position = toHbfPosition(player.position, player.heightCm);
      if (player.position && !position) {
        warn(`${label}: ${player.fullName}: posición no reconocida «${player.position}»`);
      }
      players.push({
        sourceId: player.playerId,
        firstName: manual?.firstName ?? name.firstName,
        lastName: manual?.lastName ?? name.lastName,
        nickname: null,
        birthDate,
        age: null,
        nationality: nationality ? nationFromGreek(nationality) : null,
        nationalityRaw: nationality,
        position,
        positionRaw: player.position,
        heightCm: player.heightCm,
        weightKg: null,
        shirtNumber: player.shirtNumber,
        licence: null,
        stats: statsById.get(player.playerId)?.stats ?? null
      });
    };
    for (const player of roster) {
      if (!listed.has(player.playerId)) addPlayer(player);
    }
    for (const entry of teamStats) {
      if (listed.has(entry.playerId)) continue;
      warn(
        `${label}: ${entry.name} jugó ${entry.stats.games} partidos y no está en la plantilla (sin ficha)`
      );
      addPlayer({
        playerId: entry.playerId,
        fullName: entry.name,
        fatherName: null,
        position: null,
        heightCm: null,
        birthDate: null,
        shirtNumber: null
      });
    }

    teams.push({
      sourceId: ref.teamId,
      name: label,
      shortName: null,
      city: info?.city ?? null,
      ...venueOf(ref.teamId, teamGames, warn, label),
      finalPosition: standing.rank,
      players,
      coach: coachOf(ref.teamId, teamGames, warn, label)
    });
  }
  log(`extranjeros: ${foreigners}, sin nacionalidad a mano: ${foreignersWithoutNation}`);

  const league: SourceLeague = {
    competitionId: 'grecia-2',
    name: 'Elite League',
    shortName: 'Elite',
    country: 'GRE',
    seasonStartYear: SEASON_START_YEAR,
    source: STATS,
    extractedAt: new Date().toISOString(),
    teams,
    warnings,
    promoted: { into: 'grecia-1', teamIds: [...PROMOTED_TEAM_IDS] }
  };
  const file = sourceFile('hbf-elite', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(file);
  log(
    `\n${client.networkRequests} peticiones a la red, ${Math.round((Date.now() - started) / 1000)} s`
  );
}

/**
 * El pabellón donde el equipo jugó más partidos en casa, transliterado, y su
 * aforo si está a mano (la federación no lo da; sin él, lo estima el montaje).
 */
function venueOf(
  teamId: string,
  teamGames: readonly HbfGame[],
  warn: (message: string) => void,
  label: string
): { pavilionName: string | null; pavilionCapacity: number | null } {
  const counts = new Map<string, number>();
  for (const game of teamGames) {
    if (game.homeId !== teamId || !game.venue) continue;
    counts.set(game.venue, (counts.get(game.venue) ?? 0) + 1);
  }
  const [venue] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  const manual = COACHES.pabellones[teamId];
  const pavilionName = manual?.pavilion ?? (venue ? greekNameToLatin(venue) : null);
  const pavilionCapacity = manual?.capacity ?? null;
  if (!pavilionName) warn(`${label}: sin pabellón`);
  if (pavilionCapacity === null) warn(`${label}: sin aforo a mano (el montaje lo estima)`);
  return { pavilionName, pavilionCapacity };
}

/**
 * El entrenador del acta del primer partido de liga regular del club (por
 * fecha), con su fecha y nacionalidad del fichero a mano; si el fichero trae
 * otro nombre, manda el fichero. Avisa de cada cambio de entrenador.
 */
function coachOf(
  teamId: string,
  teamGames: readonly HbfGame[],
  warn: (message: string) => void,
  label: string
): SourceCoach | null {
  const sequence: { date: string; name: string }[] = [];
  for (const game of [...teamGames].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
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
  const manual = COACHES.inicio[teamId];
  if (manual) {
    if (first) {
      const fromActa = hbfName(first.name, PLAYERS.habituales);
      if (fromActa.lastName.toLowerCase() !== manual.lastName.toLowerCase()) {
        warn(
          `${label}: el acta da a ${first.name} y a mano está ${manual.firstName} ${manual.lastName}`
        );
      }
    }
    if (!manual.birth && manual.age === undefined) {
      warn(`${label}: entrenador ${manual.firstName} ${manual.lastName} sin fecha de nacimiento`);
    }
    return coachFromManual(manual, `equipo-${teamId}`);
  }
  if (!first) {
    warn(`${label}: sin entrenador en las actas ni a mano`);
    return null;
  }
  const name = hbfName(first.name, PLAYERS.habituales);
  warn(`${label}: entrenador ${name.firstName} ${name.lastName} sin fecha ni país a mano`);
  return {
    sourceId: `equipo-${teamId}`,
    firstName: name.firstName,
    lastName: name.lastName,
    birthDate: null,
    age: null,
    nationality: null,
    nationalityRaw: null
  };
}

await main();
