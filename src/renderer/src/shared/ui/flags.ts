/**
 * Banderas de nacionalidad.
 *
 * El juego guarda la nacionalidad con el código FIBA de tres letras (ESP, GER,
 * NED…), y las banderas de `flag-icons` van por el ISO de dos (es, de, nl…),
 * así que hace falta la traducción. Van empaquetadas con la aplicación: se ven
 * sin conexión y nunca cambian de un día para otro.
 *
 * Sólo se incluyen las de los países de baloncesto; un código sin bandera se
 * enseña como texto, que es lo que se veía antes.
 */

const FIBA_TO_ISO: Record<string, string> = {
  AND: 'ad',
  ANG: 'ao',
  ARG: 'ar',
  ARM: 'am',
  AUS: 'au',
  AUT: 'at',
  AZE: 'az',
  BAH: 'bs',
  BAR: 'bb',
  BEL: 'be',
  BIH: 'ba',
  BRA: 'br',
  BUL: 'bg',
  CAF: 'cf',
  CAN: 'ca',
  CGO: 'cg',
  CHA: 'td',
  CHI: 'cl',
  CHN: 'cn',
  CIV: 'ci',
  CMR: 'cm',
  COD: 'cd',
  COL: 'co',
  CPV: 'cv',
  CRO: 'hr',
  CUB: 'cu',
  CZE: 'cz',
  DEN: 'dk',
  DOM: 'do',
  EGY: 'eg',
  ESP: 'es',
  EST: 'ee',
  FIN: 'fi',
  FRA: 'fr',
  GBR: 'gb',
  GEO: 'ge',
  GER: 'de',
  GHA: 'gh',
  GRE: 'gr',
  GUI: 'gn',
  HAI: 'ht',
  HUN: 'hu',
  IRI: 'ir',
  IRL: 'ie',
  ISL: 'is',
  ISR: 'il',
  ITA: 'it',
  JAM: 'jm',
  JOR: 'jo',
  JPN: 'jp',
  KOR: 'kr',
  LAT: 'lv',
  LBN: 'lb',
  LTU: 'lt',
  MEX: 'mx',
  MKD: 'mk',
  MLI: 'ml',
  MNE: 'me',
  NED: 'nl',
  NGR: 'ng',
  NOR: 'no',
  NZL: 'nz',
  PHI: 'ph',
  POL: 'pl',
  POR: 'pt',
  PUR: 'pr',
  ROU: 'ro',
  RUS: 'ru',
  SEN: 'sn',
  SKN: 'kn',
  SLE: 'sl',
  SLO: 'si',
  SRB: 'rs',
  SSD: 'ss',
  SUI: 'ch',
  SVK: 'sk',
  SWE: 'se',
  TUN: 'tn',
  TUR: 'tr',
  UGA: 'ug',
  UKR: 'ua',
  URU: 'uy',
  USA: 'us',
  VEN: 've'
};

const FILES = import.meta.glob(
  '../../../../../node_modules/flag-icons/flags/4x3/{ad,ao,ar,am,au,at,az,bs,bb,be,ba,br,bg,cf,ca,cg,td,cl,cn,ci,cm,cd,co,cv,hr,cu,cz,dk,do,eg,es,ee,fi,fr,gb,ge,de,gh,gr,gn,ht,hu,ir,ie,is,il,it,jm,jo,jp,kr,lv,lb,lt,mx,mk,ml,me,nl,ng,no,nz,ph,pl,pt,pr,ro,ru,sn,kn,sl,si,rs,ss,ch,sk,se,tn,tr,ug,ua,uy,us,ve}.svg',
  { eager: true, query: '?url', import: 'default' }
) as Record<string, string>;

const BY_ISO = new Map(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url])
);

/** La URL de la bandera de una nacionalidad, o `null` si no la hay. */
export function flagUrl(nationality: string | null | undefined): string | null {
  const iso = nationality ? FIBA_TO_ISO[nationality.toUpperCase()] : undefined;
  return iso ? (BY_ISO.get(iso) ?? null) : null;
}
