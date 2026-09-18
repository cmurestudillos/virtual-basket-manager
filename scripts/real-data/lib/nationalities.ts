/**
 * Traducción de nacionalidades al código de tres letras que usa el juego.
 *
 * El juego identifica los países con el código FIBA/COI (`GER`, `NED`, `SLO`),
 * no con el ISO (`DEU`, `NLD`, `SVN`): es el que sale en las retransmisiones y
 * en las selecciones. Cada web escribe los países a su manera («EE.UU.»,
 * «ESTADOS UNIDOS», «Bosnia-Herzegovina», «Rep. Checa»), así que aquí se
 * normalizan el texto y los alias y, si la fuente da códigos ISO de dos o tres
 * letras, también se entienden.
 */

/**
 * [código COI, ISO3, ISO2, nombres y alias…]. Los nombres se comparan ya
 * normalizados (sin tildes, en minúsculas y sin puntuación), así que basta con
 * escribir cada variante una vez.
 */
const COUNTRIES: readonly (readonly string[])[] = [
  // Europa
  ['ESP', 'ESP', 'ES', 'España', 'Spain', 'Espanya'],
  ['AND', 'AND', 'AD', 'Andorra'],
  ['POR', 'PRT', 'PT', 'Portugal'],
  ['FRA', 'FRA', 'FR', 'Francia', 'France'],
  ['ITA', 'ITA', 'IT', 'Italia', 'Italy'],
  ['GER', 'DEU', 'DE', 'Alemania', 'Germany', 'Deutschland'],
  ['NED', 'NLD', 'NL', 'Países Bajos', 'Holanda', 'Netherlands', 'Holland'],
  ['BEL', 'BEL', 'BE', 'Bélgica', 'Belgium'],
  ['LUX', 'LUX', 'LU', 'Luxemburgo', 'Luxembourg'],
  ['SUI', 'CHE', 'CH', 'Suiza', 'Switzerland'],
  ['AUT', 'AUT', 'AT', 'Austria'],
  ['LIE', 'LIE', 'LI', 'Liechtenstein'],
  ['MON', 'MCO', 'MC', 'Mónaco', 'Monaco'],
  ['SMR', 'SMR', 'SM', 'San Marino'],
  ['MLT', 'MLT', 'MT', 'Malta'],
  [
    'GBR',
    'GBR',
    'GB',
    'Gran Bretaña',
    'Reino Unido',
    'Inglaterra',
    'Escocia',
    'Gales',
    'Irlanda del Norte',
    'United Kingdom',
    'Great Britain',
    'England',
    'Scotland',
    'Wales',
    'UK'
  ],
  ['IRL', 'IRL', 'IE', 'Irlanda', 'Ireland', 'Eire'],
  ['ISL', 'ISL', 'IS', 'Islandia', 'Iceland'],
  ['DEN', 'DNK', 'DK', 'Dinamarca', 'Denmark'],
  ['NOR', 'NOR', 'NO', 'Noruega', 'Norway'],
  ['SWE', 'SWE', 'SE', 'Suecia', 'Sweden'],
  ['FIN', 'FIN', 'FI', 'Finlandia', 'Finland'],
  ['EST', 'EST', 'EE', 'Estonia'],
  ['LAT', 'LVA', 'LV', 'Letonia', 'Latvia'],
  ['LTU', 'LTU', 'LT', 'Lituania', 'Lithuania'],
  ['POL', 'POL', 'PL', 'Polonia', 'Poland'],
  ['CZE', 'CZE', 'CZ', 'Chequia', 'República Checa', 'Rep Checa', 'Czech Republic', 'Czechia'],
  ['SVK', 'SVK', 'SK', 'Eslovaquia', 'Slovakia', 'República Eslovaca'],
  ['HUN', 'HUN', 'HU', 'Hungría', 'Hungary'],
  ['SLO', 'SVN', 'SI', 'Eslovenia', 'Slovenia'],
  ['CRO', 'HRV', 'HR', 'Croacia', 'Croatia'],
  [
    'BIH',
    'BIH',
    'BA',
    'Bosnia y Herzegovina',
    'Bosnia-Herzegovina',
    // Tal cual en la FEB, con la errata.
    'Bosnia-Herzergovina',
    'Bosnia Herzegovina',
    'Bosnia',
    'Bosnia and Herzegovina'
  ],
  ['SRB', 'SRB', 'RS', 'Serbia'],
  ['MNE', 'MNE', 'ME', 'Montenegro'],
  ['KOS', 'XKX', 'XK', 'Kosovo'],
  [
    'MKD',
    'MKD',
    'MK',
    'Macedonia del Norte',
    'Macedonia',
    'ARY Macedonia',
    'Antigua República Yugoslava de Macedonia',
    'North Macedonia',
    'FYROM'
  ],
  ['ALB', 'ALB', 'AL', 'Albania'],
  ['GRE', 'GRC', 'GR', 'Grecia', 'Greece'],
  ['CYP', 'CYP', 'CY', 'Chipre', 'Cyprus'],
  ['BUL', 'BGR', 'BG', 'Bulgaria'],
  ['ROU', 'ROU', 'RO', 'Rumanía', 'Rumania', 'Romania'],
  ['MDA', 'MDA', 'MD', 'Moldavia', 'Moldova', 'República de Moldavia'],
  ['UKR', 'UKR', 'UA', 'Ucrania', 'Ukraine'],
  ['BLR', 'BLR', 'BY', 'Bielorrusia', 'Belarus'],
  ['RUS', 'RUS', 'RU', 'Rusia', 'Russia', 'Federación Rusa', 'Russian Federation'],
  ['TUR', 'TUR', 'TR', 'Turquía', 'Turkey', 'Türkiye', 'Turkiye'],
  ['GEO', 'GEO', 'GE', 'Georgia'],
  ['ARM', 'ARM', 'AM', 'Armenia'],
  ['AZE', 'AZE', 'AZ', 'Azerbaiyán', 'Azerbaijan'],
  ['ISR', 'ISR', 'IL', 'Israel'],
  // África
  ['MAR', 'MAR', 'MA', 'Marruecos', 'Morocco'],
  ['ALG', 'DZA', 'DZ', 'Argelia', 'Algeria'],
  ['TUN', 'TUN', 'TN', 'Túnez', 'Tunisia'],
  ['LBA', 'LBY', 'LY', 'Libia', 'Libya'],
  ['EGY', 'EGY', 'EG', 'Egipto', 'Egypt'],
  ['SUD', 'SDN', 'SD', 'Sudán', 'Sudan'],
  ['SSD', 'SSD', 'SS', 'Sudán del Sur', 'South Sudan'],
  ['ETH', 'ETH', 'ET', 'Etiopía', 'Ethiopia'],
  ['ERI', 'ERI', 'ER', 'Eritrea'],
  ['SOM', 'SOM', 'SO', 'Somalia'],
  ['DJI', 'DJI', 'DJ', 'Yibuti', 'Djibouti'],
  ['KEN', 'KEN', 'KE', 'Kenia', 'Kenya'],
  ['UGA', 'UGA', 'UG', 'Uganda'],
  ['TAN', 'TZA', 'TZ', 'Tanzania'],
  ['RWA', 'RWA', 'RW', 'Ruanda', 'Rwanda'],
  ['BDI', 'BDI', 'BI', 'Burundi'],
  [
    'COD',
    'COD',
    'CD',
    'República Democrática del Congo',
    'Rep Dem Congo',
    'RD Congo',
    'R D Congo',
    'Congo RD',
    'Congo DR',
    'DR Congo',
    'Congo Kinshasa',
    'Democratic Republic of the Congo',
    'Zaire'
  ],
  [
    'CGO',
    'COG',
    'CG',
    'Congo',
    'República del Congo',
    'Congo Brazzaville',
    'Republic of the Congo'
  ],
  ['GAB', 'GAB', 'GA', 'Gabón', 'Gabon'],
  ['GEQ', 'GNQ', 'GQ', 'Guinea Ecuatorial', 'Equatorial Guinea'],
  ['CMR', 'CMR', 'CM', 'Camerún', 'Cameroon', 'Cameroun'],
  ['CAF', 'CAF', 'CF', 'República Centroafricana', 'Centroafricana', 'Central African Republic'],
  ['CHA', 'TCD', 'TD', 'Chad'],
  ['NGR', 'NGA', 'NG', 'Nigeria'],
  ['NIG', 'NER', 'NE', 'Níger', 'Niger'],
  ['BEN', 'BEN', 'BJ', 'Benín', 'Benin'],
  ['TOG', 'TGO', 'TG', 'Togo'],
  ['GHA', 'GHA', 'GH', 'Ghana'],
  ['CIV', 'CIV', 'CI', 'Costa de Marfil', 'Ivory Coast', "Côte d'Ivoire", 'Cote dIvoire'],
  ['BUR', 'BFA', 'BF', 'Burkina Faso'],
  ['MLI', 'MLI', 'ML', 'Malí', 'Mali'],
  ['SEN', 'SEN', 'SN', 'Senegal'],
  ['GAM', 'GMB', 'GM', 'Gambia', 'The Gambia'],
  ['GBS', 'GNB', 'GW', 'Guinea-Bisáu', 'Guinea Bissau', 'Guinea-Bissau'],
  ['GUI', 'GIN', 'GN', 'Guinea', 'Guinea Conakry', 'República de Guinea'],
  ['SLE', 'SLE', 'SL', 'Sierra Leona', 'Sierra Leone'],
  ['LBR', 'LBR', 'LR', 'Liberia'],
  ['MTN', 'MRT', 'MR', 'Mauritania'],
  ['CPV', 'CPV', 'CV', 'Cabo Verde', 'Cape Verde'],
  ['STP', 'STP', 'ST', 'Santo Tomé y Príncipe', 'Sao Tome and Principe'],
  ['ANG', 'AGO', 'AO', 'Angola'],
  ['ZAM', 'ZMB', 'ZM', 'Zambia'],
  ['ZIM', 'ZWE', 'ZW', 'Zimbabue', 'Zimbabwe'],
  ['MOZ', 'MOZ', 'MZ', 'Mozambique'],
  ['MAW', 'MWI', 'MW', 'Malaui', 'Malawi'],
  ['MAD', 'MDG', 'MG', 'Madagascar'],
  ['MRI', 'MUS', 'MU', 'Mauricio', 'Mauritius'],
  ['SEY', 'SYC', 'SC', 'Seychelles'],
  ['COM', 'COM', 'KM', 'Comoras', 'Comoros'],
  ['BOT', 'BWA', 'BW', 'Botsuana', 'Botswana'],
  ['NAM', 'NAM', 'NA', 'Namibia'],
  ['RSA', 'ZAF', 'ZA', 'Sudáfrica', 'South Africa'],
  ['LES', 'LSO', 'LS', 'Lesoto', 'Lesotho'],
  ['SWZ', 'SWZ', 'SZ', 'Esuatini', 'Suazilandia', 'Eswatini', 'Swaziland'],
  // América
  [
    'USA',
    'USA',
    'US',
    'Estados Unidos',
    'Estados Unidos de América',
    'EE.UU.',
    'EEUU',
    'EE UU',
    'E.U.A.',
    'United States',
    'United States of America',
    'U.S.A.'
  ],
  ['CAN', 'CAN', 'CA', 'Canadá', 'Canada'],
  ['MEX', 'MEX', 'MX', 'México', 'Mexico', 'Méjico'],
  ['GUA', 'GTM', 'GT', 'Guatemala'],
  ['BIZ', 'BLZ', 'BZ', 'Belice', 'Belize'],
  ['HON', 'HND', 'HN', 'Honduras'],
  ['ESA', 'SLV', 'SV', 'El Salvador', 'Salvador'],
  ['NCA', 'NIC', 'NI', 'Nicaragua'],
  ['CRC', 'CRI', 'CR', 'Costa Rica'],
  ['PAN', 'PAN', 'PA', 'Panamá', 'Panama'],
  ['CUB', 'CUB', 'CU', 'Cuba'],
  [
    'DOM',
    'DOM',
    'DO',
    'República Dominicana',
    'Rep Dominicana',
    'R Dominicana',
    'Dominican Republic'
  ],
  ['HAI', 'HTI', 'HT', 'Haití', 'Haiti'],
  ['PUR', 'PRI', 'PR', 'Puerto Rico'],
  ['JAM', 'JAM', 'JM', 'Jamaica'],
  ['BAH', 'BHS', 'BS', 'Bahamas', 'The Bahamas', 'Islas Bahamas'],
  ['TTO', 'TTO', 'TT', 'Trinidad y Tobago', 'Trinidad and Tobago'],
  ['BAR', 'BRB', 'BB', 'Barbados'],
  ['ANT', 'ATG', 'AG', 'Antigua y Barbuda', 'Antigua and Barbuda'],
  ['SKN', 'KNA', 'KN', 'San Cristóbal y Nieves', 'Saint Kitts and Nevis'],
  ['LCA', 'LCA', 'LC', 'Santa Lucía', 'Saint Lucia'],
  ['VIN', 'VCT', 'VC', 'San Vicente y las Granadinas', 'Saint Vincent and the Grenadines'],
  ['GRN', 'GRD', 'GD', 'Granada (país)', 'Grenada'],
  ['DMA', 'DMA', 'DM', 'Dominica'],
  [
    'ISV',
    'VIR',
    'VI',
    'Islas Vírgenes de los Estados Unidos',
    'Islas Vírgenes EEUU',
    'US Virgin Islands'
  ],
  ['IVB', 'VGB', 'VG', 'Islas Vírgenes Británicas', 'British Virgin Islands'],
  ['ARU', 'ABW', 'AW', 'Aruba'],
  ['CAY', 'CYM', 'KY', 'Islas Caimán', 'Cayman Islands'],
  ['BER', 'BMU', 'BM', 'Bermudas', 'Bermuda'],
  ['CUW', 'CUW', 'CW', 'Curazao', 'Curaçao', 'Curacao'],
  ['VEN', 'VEN', 'VE', 'Venezuela'],
  ['COL', 'COL', 'CO', 'Colombia'],
  ['ECU', 'ECU', 'EC', 'Ecuador'],
  ['PER', 'PER', 'PE', 'Perú', 'Peru'],
  ['BOL', 'BOL', 'BO', 'Bolivia'],
  ['CHI', 'CHL', 'CL', 'Chile'],
  ['ARG', 'ARG', 'AR', 'Argentina'],
  ['URU', 'URY', 'UY', 'Uruguay'],
  ['PAR', 'PRY', 'PY', 'Paraguay'],
  ['BRA', 'BRA', 'BR', 'Brasil', 'Brazil'],
  ['GUY', 'GUY', 'GY', 'Guyana'],
  ['SUR', 'SUR', 'SR', 'Surinam', 'Suriname'],
  // Asia y Oriente Medio
  ['CHN', 'CHN', 'CN', 'China', 'República Popular China'],
  ['TPE', 'TWN', 'TW', 'China Taipéi', 'Taiwán', 'Taiwan', 'Chinese Taipei'],
  ['HKG', 'HKG', 'HK', 'Hong Kong'],
  ['JPN', 'JPN', 'JP', 'Japón', 'Japan'],
  ['KOR', 'KOR', 'KR', 'Corea del Sur', 'Corea', 'República de Corea', 'South Korea', 'Korea'],
  ['PRK', 'PRK', 'KP', 'Corea del Norte', 'North Korea'],
  ['MGL', 'MNG', 'MN', 'Mongolia'],
  ['PHI', 'PHL', 'PH', 'Filipinas', 'Philippines'],
  ['INA', 'IDN', 'ID', 'Indonesia'],
  ['MAS', 'MYS', 'MY', 'Malasia', 'Malaysia'],
  ['SGP', 'SGP', 'SG', 'Singapur', 'Singapore'],
  ['THA', 'THA', 'TH', 'Tailandia', 'Thailand'],
  ['VIE', 'VNM', 'VN', 'Vietnam'],
  ['CAM', 'KHM', 'KH', 'Camboya', 'Cambodia'],
  ['MYA', 'MMR', 'MM', 'Myanmar', 'Birmania'],
  ['IND', 'IND', 'IN', 'India'],
  ['PAK', 'PAK', 'PK', 'Pakistán', 'Pakistan'],
  ['BAN', 'BGD', 'BD', 'Bangladés', 'Bangladesh'],
  ['SRI', 'LKA', 'LK', 'Sri Lanka'],
  ['NEP', 'NPL', 'NP', 'Nepal'],
  ['AFG', 'AFG', 'AF', 'Afganistán', 'Afghanistan'],
  ['IRI', 'IRN', 'IR', 'Irán', 'Iran'],
  ['IRQ', 'IRQ', 'IQ', 'Irak', 'Iraq'],
  ['SYR', 'SYR', 'SY', 'Siria', 'Syria'],
  ['LBN', 'LBN', 'LB', 'Líbano', 'Lebanon'],
  ['JOR', 'JOR', 'JO', 'Jordania', 'Jordan'],
  ['PLE', 'PSE', 'PS', 'Palestina', 'Palestine'],
  ['KSA', 'SAU', 'SA', 'Arabia Saudí', 'Arabia Saudita', 'Saudi Arabia'],
  ['UAE', 'ARE', 'AE', 'Emiratos Árabes Unidos', 'Emiratos Árabes', 'United Arab Emirates'],
  ['QAT', 'QAT', 'QA', 'Catar', 'Qatar'],
  ['BRN', 'BHR', 'BH', 'Baréin', 'Bahréin', 'Bahrain'],
  ['KUW', 'KWT', 'KW', 'Kuwait'],
  ['OMA', 'OMN', 'OM', 'Omán', 'Oman'],
  ['YEM', 'YEM', 'YE', 'Yemen'],
  ['KAZ', 'KAZ', 'KZ', 'Kazajistán', 'Kazajstán', 'Kazakhstan'],
  ['UZB', 'UZB', 'UZ', 'Uzbekistán', 'Uzbekistan'],
  ['TKM', 'TKM', 'TM', 'Turkmenistán', 'Turkmenistan'],
  ['KGZ', 'KGZ', 'KG', 'Kirguistán', 'Kyrgyzstan'],
  ['TJK', 'TJK', 'TJ', 'Tayikistán', 'Tajikistan'],
  // Oceanía
  ['AUS', 'AUS', 'AU', 'Australia'],
  ['NZL', 'NZL', 'NZ', 'Nueva Zelanda', 'New Zealand'],
  ['FIJ', 'FJI', 'FJ', 'Fiyi', 'Fiji'],
  ['PNG', 'PNG', 'PG', 'Papúa Nueva Guinea', 'Papua New Guinea'],
  ['SAM', 'WSM', 'WS', 'Samoa'],
  ['TGA', 'TON', 'TO', 'Tonga'],
  ['GUM', 'GUM', 'GU', 'Guam']
];

/** Minúsculas, sin tildes ni signos: «EE.UU.» → «ee uu», «Bosnia-Herzegovina» → «bosnia herzegovina». */
export function normalizeCountryText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BY_NAME = new Map<string, string>();
const BY_IOC = new Set<string>();
const BY_ISO3 = new Map<string, string>();
const BY_ISO2 = new Map<string, string>();

for (const [ioc = '', iso3 = '', iso2 = '', ...names] of COUNTRIES) {
  BY_IOC.add(ioc);
  BY_ISO3.set(iso3, ioc);
  BY_ISO2.set(iso2, ioc);
  for (const name of names) {
    BY_NAME.set(normalizeCountryText(name), ioc);
    // «EE.UU.» y «EEUU» tienen que acabar igual: también sin espacios.
    BY_NAME.set(normalizeCountryText(name).replace(/ /g, ''), ioc);
  }
}

/**
 * El código COI de una nacionalidad escrita como sea; `null` si no se
 * reconoce. Los códigos se prueban antes que los nombres, y el COI antes que
 * el ISO: hay países cuyo código COI es el ISO de otro, y si la fuente da
 * códigos de tres letras lo normal es que sean los deportivos.
 */
export function toNationCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const upper = trimmed.toUpperCase();
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    if (BY_IOC.has(upper)) return upper;
    const fromIso3 = BY_ISO3.get(upper);
    if (fromIso3) return fromIso3;
  }
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const fromIso2 = BY_ISO2.get(upper);
    if (fromIso2) return fromIso2;
  }
  const normalized = normalizeCountryText(trimmed);
  // «R. Checa», «Rep. Democrática del Congo»: la abreviatura de «república».
  const expanded = normalized.replace(/^(?:r|rep)\s/, 'republica ');
  for (const candidate of [normalized, expanded]) {
    const found = BY_NAME.get(candidate) ?? BY_NAME.get(candidate.replace(/ /g, ''));
    if (found) return found;
  }
  return null;
}

/**
 * Las provincias españolas, como las escribe la FEB entre paréntesis tras la
 * ciudad de nacimiento («Onda (Castellón)»), con sus nombres oficiales en las
 * otras lenguas. Ya normalizadas como {@link normalizeCountryText}.
 */
const SPANISH_PROVINCES = new Set(
  [
    'Álava',
    'Araba',
    'Albacete',
    'Alicante',
    'Alacant',
    'Almería',
    'Asturias',
    'Ávila',
    'Badajoz',
    'Baleares',
    'Illes Balears',
    'Islas Baleares',
    'Barcelona',
    'Burgos',
    'Cáceres',
    'Cádiz',
    'Cantabria',
    'Castellón',
    'Castelló',
    'Ciudad Real',
    'Córdoba',
    'A Coruña',
    'La Coruña',
    'Coruña',
    'Coruña, A',
    'Cuenca',
    'Girona',
    'Gerona',
    'Granada',
    'Guadalajara',
    'Guipúzcoa',
    'Gipuzkoa',
    'Huelva',
    'Huesca',
    'Jaén',
    'León',
    'Lleida',
    'Lérida',
    'Lugo',
    'Madrid',
    'Málaga',
    'Murcia',
    'Navarra',
    'Nafarroa',
    'Ourense',
    'Orense',
    'Palencia',
    'Las Palmas',
    'Palmas, Las',
    'Pontevedra',
    'La Rioja',
    'Rioja, La',
    'Salamanca',
    'Santa Cruz de Tenerife',
    'Segovia',
    'Sevilla',
    'Soria',
    'Tarragona',
    'Teruel',
    'Toledo',
    'Valencia',
    'València',
    'Valladolid',
    'Vizcaya',
    'Bizkaia',
    'Zamora',
    'Zaragoza',
    'Ceuta',
    'Melilla'
  ].map(normalizeCountryText)
);

/**
 * La nacionalidad que se deduce de un lugar de nacimiento («Burgos (Burgos)»,
 * «Montevideo (Uruguay)»): si lo de entre paréntesis es una provincia
 * española, `ESP`; si es un país, el suyo. `null` si no se puede saber.
 * Nacer en un sitio no es tener su pasaporte, pero para quien la fuente no da
 * nacionalidad es la mejor pista que hay.
 */
export function nationFromBirthPlace(place: string | null | undefined): string | null {
  if (!place) return null;
  const region = /\(([^()]+)\)\s*$/.exec(place)?.[1]?.trim() ?? place;
  if (SPANISH_PROVINCES.has(normalizeCountryText(region))) return 'ESP';
  return toNationCode(region);
}
