import { nationFromIso3, toNationCode } from '../lib/nationalities';
import { toIsoDate, toNameCase, usualFirstName } from '../lib/normalize';
import type { SourcePosition, SourceStats } from '../lib/source-types';
import { plainName } from './aba-parse';
import { addLine, emptyStats, playedIn, type BoxNumbers } from './lkl-parse';

/**
 * Lectura de la web de la Asociación de Clubes (laliganacional.com.ar), la de
 * la Liga Nacional argentina y La Liga Argentina, su segunda división. Es una
 * aplicación de ASP.NET (Razor Pages) que pinta el HTML en el servidor:
 *
 * - El calendario de un equipo (`/<sección>/equipo/<club>/<equipo>/<slug>/inicio
 *   ?handler=CargarSubPagina&aux=calendario`): todos sus partidos de la
 *   temporada, de todas las competiciones y fases mezcladas, con local y
 *   visitante (`club` y `equipo`), tanteo, fecha, pabellón y el enlace al acta.
 *   El `equipo` es el de esa temporada (cambia cada año); el `club`, no.
 * - El acta (`/<sección>/partido/<id cifrado>/<slug>`): el primer entrenador
 *   de cada equipo y una fila por jugador con sus números en un JSON
 *   (`EstadisticasComponente({…})`): minutos «mm:ss», titular, tiros, rebotes,
 *   tapones y faltas cometidos y recibidos, valoración. Sin mates.
 * - La ficha del jugador: nombre legal y fecha de nacimiento. Nada más: la web
 *   no da ni la altura, ni el puesto, ni la nacionalidad de nadie.
 *
 * El id de jugador es el de su inscripción en un club: quien cambió de equipo
 * a mitad de temporada tiene otro id en el segundo.
 *
 * Lo que la web no da sale de las fichas de los clubes en la Wikipedia en
 * español (`parseWikiRoster`) y, sin ellas, del estilo de juego
 * (`positionFromStats`).
 */

/* ------------------------------------------------------------ comunes */

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function clean(text: string): string {
  return decode(text).replace(/\s+/g, ' ').trim();
}

/* --------------------------------------------------------- calendario */

export interface AdcTeamRef {
  clubId: string;
  /** Id del equipo en la temporada. */
  teamId: string;
  slug: string;
  name: string;
}

export interface AdcGame {
  home: AdcTeamRef;
  away: AdcTeamRef;
  /** `AAAA-MM-DD`; `null` en los partidos sin fecha (los que no se jugaron). */
  date: string | null;
  /** «hh:mm». */
  time: string | null;
  venue: string | null;
  homeScore: number;
  awayScore: number;
  /** Ruta del acta (`/laliga/partido/<id>/<slug>`); el id va cifrado y cambia en cada visita. */
  link: string | null;
}

/** Los partidos del calendario de un equipo (de todas las competiciones de la temporada). */
export function parseAdcCalendar(html: string): AdcGame[] {
  const games: AdcGame[] = [];
  for (const [, row = ''] of html.matchAll(
    /<tr class="fila-tabla-calendarios">([\s\S]*?)<\/tr>/g
  )) {
    const refs: AdcTeamRef[] = [];
    for (const match of row.matchAll(
      /href="\/[\w-]+\/equipo\/(\d+)\/(\d+)\/([^/"]+)\/inicio" title="([^"]*)"/g
    )) {
      const ref = { clubId: match[1]!, teamId: match[2]!, slug: match[3]!, name: clean(match[4]!) };
      if (!refs.some((entry) => entry.teamId === ref.teamId)) refs.push(ref);
    }
    const [home, away] = refs;
    if (!home || !away) continue;
    const scores = [...row.matchAll(/<td class="resultados"><strong>(\d*)<\/strong>/g)].map(
      (match) => Number(match[1] || 0)
    );
    const when =
      /<td class="fecha-campo[^"]*">\s*(?:<strong>([^<]*)<\/strong>)?\s*<small>([^<]*)<\/small>/.exec(
        row
      );
    const stamp = clean(when?.[1] ?? '');
    const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))?/.exec(stamp);
    const link = /href="(\/[\w-]+\/partido\/[^"]+)"/.exec(row)?.[1] ?? null;
    games.push({
      home,
      away,
      date: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
      time: dateMatch?.[4] ?? null,
      venue: clean(when?.[2] ?? '') || null,
      homeScore: scores[0] ?? 0,
      awayScore: scores[1] ?? 0,
      link: link ? decode(link) : null
    });
  }
  return games;
}

/* --------------------------------------------------------------- acta */

export interface AdcBoxLine extends BoxNumbers {
  teamId: string;
  clubId: string;
  playerId: string;
  /** «GUERRERO, J.»: el apellido de uso y la inicial. */
  shortName: string;
  /** «GUERRERO MARGARIT, JUAN MARTIN»: el nombre legal. */
  fullName: string;
  /** El de la ficha: `/<sección>/jugador/<club>/<equipo>/<id>/<slug>`. */
  slug: string | null;
  shirtNumber: number | null;
}

export interface AdcBoxScore {
  /** El primer entrenador de cada equipo, por id de equipo; vacío si el acta no lo pone. */
  coaches: Map<string, string>;
  lines: AdcBoxLine[];
}

interface AdcShooting {
  Aciertos: number;
  Totales: number;
}

interface AdcJsonLine {
  IdJugador: number;
  IdClub: number;
  IdEquipo: number;
  Dorsal: string | null;
  Nombre: string | null;
  NombreCompleto: string | null;
  Puntos: number;
  TirosDos: AdcShooting;
  TirosTres: AdcShooting;
  TirosLibres: AdcShooting;
  ReboteDefensivo: number;
  ReboteOfensivo: number;
  Asistencias: number;
  Recuperaciones: number;
  Perdidas: number;
  TaponCometido: number;
  TaponRecibido: number;
  FaltaCometida: number;
  FaltaRecibida: number;
  Valoracion: number;
  TiempoJuego: string | null;
  CincoInicial: boolean;
}

/** «19:46» (minutos y segundos) en segundos. */
function secondsOf(raw: string | null | undefined): number {
  const match = /^(\d+):(\d{1,2})$/.exec((raw ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/** Las filas del acta y su entrenador; `null` si la página no es un acta. */
export function parseAdcBoxScore(html: string): AdcBoxScore | null {
  if (!html.includes('EstadisticasComponente(')) return null;
  const coaches = new Map<string, string>();
  for (const match of html.matchAll(
    /\/escudos\/\d+\/(\d+)[^>]*>\s*<strong>[^<]*<\/strong>\s*<\/div>\s*<div class="entrenador[^"]*">\s*<strong>Entrenador:<\/strong>\s*(?:<br\s*\/?>)?\s*<span>([^<]*)<\/span>/g
  )) {
    const name = clean(match[2]!);
    if (name && !coaches.has(match[1]!)) coaches.set(match[1]!, name);
  }
  const lines: AdcBoxLine[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/EstadisticasComponente\((\{.*?\})(?=\s*,\s*')([^)]*)\)/g)) {
    const row = JSON.parse(decode(match[1]!)) as AdcJsonLine;
    // Las filas de totales llevan el id 0.
    if (!row.IdJugador) continue;
    const key = `${row.IdJugador}|${row.IdEquipo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const args = [...decode(match[2]!).matchAll(/'([^']*)'/g)].map((arg) => arg[1] ?? '');
    const shirt = Number(row.Dorsal);
    lines.push({
      teamId: String(row.IdEquipo),
      clubId: String(row.IdClub),
      playerId: String(row.IdJugador),
      shortName: clean(row.Nombre ?? ''),
      fullName: clean(row.NombreCompleto ?? ''),
      slug: args.at(-1) || null,
      shirtNumber:
        row.Dorsal !== null && row.Dorsal !== '' && Number.isInteger(shirt) ? shirt : null,
      starter: row.CincoInicial,
      seconds: secondsOf(row.TiempoJuego),
      points: row.Puntos,
      twoPointMade: row.TirosDos.Aciertos,
      twoPointAttempted: row.TirosDos.Totales,
      threePointMade: row.TirosTres.Aciertos,
      threePointAttempted: row.TirosTres.Totales,
      freeThrowMade: row.TirosLibres.Aciertos,
      freeThrowAttempted: row.TirosLibres.Totales,
      offensiveRebounds: row.ReboteOfensivo,
      defensiveRebounds: row.ReboteDefensivo,
      assists: row.Asistencias,
      steals: row.Recuperaciones,
      turnovers: row.Perdidas,
      blocks: row.TaponCometido,
      blocksReceived: row.TaponRecibido,
      fouls: row.FaltaCometida,
      foulsDrawn: row.FaltaRecibida,
      rating: row.Valoracion
    });
  }
  return { coaches, lines };
}

export interface AdcPlayerStats {
  playerId: string;
  teamId: string;
  /** La última línea de acta: nombres, dorsal y ficha. */
  line: AdcBoxLine;
  stats: SourceStats;
}

/** Suma las actas por jugador y equipo; sólo los partidos que jugó. */
export function aggregateAdcBoxScores(lines: readonly AdcBoxLine[]): AdcPlayerStats[] {
  const byKey = new Map<string, AdcPlayerStats>();
  for (const line of lines) {
    if (!playedIn(line)) continue;
    const key = `${line.playerId}|${line.teamId}`;
    const entry = byKey.get(key) ?? {
      playerId: line.playerId,
      teamId: line.teamId,
      line,
      stats: emptyStats()
    };
    addLine(entry.stats, line);
    entry.line = line;
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

/* -------------------------------------------------------------- ficha */

/** La fecha de nacimiento de la ficha (`AAAA-MM-DD`); `null` si no la trae. */
export function parseAdcPlayerPage(html: string): string | null {
  const match = /Fecha de nacimiento:\s*<\/strong>\s*(\d{2}\/\d{2}\/\d{4})/.exec(html);
  return match ? toIsoDate(match[1]) : null;
}

/* ------------------------------------------------- nombres y tildes */

/**
 * Nombres y apellidos que en español llevan tilde, sin ella: la web los
 * escribe en mayúsculas y casi siempre sin tildes («CAFFARO, FRANCISCO»,
 * «FERNANDEZ, VICTOR LUIS»). Sólo se aplican a los de países de habla
 * hispana: «Martin» es Martín en un argentino y no en un estadounidense.
 */
const ACCENTED = new Map(
  [
    // Nombres de pila.
    'Adrián',
    'Agustín',
    'Álvaro',
    'Andrés',
    'Ángel',
    'Aarón',
    'Benjamín',
    'César',
    'Cristián',
    'Damián',
    'Efraín',
    'Elías',
    'Fabián',
    'Fermín',
    'Gastón',
    'Germán',
    'Hernán',
    'Héctor',
    'Iván',
    'Jerónimo',
    'Joaquín',
    'Jesús',
    'José',
    'Julián',
    'Martín',
    'Matías',
    'Néstor',
    'Máximo',
    'Nicolás',
    'Óscar',
    'Raúl',
    'Ramón',
    'Román',
    'Rubén',
    'Sebastián',
    'Simón',
    'Tobías',
    'Tomás',
    'Valentín',
    'Víctor',
    // Apellidos.
    'Álvarez',
    'Andújar',
    'Ávila',
    'Báez',
    'Benítez',
    'Cáceres',
    'Calderón',
    'Chávez',
    'Colón',
    'Díaz',
    'Domínguez',
    'Farías',
    'Fernández',
    'Gálvez',
    'García',
    'Giménez',
    'Gómez',
    'González',
    'Gutiérrez',
    'Guzmán',
    'Hernández',
    'Ibáñez',
    'Jáuregui',
    'Jiménez',
    'Juárez',
    'López',
    'Marín',
    'Márquez',
    'Martínez',
    'Mejía',
    'Méndez',
    'Monzón',
    'Muñiz',
    'Muñoz',
    'Núñez',
    'Ordóñez',
    'Páez',
    'Peña',
    'Pérez',
    'Quiñones',
    'Ramírez',
    'Ríos',
    'Rodríguez',
    'Sáenz',
    'Sáez',
    'Sánchez',
    'Solís',
    'Suárez',
    'Téllez',
    'Valdés',
    'Vázquez',
    'Velázquez',
    'Zúñiga'
  ].map((word) => [plainName(word), word] as const)
);

/**
 * Los países de habla hispana: a sus jugadores se les ponen las tildes del
 * diccionario ({@link ACCENTED}).
 */
export const SPANISH_SPEAKING = new Set([
  'ARG',
  'URU',
  'PAR',
  'CHI',
  'BOL',
  'PER',
  'ECU',
  'COL',
  'VEN',
  'PAN',
  'CRC',
  'NCA',
  'HON',
  'ESA',
  'GUA',
  'MEX',
  'CUB',
  'DOM',
  'PUR',
  'ESP'
]);

/**
 * Pone tildes a las palabras de un nombre: las de la grafía de la Wikipedia
 * (`reference`) cuando es la misma palabra sin tildes y, si no está, las del
 * diccionario (sólo si `spanish`).
 */
export function accentName(text: string, reference: string | null, spanish: boolean): string {
  const known = new Map<string, string>();
  for (const word of (reference ?? '').split(/[\s-]+/)) {
    const key = plainName(word);
    if (key && /\p{L}/u.test(word)) known.set(key, word.replace(/[^\p{L}'’]/gu, ''));
  }
  return text
    .split(' ')
    .map((word) => {
      const key = plainName(word);
      const fromReference = known.get(key);
      if (fromReference && fromReference.length === word.length) return fromReference;
      const fromDictionary = spanish ? ACCENTED.get(key) : undefined;
      return fromDictionary ?? word;
    })
    .join(' ');
}

/** Sufijos del apellido, siempre igual: «JR», «JR.» → «Jr.»; «III» → «III». */
const SUFFIXES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV',
  v: 'V'
};

function fixSuffixes(lastName: string): string {
  const words = lastName.split(' ');
  return words
    .map((word, index) => (index > 0 ? (SUFFIXES[word.toLowerCase()] ?? word) : word))
    .join(' ');
}

/**
 * El nombre de uso de un jugador del acta:
 * - el apellido, el de uso que da la propia acta («GUERRERO, J.» de
 *   «GUERRERO MARGARIT, JUAN MARTIN»);
 * - el nombre de pila, el primero del legal salvo los compuestos que se usan
 *   enteros (`usualFirstName`: Juan Martín, José Ignacio);
 * - las tildes, de la Wikipedia (`reference`) o del diccionario si es de un
 *   país de habla hispana.
 */
export function adcName(
  shortName: string,
  fullName: string,
  reference: string | null,
  spanish: boolean
): { firstName: string; lastName: string } {
  const [fullLast = '', fullFirst = ''] = fullName.split(',').map((part) => part.trim());
  let shortLast = (shortName.split(',')[0] ?? '').trim();
  // El corto pierde a veces el sufijo del legal («ROBINSON, D.» de «ROBINSON III»).
  const suffix = fullLast.split(/\s+/).at(-1) ?? '';
  const fullWords = fullLast.split(/\s+/);
  if (
    shortLast &&
    fullWords.length > 1 &&
    SUFFIXES[suffix.toLowerCase()] &&
    !shortLast.split(/\s+/).some((word) => SUFFIXES[word.toLowerCase()])
  ) {
    shortLast = `${shortLast} ${suffix}`;
  }
  const lastName = fixSuffixes(toNameCase(shortLast || fullLast, { fragment: false }));
  const firstName = usualFirstName(toNameCase(fullFirst));
  return {
    firstName: accentName(firstName, reference, spanish),
    lastName: accentName(lastName, reference, spanish)
  };
}

/**
 * Nombres de pila corrientes en Argentina (y en los países de alrededor), sin
 * tildes. Un jugador sin nacionalidad conocida cuyo primer nombre no está aquí
 * es sospechoso de ser extranjero: el extractor avisa.
 */
const LOCAL_FIRST_NAMES = new Set(
  (
    'agustin alan alejandro alex alexis alfredo alvaro andres angel ariel augusto axel bautista ' +
    'benjamin bernardo brian bruno camilo carlos cesar christian cristian cristobal damian daniel ' +
    'dante dario david diego eduardo elias emanuel emiliano emilio enzo esteban ezequiel facundo ' +
    'federico felipe fermin fernando francisco franco gabriel gaston gerardo german gonzalo ' +
    'guillermo gustavo hector hernan hugo ignacio ivan jeronimo joaquin jorge jose juan julian ' +
    'julio lautaro leandro leonardo leonel lisandro lorenzo luca lucas luciano lucio luis manuel ' +
    'marcelo marco marcos mariano mario martin mateo matias mauro maximiliano maximo miguel ' +
    'milton nahuel nazareno nicolas octavio omar oscar pablo patricio pedro rafael ramiro ramon ' +
    'raul renzo ricardo roberto rodrigo roman ruben salvador santiago santino sebastian sergio ' +
    'simon thiago tiago tobias tomas ulises valentin valentino victor walter uriel ian ivo ' +
    'marcio mateus gino genaro fidel leon geronimo ' +
    'jeremias exequiel alejo segundo jacinto martino piero fausto ciro natalio romeo albano ' +
    'giovanni aaron nestor ezequiel mateo benicio bastian joel ismael'
  ).split(/\s+/)
);

/** ¿Sugiere el nombre un jugador de fuera? Un sufijo anglosajón o un nombre de pila poco corriente aquí. */
export function looksForeign(fullName: string): boolean {
  const [last = '', first = ''] = fullName.split(',').map((part) => part.trim().toLowerCase());
  if (/\b(jr\.?|ii|iii|iv)$/.test(last)) return true;
  const given = plainName(first.split(/\s+/)[0] ?? '');
  return given !== '' && !LOCAL_FIRST_NAMES.has(given);
}

/* ---------------------------------------------------------- Wikipedia */

export interface WikiRosterEntry {
  /** El nombre de uso, con sus tildes («Francisco Cáffaro»). */
  name: string;
  nationalityRaw: string | null;
  positionRaw: string | null;
  heightCm: number | null;
  birthDate: string | null;
}

/** Los parámetros de una plantilla, partidos por las barras que no están dentro de otra. */
function templateParams(body: string): Map<string, string> {
  const params = new Map<string, string>();
  let depth = 0;
  let current = '';
  const parts: string[] = [];
  for (let index = 0; index < body.length; index++) {
    const pair = body.slice(index, index + 2);
    if (pair === '{{' || pair === '[[') {
      depth++;
      current += pair;
      index++;
    } else if ((pair === '}}' || pair === ']]') && depth > 0) {
      depth--;
      current += pair;
      index++;
    } else if (body[index] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += body[index];
  }
  parts.push(current);
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  return params;
}

/** «[[Agustín Barreiro (baloncestista)|Agustín Bareiro]] {{capitán}}» → «Agustín Bareiro». */
function wikiText(raw: string): string {
  return raw
    .replace(/<small>[\s\S]*?<\/small>|<ref[\s\S]*?(?:<\/ref>|\/>)|<[^>]+>/g, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «2,03 m», «1.85 m», «203 cm» o pies y pulgadas → centímetros. */
function wikiHeight(params: Map<string, string>): number | null {
  const raw = params.get('altura') ?? '';
  const metres = /(\d)[,.](\d{2})\s*m/.exec(raw);
  let cm: number | null = metres ? Number(metres[1]) * 100 + Number(metres[2]) : null;
  if (cm === null) {
    const centimetres = /(\d{3})\s*cm/.exec(raw);
    if (centimetres) cm = Number(centimetres[1]);
  }
  if (cm === null && params.get('ft')) {
    const feet = Number(params.get('ft'));
    const inches = Number(params.get('in') || 0);
    if (Number.isFinite(feet) && Number.isFinite(inches))
      cm = Math.round((feet * 12 + inches) * 2.54);
  }
  return cm !== null && cm >= 160 && cm <= 235 ? cm : null;
}

/**
 * Los jugadores de las plantillas de la ficha de un club en la Wikipedia en
 * español: `{{Equipo de baloncesto jugador|…}}` o `{{player2|…}}`, con
 * nacionalidad (código COI, ISO o el nombre del país), puesto (B, E, A, AP,
 * P o en inglés), altura y la fecha de `{{edad|día|mes|año}}`.
 */
export function parseWikiRoster(wikitext: string): WikiRosterEntry[] {
  const entries: WikiRosterEntry[] = [];
  const start = /\{\{\s*(?:Equipo de baloncesto jugador|player2)\s*\|/gi;
  for (const match of wikitext.matchAll(start)) {
    // Hasta la llave que cierra esta plantilla.
    let depth = 0;
    let end = match.index;
    for (let index = match.index; index < wikitext.length - 1; index++) {
      const pair = wikitext.slice(index, index + 2);
      if (pair === '{{') {
        depth++;
        index++;
      } else if (pair === '}}') {
        depth--;
        index++;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    const body = wikitext.slice(match.index + 2, end - 2);
    const params = templateParams(body);
    const name = wikiText(
      params.get('nombre') ?? `${params.get('first') ?? ''} ${params.get('last') ?? ''}`
    );
    if (!name) continue;
    const age = /\{\{\s*edad\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{4})/i.exec(
      params.get('edad') ?? body
    );
    entries.push({
      name,
      nationalityRaw: (params.get('nac') ?? params.get('nat') ?? '').trim() || null,
      positionRaw: (params.get('pos') ?? '').trim() || null,
      heightCm: wikiHeight(params),
      birthDate: age ? `${age[3]}-${age[2]!.padStart(2, '0')}-${age[1]!.padStart(2, '0')}` : null
    });
  }
  return entries;
}

/** La nacionalidad de la plantilla de la Wikipedia: COI, ISO («BHS») o el nombre («Cabo Verde»). */
export function wikiNationality(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(/\{\{[^|}]*\|?([^}]*)\}\}/g, '$1').trim();
  if (!text) return null;
  return /^[A-Za-z]{3}$/.test(text)
    ? (toNationCode(text) ?? nationFromIso3(text))
    : toNationCode(text);
}

/**
 * El puesto de la plantilla de la Wikipedia: B, E, A, AP, P (o en inglés: PG,
 * SG, SF, PF, C). «G» (base o escolta) y «F» (alero o ala-pívot) no bastan:
 * se devuelven aparte para decidir con las estadísticas.
 */
export function wikiPosition(raw: string | null | undefined): SourcePosition | 'G' | 'F' | null {
  switch ((raw ?? '').trim().toUpperCase()) {
    case 'B':
    case 'PG':
    case 'BASE':
      return 'PG';
    case 'E':
    case 'SG':
    case 'ESCOLTA':
      return 'SG';
    case 'A':
    case 'SF':
    case 'ALERO':
      return 'SF';
    case 'AP':
    case 'PF':
    case 'ALA-PÍVOT':
      return 'PF';
    case 'P':
    case 'C':
    case 'PÍVOT':
      return 'C';
    case 'G':
      return 'G';
    case 'F':
      return 'F';
    default:
      return null;
  }
}

/**
 * ¿Es este jugador del acta el de la plantilla de la Wikipedia? El primer
 * nombre de la Wikipedia tiene que ser uno de sus nombres de pila (o el
 * principio de uno: «Seba») y alguna otra palabra, uno de sus apellidos (sin
 * tildes ni mayúsculas).
 */
export function sameWikiPlayer(fullName: string, wikiName: string): boolean {
  const [last = '', first = ''] = fullName.split(',');
  const surnames = new Set(
    last
      .split(/[\s-]+/)
      .map(plainName)
      .filter(Boolean)
  );
  const given = new Set(first.split(/\s+/).map(plainName).filter(Boolean));
  const words = wikiName
    .split(/[\s-]+/)
    .map(plainName)
    .filter(Boolean);
  if (words.length < 2) return false;
  // El primero puede ser un diminutivo del nombre de pila: «Seba» (Sebastián).
  const lead = words[0]!;
  const givenMatch =
    given.has(lead) || (lead.length >= 3 && [...given].some((name) => name.startsWith(lead)));
  return givenMatch && words.slice(1).some((word) => surnames.has(word));
}

/* ------------------------------------------ puesto por las estadísticas */

/**
 * El puesto de un jugador del que no se sabe ni el puesto ni la altura,
 * según cómo juega (por 36 minutos). Calibrado con los jugadores de la Liga
 * Nacional 2025-26 que sí lo tienen en la Wikipedia (113 con 150 minutos o
 * más: acierta el 58 % y el 91 % queda como mucho a un puesto):
 *
 * 1. Pívot: casi no tira triples (menos del 10 % de sus tiros) y coge 8
 *    rebotes o más, o 3,5 ofensivos o más.
 * 2. Ala-pívot: 6,5 rebotes o más y menos de 3 asistencias.
 * 3. Base: 3 asistencias o más.
 * 4. Escolta: 2,3 asistencias o más.
 * 5. Alero: el resto.
 *
 * Con menos de {@link MIN_MINUTES_FOR_POSITION} minutos los números no dicen
 * nada: `null` (el montaje le pone el de por defecto).
 */
export const MIN_MINUTES_FOR_POSITION = 60;

export function positionFromStats(
  stats: SourceStats | null,
  hint: 'G' | 'F' | null = null
): SourcePosition | null {
  if (!stats || stats.seconds < MIN_MINUTES_FOR_POSITION * 60) {
    return hint === 'G' ? 'SG' : hint === 'F' ? 'SF' : null;
  }
  const per36 = (value: number): number => (value * 36 * 60) / stats.seconds;
  const assists = per36(stats.assists);
  const rebounds = per36(stats.offensiveRebounds + stats.defensiveRebounds);
  const offensive = per36(stats.offensiveRebounds);
  const attempts = stats.twoPointAttempted + stats.threePointAttempted;
  const threeShare = attempts > 0 ? stats.threePointAttempted / attempts : 0;
  if (hint === 'G') return assists >= 3 ? 'PG' : 'SG';
  if (hint === 'F') return rebounds >= 6.5 ? 'PF' : 'SF';
  if ((threeShare < 0.1 && rebounds >= 8) || offensive >= 3.5) return 'C';
  if (rebounds >= 6.5 && assists < 3) return 'PF';
  if (assists >= 3) return 'PG';
  if (assists >= 2.3) return 'SG';
  return 'SF';
}
