import { toNationCode } from './nationalities';
import { toNameCase } from './normalize';

/**
 * Lo que hace falta para leer las fuentes griegas: pasar el alfabeto griego al
 * latino y entender los países escritos en griego. Todo función pura.
 */

/** ¿Lleva letras griegas? */
export function isGreekScript(text: string): boolean {
  return /\p{Script=Greek}/u.test(text);
}

const LETTERS: Record<string, string> = {
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o'
};

/** Las mayúsculas latinas que son iguales que una griega. */
const HOMOGLYPHS: Record<string, string> = {
  A: 'Α',
  B: 'Β',
  E: 'Ε',
  Z: 'Ζ',
  H: 'Η',
  I: 'Ι',
  K: 'Κ',
  M: 'Μ',
  N: 'Ν',
  O: 'Ο',
  P: 'Ρ',
  T: 'Τ',
  Y: 'Υ',
  X: 'Χ'
};

/**
 * esake escribe a veces con letras latinas en mitad de una palabra griega
 * («ΜAΡΛΟΟΥ», con la A latina). En las palabras que llevan alguna letra
 * griega, las mayúsculas latinas que se parecen a una griega pasan a serlo.
 */
export function greekHomoglyphs(text: string): string {
  return text.replace(/[\p{L}\p{M}]+/gu, (word) =>
    /\p{Script=Greek}/u.test(word)
      ? word.replace(/[ABEZHIKMNOPTYX]/g, (c) => HOMOGLYPHS[c] ?? c)
      : word
  );
}

/** Después de estas letras (y a final de palabra) «αυ», «ευ», «ηυ» suenan «af», «ef», «if». */
const VOICELESS = new Set(['θ', 'κ', 'ξ', 'π', 'σ', 'ς', 'τ', 'φ', 'χ', 'ψ']);

/**
 * Transliteración ELOT 743 (la de los pasaportes griegos, ISO 843) de un texto
 * en griego, en minúsculas: «Κώστας» → «kostas», «ΜΠΑΣΚΕΤΜΠΟΛ» →
 * «mpasketmpol», «ΚΑΪΚΙ» → «kaiki». «μπ», «ντ» y «γκ» se dejan como
 * «mp», «nt» y «gk», como en el pasaporte. Lo que no es griego (letras
 * latinas, guiones, espacios) pasa igual.
 */
export function transliterateGreek(text: string): string {
  // Sin tildes, pero con la diéresis marcada: «ϊ» rompe el diptongo.
  const chars: { letter: string; diaeresis: boolean }[] = [];
  for (const char of greekHomoglyphs(text).normalize('NFD').toLowerCase()) {
    if (char.codePointAt(0) === 0x308) {
      const last = chars[chars.length - 1];
      if (last) last.diaeresis = true;
      continue;
    }
    if (/\p{M}/u.test(char)) continue;
    chars.push({ letter: char, diaeresis: false });
  }
  let out = '';
  for (let index = 0; index < chars.length; index++) {
    const { letter } = chars[index]!;
    const next = chars[index + 1];
    const after = chars[index + 2]?.letter;
    const pairsWithNext = next !== undefined && !next.diaeresis;
    if (pairsWithNext && letter === 'ο' && next.letter === 'υ') {
      out += 'ou';
      index++;
      continue;
    }
    if (
      pairsWithNext &&
      (letter === 'α' || letter === 'ε' || letter === 'η') &&
      next.letter === 'υ'
    ) {
      const voiceless = after === undefined || VOICELESS.has(after) || !LETTERS[after];
      out += (LETTERS[letter] ?? letter) + (voiceless ? 'f' : 'v');
      index++;
      continue;
    }
    if (letter === 'γ' && next && ['γ', 'ξ', 'χ'].includes(next.letter)) {
      out += 'n';
      continue;
    }
    out += LETTERS[letter] ?? letter;
  }
  return out;
}

/** Un nombre en griego (o ya en latino) con mayúscula inicial: «ΠΡΩΤΟΣ» → «Protos». */
export function greekNameToLatin(raw: string): string {
  // «ΝΙΚΟΣ - ΠΕΤΡΟΣ»: los compuestos con guion, sin espacios alrededor.
  const text = raw
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
  if (text === '') return '';
  return toNameCase(isGreekScript(text) ? transliterateGreek(text) : text);
}

/**
 * Los países como los escriben las webs griegas, ya en latino con
 * {@link transliterateGreek} (así da igual cómo vengan acentuados). Sólo los
 * que salen en el baloncesto; uno que falte se avisa en el extractor.
 */
const GREEK_COUNTRIES: Record<string, string> = {
  ellada: 'GRE',
  elliniki: 'GRE',
  ellas: 'GRE',
  ipa: 'USA',
  'inomenes politeies': 'USA',
  'inomenes politeies amerikis': 'USA',
  gallia: 'FRA',
  lithouania: 'LTU',
  ispania: 'ESP',
  tourkia: 'TUR',
  servia: 'SRB',
  'megali vretania': 'GBR',
  'inomeno vasileio': 'GBR',
  anglia: 'GBR',
  nigiria: 'NGR',
  kanadas: 'CAN',
  kypros: 'CYP',
  georgia: 'GEO',
  vrazilia: 'BRA',
  irlandia: 'IRL',
  lefkorosia: 'BLR',
  angkola: 'ANG',
  gkampon: 'GAB',
  velgio: 'BEL',
  finlandia: 'FIN',
  italia: 'ITA',
  germania: 'GER',
  slovenia: 'SLO',
  kroatia: 'CRO',
  mavrovounio: 'MNE',
  vosnia: 'BIH',
  'vosnia erzegovini': 'BIH',
  'vosnia kai erzegovini': 'BIH',
  'voreia makedonia': 'MKD',
  'b makedonia': 'MKD',
  pgdm: 'MKD',
  alvania: 'ALB',
  voulgaria: 'BUL',
  roumania: 'ROU',
  ouggaria: 'HUN',
  slovakia: 'SVK',
  tsechia: 'CZE',
  polonia: 'POL',
  oukrania: 'UKR',
  rosia: 'RUS',
  lettonia: 'LAT',
  esthonia: 'EST',
  ollandia: 'NED',
  dania: 'DEN',
  souidia: 'SWE',
  norvigia: 'NOR',
  afstria: 'AUT',
  elvetia: 'SUI',
  portogalia: 'POR',
  israil: 'ISR',
  kosovo: 'KOS',
  armenia: 'ARM',
  afstralia: 'AUS',
  'nea zilandia': 'NZL',
  argentini: 'ARG',
  mexiko: 'MEX',
  tzamaika: 'JAM',
  mpachames: 'BAH',
  'dominikani dimokratia': 'DOM',
  'portu riko': 'PUR',
  venezouela: 'VEN',
  ouroguoui: 'URU',
  kamerroun: 'CMR',
  kameroun: 'CMR',
  senegali: 'SEN',
  mali: 'MLI',
  'akti elefantostou': 'CIV',
  gkana: 'GHA',
  aigyptos: 'EGY',
  'notio soudan': 'SSD',
  'notios soudan': 'SSD',
  soudan: 'SUD',
  kongko: 'CGO',
  'la kongko': 'COD',
  'dimokratia tou kongko': 'COD',
  'pr kongko': 'COD',
  kenya: 'KEN',
  tynisia: 'TUN',
  marokko: 'MAR',
  'prasino akrotirio': 'CPV',
  iaponia: 'JPN',
  kina: 'CHN',
  filippines: 'PHI',
  iordania: 'JOR',
  livanos: 'LBN',
  iran: 'IRI'
};

/**
 * El código COI de un país escrito en griego («ΗΠΑ», «ΜΕΓΑΛΗ ΒΡΕΤΑΝΙΑ») o,
 * si no es griego, como lo entiende {@link toNationCode}; `null` si no se
 * reconoce.
 */
export function nationFromGreek(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null;
  if (!isGreekScript(raw)) return toNationCode(raw);
  const key = transliterateGreek(raw)
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return GREEK_COUNTRIES[key] ?? null;
}

/** Los meses en griego, en genitivo («21 Μαρτίου 2026») y en nominativo, ya transliterados. */
const GREEK_MONTHS: [RegExp, number][] = [
  [/^ianouar/, 1],
  [/^fevrouar/, 2],
  [/^marti/, 3],
  [/^aprili/, 4],
  [/^mai/, 5],
  [/^iouni/, 6],
  [/^iouli/, 7],
  [/^avgoust/, 8],
  [/^septemvri/, 9],
  [/^oktovri/, 10],
  [/^noemvri/, 11],
  [/^dekemvri/, 12]
];

/** «Σάββατο, 21 Μαρτίου 2026» → «2026-03-21»; `null` si no se entiende. */
export function greekLongDate(raw: string | null | undefined): string | null {
  const match = /(\d{1,2})\s+(\S+)\s+(\d{4})/u.exec(raw ?? '');
  if (!match) return null;
  const month = transliterateGreek(match[2] ?? '');
  const found = GREEK_MONTHS.find(([pattern]) => pattern.test(month));
  if (!found) return null;
  return `${match[3]}-${String(found[1]).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
}

/**
 * Parecido entre dos nombres (0 nada, 1 igual), sin tildes ni mayúsculas:
 * 1 − distancia de Levenshtein / longitud del más largo. Sirve para saber si
 * la transliteración de un nombre griego es el mismo nombre que da otra
 * fuente («Vasilis» y «Vassilis») o uno distinto (un nacionalizado cuyo
 * nombre griego es la transcripción del original).
 */
export function nameSimilarity(a: string, b: string): number {
  const clean = (text: string): string =>
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  const x = clean(a);
  const y = clean(b);
  if (x === '' && y === '') return 1;
  const row = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (x[i - 1] === y[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return 1 - row[y.length]! / Math.max(x.length, y.length);
}
