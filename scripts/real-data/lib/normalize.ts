import type { SourcePosition } from './source-types';

/**
 * Normalizaciones que comparten todos los extractores: posiciones, nombres de
 * persona, minutos, fechas y números. Todo función pura, para poder probarla
 * sin red.
 */

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/\./g, '')
    .trim();
}

const POSITIONS = new Map<string, SourcePosition>([
  ['base', 'PG'],
  ['b', 'PG'],
  ['pg', 'PG'],
  ['1', 'PG'],
  ['point guard', 'PG'],
  ['playmaker', 'PG'],
  ['escolta', 'SG'],
  ['e', 'SG'],
  ['sg', 'SG'],
  ['2', 'SG'],
  ['shooting guard', 'SG'],
  ['guard', 'SG'],
  ['g', 'SG'],
  ['alero', 'SF'],
  ['a', 'SF'],
  ['sf', 'SF'],
  ['3', 'SF'],
  ['small forward', 'SF'],
  ['forward', 'SF'],
  ['f', 'SF'],
  ['ala pivot', 'PF'],
  ['alapivot', 'PF'],
  ['a pivot', 'PF'],
  ['a piv', 'PF'],
  ['ala piv', 'PF'],
  ['ap', 'PF'],
  ['a p', 'PF'],
  ['pf', 'PF'],
  ['4', 'PF'],
  ['power forward', 'PF'],
  ['pivot', 'C'],
  ['p', 'C'],
  ['c', 'C'],
  ['5', 'C'],
  ['center', 'C'],
  ['centre', 'C']
]);

/**
 * La posición en PG/SG/SF/PF/C. Con dos posiciones («Base/Escolta», «F-C»)
 * cuenta la primera, que es la que la fuente pone como principal.
 */
export function toPosition(raw: string | null | undefined): SourcePosition | null {
  if (!raw) return null;
  const whole = plain(raw);
  if (whole === '') return null;
  const direct = POSITIONS.get(whole);
  if (direct) return direct;
  // «Ala-pívot» lleva guion y no es un combinado, por eso se prueba entero
  // antes de partir. Los combinados se parten por barra, coma o «y»; los
  // abreviados con guion («F-C»), por el espacio en que se ha convertido.
  const first = whole.split(/\s*(?:\/|,|;|\||\by\b)\s*/)[0] ?? '';
  const byFirst = POSITIONS.get(first.trim());
  if (byFirst) return byFirst;
  for (const size of [2, 1]) {
    const words = first.trim().split(' ').slice(0, size).join(' ');
    const found = POSITIONS.get(words);
    if (found) return found;
  }
  return null;
}

/** Partículas que van en minúscula dentro de un nombre («Sergio de Larrea»). */
const NAME_PARTICLES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'i',
  'da',
  'das',
  'do',
  'dos',
  'van',
  'von',
  'der',
  'den',
  'di',
  'du',
  'le',
  'ter',
  'ten'
]);

const ROMAN_NUMERALS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii']);

function capitalizeWord(word: string): string {
  // «Lutete IV»: los ordinales de los nombres anglosajones van enteros en mayúscula.
  if (ROMAN_NUMERALS.has(word.toLowerCase())) return word.toUpperCase();
  // Mayúscula tras guion y apóstrofo: «Saint-Supery», «O'Neal», «N´Guessan»; y
  // saltando lo que no es letra al principio: «(Palencia)».
  const capitalized = word
    .split(/([-'’´])/)
    .map((part) =>
      part.replace(
        /^(\P{L}*)(\p{L})/u,
        (_, lead: string, letter: string) => lead + letter.toUpperCase()
      )
    )
    .join('');
  // «MCDERMOTT» → «McDermott».
  if (/^Mc[a-z]{2,}/.test(capitalized)) {
    return 'Mc' + capitalized[2]!.toUpperCase() + capitalized.slice(3);
  }
  return capitalized;
}

/**
 * Un nombre en MAYÚSCULAS («SERGIO DE LARREA ABAD») con mayúscula inicial y
 * las partículas en minúscula. La primera palabra siempre va en mayúscula,
 * salvo que se diga que el texto es un trozo (unos apellidos que empiezan por
 * partícula, «de Larrea»).
 */
export function toNameCase(raw: string, { fragment = false } = {}): string {
  const words = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words
    .map((word, index) =>
      NAME_PARTICLES.has(word) && (index > 0 || fragment) && words.length > 1
        ? word
        : capitalizeWord(word)
    )
    .join(' ');
}

export interface PersonName {
  firstName: string;
  lastName: string;
}

/** Palabras del nombre con cada partícula pegada a la palabra que la sigue. */
function nameTokens(words: string[]): string[] {
  const tokens: string[] = [];
  let pending: string[] = [];
  for (const word of words) {
    pending.push(word);
    if (!NAME_PARTICLES.has(word.toLowerCase())) {
      tokens.push(pending.join(' '));
      pending = [];
    }
  }
  if (pending.length > 0) {
    if (tokens.length > 0) tokens[tokens.length - 1] += ' ' + pending.join(' ');
    else tokens.push(pending.join(' '));
  }
  return tokens;
}

/**
 * Separa un nombre completo en nombre y apellidos cuando la fuente no dice
 * dónde está el corte («ROLAND DENZEL ANDERSSON»). Es una aproximación: un
 * español lleva dos apellidos y un extranjero, uno; las partículas van con el
 * apellido al que preceden («dos Anjos de Paula»). Cuando la fuente sí da el
 * corte («ANDERSSON, ROLAND DENZEL») hay que usar `splitCommaName`.
 */
export function splitFullName(raw: string, { spanish }: { spanish: boolean }): PersonName {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const tokens = nameTokens(words);
  if (tokens.length <= 1) return { firstName: '', lastName: toNameCase(tokens[0] ?? '') };
  const surnames = spanish && tokens.length >= 3 ? 2 : 1;
  return {
    firstName: toNameCase(tokens.slice(0, -surnames).join(' ')),
    lastName: toNameCase(tokens.slice(-surnames).join(' '), { fragment: true })
  };
}

/** «DE SOUSA ANJO BRITO, DIOGO EMANUEL» → nombre y apellidos ya arreglados. */
export function splitCommaName(raw: string): PersonName | null {
  const comma = raw.indexOf(',');
  if (comma < 0) return null;
  const lastName = raw.slice(0, comma).trim();
  const firstName = raw.slice(comma + 1).trim();
  if (lastName === '') return null;
  return {
    firstName: toNameCase(firstName),
    lastName: toNameCase(lastName, { fragment: true })
  };
}

/** Primeras palabras de los nombres compuestos que se usan enteros («José María», «Jean Marc»). */
const COMPOUND_FIRST_WORDS = new Set(['jose', 'juan', 'maria', 'jean']);

/**
 * El nombre de pila con el que se conoce a alguien, a partir del legal: el
 * primero («Philip Alexander» → «Philip», «Karl Olle Viktor» → «Karl»), salvo
 * los compuestos que se usan enteros («José María», «Juan Manuel», «Miguel
 * Ángel», «Jean Marc»). Para las fuentes que sólo dan el nombre del DNI o del
 * pasaporte, como la FEB.
 */
export function usualFirstName(firstName: string): string {
  const words = firstName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] ?? '';
  const [first, second] = [plain(words[0] ?? ''), plain(words[1] ?? '')];
  const compound = COMPOUND_FIRST_WORDS.has(first) || (first === 'miguel' && second === 'angel');
  return compound ? words.slice(0, 2).join(' ') : (words[0] ?? '');
}

/**
 * Minutos jugados en segundos. Acepta «548:54» (minutos:segundos), «1:02:03»
 * y decimales con coma o punto («17,5» son 17 minutos y medio). Vacío o «-»
 * cuentan como cero: es lo que pone la fuente cuando no ha jugado.
 */
export function minutesToSeconds(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Math.round(raw * 60);
  const text = raw.trim();
  if (text === '' || text === '-') return 0;
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part.trim()));
    if (parts.some((part) => !Number.isFinite(part))) return 0;
    const [a = 0, b = 0, c] = parts;
    return c === undefined ? a * 60 + b : a * 3600 + b * 60 + c;
  }
  const decimal = Number(text.replace(',', '.'));
  return Number.isFinite(decimal) ? Math.round(decimal * 60) : 0;
}

/** «21/09/1996», «21-09-1996» (y lo que venga detrás, como la ciudad) → «1996-09-21». */
export function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(raw);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Un entero de un texto («15600 espectadores», « 23 »); `null` si no hay. */
export function toInt(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  const match = /-?\d+/.exec(raw.replace(/\./g, ''));
  return match ? Number(match[0]) : null;
}

/** Altura en centímetros: «203», «203 cm», «1,75», «1.75 m». */
export function toHeightCm(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(',', '.');
  const value = Number(/\d+(?:\.\d+)?/.exec(text)?.[0] ?? NaN);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cm = value < 3 ? Math.round(value * 100) : Math.round(value);
  // Fuera de lo humano es un error de la fuente, no un dato.
  return cm >= 140 && cm <= 240 ? cm : null;
}

/** Peso en kilos; «-» y valores imposibles son `null`. */
export function toWeightKg(raw: string | number | null | undefined): number | null {
  const value = toInt(raw ?? null);
  return value !== null && value >= 40 && value <= 180 ? value : null;
}

/**
 * Nombre de club o pabellón en MAYÚSCULAS con mayúscula inicial, respetando
 * las siglas conocidas («CB», «FC», «HLA») y los dominios («cloud.gal»).
 */
const ACRONYMS = new Set([
  'CB',
  'FC',
  'CD',
  'CE',
  'BC',
  'BM',
  'SAD',
  'UCAM',
  'HLA',
  'UBU',
  'ACB',
  'FEB',
  'CAB',
  'CBA',
  'CBC',
  'UE',
  'AE',
  'II',
  'III'
]);

export function toTitleCase(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const bare = word.replace(/[.,]/g, '');
      if (ACRONYMS.has(bare.toUpperCase()) && word === word.toUpperCase()) return word;
      const lower = word.toLowerCase();
      if (index > 0 && NAME_PARTICLES.has(lower)) return lower;
      // «CLOUD.GAL» → «Cloud.gal»: tras el punto de un dominio no va mayúscula.
      return capitalizeWord(lower);
    })
    .join(' ');
}

/**
 * Una fecha de nacimiento que puede ser la de un jugador de esa temporada: con
 * al menos catorce años al empezar y nacido después de 1960. Las fuentes
 * ponen a veces la del alta («2025-10-02») en los canteranos; eso es `null`.
 */
export function plausibleBirthDate(
  date: string | null | undefined,
  seasonStartYear: number
): string | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return year >= 1960 && year <= seasonStartYear - 14 ? date : null;
}
