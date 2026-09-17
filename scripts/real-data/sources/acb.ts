import { createHttpClient, type HttpClient } from '../lib/http';
import { toNationCode } from '../lib/nationalities';
import { toHeightCm, toInt, toIsoDate, toPosition } from '../lib/normalize';
import { cliOptions, sourceFile, summarizeLeague, writeSourceLeague } from '../lib/source-output';
import type { SourceLeague, SourcePlayer, SourceTeam } from '../lib/source-types';
import {
  canonicalTeamSlug,
  cityFromAcbAddress,
  parsePlayerProfile,
  parseRoster,
  parseStandings,
  parseTeamInfo,
  parseTeamStats,
  playerSlugs,
  toSourceStats,
  type AcbPlayerProfile,
  type AcbPlayerRef,
  type AcbRosterEntry,
  type AcbStatsEntry
} from './acb-parse';

/**
 * Extractor de la Liga Endesa (ACB) desde acb.com.
 *
 *   pnpm real:acb            usa la caché de descargas
 *   pnpm real:acb --force    lo vuelve a descargar todo
 *
 * acb.com muestra por defecto la temporada en curso; la 2025-26 es la edición
 * 90 y hay que pedirla en cada página (`editionId=90`, y `temporada=90` en la
 * clasificación, que usa otro nombre). Todo sale del HTML inicial, sin la API
 * interna.
 */

const BASE = 'https://acb.com';
const SEASON_START_YEAR = 2025;
const EDITION_ID = 90;
const REGULAR_SEASON = 'LR';

/**
 * Ciudad de cada club por su id de acb.com. La web no la publica (la dirección
 * del pabellón es sólo calle y número), así que se completa a mano con la
 * ciudad donde juega cada club; si algún día la dirección la trae, manda la
 * dirección. Incluye clubes de otras temporadas recientes para que un cambio
 * de año no deje huecos.
 */
const CLUB_CITIES: Record<string, string> = {
  '2': 'Barcelona',
  '3': 'Vitoria-Gasteiz',
  '4': 'Bilbao',
  '5': 'Las Palmas de Gran Canaria',
  '8': 'Badalona',
  '9': 'Madrid',
  '10': 'Manresa',
  '12': 'Murcia',
  '13': 'Valencia',
  '14': 'Málaga',
  '16': 'Zaragoza',
  '22': 'Andorra la Vella',
  '25': 'Lugo',
  '28': 'San Cristóbal de La Laguna',
  '57': 'Santiago de Compostela',
  '549': 'Burgos',
  '591': 'Girona',
  '592': 'Granada',
  '657': 'A Coruña',
  '658': 'Lleida'
};

const log = (message: string): void => console.log(message);

const warnings: string[] = [];
function warn(message: string): void {
  warnings.push(message);
  log(`  aviso: ${message}`);
}

function editionUrl(path: string, extra = ''): string {
  return `${BASE}${path}?editionId=${EDITION_ID}${extra}`;
}

/**
 * El slug actual del club. Las URL de equipo llevan el nombre comercial
 * («fiatc-girona-591») y, si no coincide con el vigente, la web redirige a la
 * ficha sin conservar `editionId`. Pidiendo un slug cualquiera con el id del
 * club, la redirección lleva a la página canónica y de ahí sale el bueno.
 */
async function teamSlug(client: HttpClient, clubId: string): Promise<string> {
  const html = await client.get(`${BASE}/es/liga/equipos/equipo-${clubId}`);
  const slug = canonicalTeamSlug(html);
  if (!slug || !slug.endsWith(`-${clubId}`)) {
    throw new Error(`No se ha encontrado la página del club ${clubId} en acb.com.`);
  }
  return slug;
}

function nicknameOf(player: AcbPlayerRef): string | null {
  // acb.com rellena «nickname» con el nombre de uso aunque coincida con el
  // legal («Kameron Taylor»); sólo se guarda cuando dice algo distinto.
  const nickname = player.nickname;
  if (!nickname) return null;
  const same = (a: string) => a.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  return same(nickname) === same(`${player.firstName} ${player.lastName}`) ? null : nickname;
}

function playerFrom(
  ref: AcbPlayerRef,
  roster: AcbRosterEntry | undefined,
  regular: AcbStatsEntry | undefined,
  profile: AcbPlayerProfile | null,
  teamName: string
): SourcePlayer {
  const label = `${teamName}: ${ref.firstName} ${ref.lastName}`;
  const nationalityRaw = roster?.nationalityCountry ?? profile?.nationality ?? null;
  const nationality = toNationCode(nationalityRaw);
  const positionRaw = roster?.player.gameRole ?? ref.gameRole ?? profile?.player?.gameRole ?? null;
  const position = toPosition(positionRaw);
  if (nationalityRaw && !nationality) {
    warn(`${label}: nacionalidad no reconocida «${nationalityRaw}»`);
  }
  if (positionRaw && !position) warn(`${label}: posición no reconocida «${positionRaw}»`);
  if (!profile) warn(`${label}: sin ficha de jugador (fecha de nacimiento desconocida)`);
  return {
    sourceId: ref.id,
    firstName: ref.firstName,
    lastName: ref.lastName,
    nickname: nicknameOf(ref),
    birthDate: toIsoDate(profile?.birthDate),
    age: roster?.age ?? null,
    nationality,
    nationalityRaw,
    position,
    positionRaw,
    heightCm: roster?.heightCm ?? toHeightCm(profile?.height),
    weightKg: null,
    shirtNumber: toInt(ref.shirtNumber),
    licence: roster?.licensing ?? profile?.licensing ?? null,
    stats: regular ? toSourceStats(regular.totals) : null
  };
}

async function main(): Promise<void> {
  const { force } = cliOptions();
  const client = createHttpClient({ minDelayMs: 1_200, force, log });
  const started = Date.now();

  log('Liga Endesa: clasificación…');
  const standings = parseStandings(
    await client.get(`${BASE}/es/liga/clasificacion?temporada=${EDITION_ID}`)
  );
  if (standings.season !== EDITION_ID) {
    throw new Error(
      `La clasificación es de la edición ${standings.season}, no de la ${EDITION_ID}.`
    );
  }
  if (standings.standings.length === 0) throw new Error('La clasificación ha salido vacía.');
  for (const row of standings.standings) {
    if (row.matchesPlayed !== standings.totalRounds) {
      warn(`${row.fullName} lleva ${row.matchesPlayed} de ${standings.totalRounds} jornadas`);
    }
  }

  const teams: SourceTeam[] = [];
  for (const standing of standings.standings) {
    log(`${standing.position}. ${standing.fullName}`);
    const slug = await teamSlug(client, standing.clubId);
    const teamPath = `/es/liga/equipos/${slug}`;
    const teamHtml = await client.get(editionUrl(teamPath));
    const info = parseTeamInfo(teamHtml);
    if (!info) warn(`${standing.fullName}: la ficha del equipo no tiene datos del club`);
    else if (info.editionId !== EDITION_ID) {
      warn(`${standing.fullName}: la ficha del equipo es de la edición ${info.editionId}`);
    }

    const rosterHtml = await client.get(editionUrl(`${teamPath}/plantilla`));
    const roster = parseRoster(rosterHtml);
    const otherEdition = roster.filter((entry) => entry.player.editionId !== EDITION_ID);
    if (otherEdition.length > 0) {
      warn(`${standing.fullName}: ${otherEdition.length} jugadores de plantilla de otra edición`);
    }

    // Estadísticas de toda la temporada (liga regular y playoffs juntos) para
    // saber quién jugó, y después sólo las de la liga regular, que se piden
    // con el id de su fase.
    const allHtml = await client.get(editionUrl(`${teamPath}/estadisticas`));
    const allStats = parseTeamStats(allHtml);
    const regularPhase = allStats.phases.find((phase) => phase.abbreviation === REGULAR_SEASON);
    let regular: AcbStatsEntry[];
    let regularHtml = '';
    if (regularPhase) {
      regularHtml = await client.get(
        editionUrl(`${teamPath}/estadisticas`, `&phaseId=${regularPhase.id}`)
      );
      regular = parseTeamStats(regularHtml).players;
    } else {
      warn(`${standing.fullName}: sin fase de liga regular; se usan los totales de la temporada`);
      regular = allStats.players;
    }

    // La plantilla es la del final de la temporada: quien se fue a mitad sólo
    // sale en las estadísticas. Se juntan por id, sin repetir a nadie.
    const refs = new Map<string, AcbPlayerRef>();
    for (const entry of [...roster, ...allStats.players, ...regular]) {
      if (!refs.has(entry.player.id)) refs.set(entry.player.id, entry.player);
    }
    const slugs = new Map([
      ...playerSlugs(regularHtml),
      ...playerSlugs(allHtml),
      ...playerSlugs(rosterHtml)
    ]);
    const rosterById = new Map(roster.map((entry) => [entry.player.id, entry]));
    const regularById = new Map(regular.map((entry) => [entry.player.id, entry]));

    const players: SourcePlayer[] = [];
    for (const [id, ref] of refs) {
      // Cualquier slug con el id acaba en la ficha buena; el de la página, si
      // está, se ahorra la redirección.
      const playerSlug = slugs.get(id) ?? `jugador-${id}`;
      const profile = parsePlayerProfile(
        await client.get(`${BASE}/es/liga/jugadores/${playerSlug}`)
      );
      players.push(
        playerFrom(ref, rosterById.get(id), regularById.get(id), profile, standing.fullName)
      );
    }

    // El nombre, de la clasificación: la ficha del club, aun pedida con la
    // edición, trae el patrocinador de ahora («Kids&Us Manresa» y no el «BAXI
    // Manresa» con el que jugó la 2025-26).
    const name = standing.fullName || info?.fullName || '';
    const city = cityFromAcbAddress(info?.stadiumAddress ?? null) ?? CLUB_CITIES[standing.clubId];
    if (!city) warn(`${name}: ciudad desconocida (club ${standing.clubId})`);
    teams.push({
      sourceId: standing.clubId,
      name,
      shortName: standing.abbreviatedName ?? info?.abbreviatedName ?? null,
      city: city ?? null,
      pavilionName: info?.stadiumName ?? null,
      pavilionCapacity: info?.stadiumCapacity ?? null,
      finalPosition: standing.position,
      players
    });
  }

  const league: SourceLeague = {
    competitionId: 'liga-nacional',
    name: 'Liga Endesa',
    shortName: 'ACB',
    country: 'ESP',
    seasonStartYear: SEASON_START_YEAR,
    source: BASE,
    extractedAt: new Date().toISOString(),
    teams,
    warnings
  };
  const file = sourceFile('acb', SEASON_START_YEAR);
  writeSourceLeague(file, league);
  log('');
  log(summarizeLeague(league));
  log(
    `\n${file}\n${client.networkRequests} peticiones a la red, ` +
      `${Math.round((Date.now() - started) / 1000)} s`
  );
}

await main();
