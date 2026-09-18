import { decodeEntities, rowCells, tableRows, textOf } from '../lib/html';
import { minutesToSeconds, toInt } from '../lib/normalize';
import type { SourceStats } from '../lib/source-types';

/**
 * Lectura de las páginas de baloncestoenvivo.feb.es (ASP.NET WebForms). Sólo
 * parseo, sin red: `feb.ts` descarga y decide.
 */

export interface FebTeamLink {
  id: string;
  name: string;
}

/** Los equipos que aparecen en el calendario (enlaces `Equipo.aspx?i=`), sin repetir. */
export function parseCalendarTeams(html: string): FebTeamLink[] {
  const teams = new Map<string, string>();
  for (const match of html.matchAll(/Equipo\.aspx\?i=(\d+)["'][^>]*>([^<]*)</gi)) {
    const id = match[1] ?? '';
    const name = textOf(match[2] ?? '');
    if (id && name && !teams.has(id)) teams.set(id, name);
  }
  return [...teams].map(([id, name]) => ({ id, name }));
}

export interface FebSelectOption {
  value: string;
  label: string;
  selected: boolean;
}

/** Las opciones de un `<select>` cuyo nombre acaba en `nameSuffix`. */
export function selectOptions(html: string, nameSuffix: string): FebSelectOption[] {
  const select = new RegExp(
    `<select[^>]*name="[^"]*${nameSuffix.replace(/[$]/g, '\\$')}"[^>]*>([\\s\\S]*?)</select>`,
    'i'
  ).exec(html);
  if (!select) return [];
  return [...(select[1] ?? '').matchAll(/<option([^>]*)value="([^"]*)"[^>]*>([^<]*)</gi)].map(
    (match) => ({
      value: match[2] ?? '',
      label: textOf(match[3] ?? ''),
      selected: /selected/i.test(match[1] ?? '')
    })
  );
}

export interface FebStanding {
  position: number;
  teamId: string;
  name: string;
  played: number | null;
}

/**
 * La tabla «Clasificación» de la página de resultados (la de la jornada
 * elegida), no la «Clasificación Final», que después de los playoffs ya no es
 * la de la liga regular.
 */
export function parseStandings(html: string): FebStanding[] {
  const table = /id="[^"]*_clasificacionDataGrid"[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  if (!table) return [];
  const standings: FebStanding[] = [];
  for (const row of tableRows(table)) {
    const cells = rowCells(row);
    const teamId = /Equipo\.aspx\?i=(\d+)/i.exec(row)?.[1];
    const position = toInt(textOf(cells[0]?.html ?? ''));
    if (!teamId || position === null) continue;
    standings.push({
      position,
      teamId,
      name: textOf(cells[1]?.html ?? ''),
      played: toInt(textOf(cells[2]?.html ?? ''))
    });
  }
  return standings;
}

export interface FebRosterRow {
  /** El `c` de `Jugador.aspx?i=…&c=…`: identifica al jugador, no a la ficha del año. */
  playerId: string;
  /** Nombre legal en MAYÚSCULAS, nombre antes que apellidos. */
  fullName: string;
  position: string | null;
  shirtNumber: string | null;
  /** «21/09/1996 NJURUNDA»: fecha y, a veces, lugar. */
  birth: string | null;
  nationality: string | null;
  /** «SI»/«NO»: si cuenta como jugador de formación. */
  homegrown: string | null;
  height: string | null;
  weight: string | null;
}

/** El recuadro «Entrenador» de la ficha del equipo. */
export interface FebCoachBox {
  /** El `c` de su foto (`Foto.aspx?c=…`); `null` si no tiene. */
  personId: string | null;
  /** Nombre legal en MAYÚSCULAS, nombre antes que apellidos. */
  fullName: string;
  /** «25/05/1978 Burgos (Burgos)»: fecha y, a veces, lugar. */
  birth: string | null;
}

export interface FebTeamPage {
  clubName: string | null;
  clubAddress: string | null;
  pavilionName: string | null;
  pavilionAddress: string | null;
  roster: FebRosterRow[];
  /** `null` si el recuadro del entrenador está vacío. */
  coach: FebCoachBox | null;
}

function spanById(html: string, idSuffix: string): string | null {
  const match = new RegExp(`<span[^>]*id="[^"]*_${idSuffix}"[^>]*>([\\s\\S]*?)</span>`, 'i').exec(
    html
  );
  const text = match ? textOf(match[1] ?? '') : '';
  return text === '' ? null : text;
}

/** Texto de una celda; «-» y vacío son `null`. */
function cellText(cell: { html: string } | undefined): string | null {
  const text = textOf(cell?.html ?? '');
  return text === '' || text === '-' ? null : text;
}

/**
 * El entrenador de la ficha del equipo. Sin nombre es que la FEB no tiene a
 * nadie dado de alta como primer entrenador.
 */
export function parseCoachBox(html: string): FebCoachBox | null {
  // El recuadro acaba en la fecha de nacimiento, que está aunque venga vacía.
  const box =
    /<div class="box-entrenador">([\s\S]*?<div class="fecha nacimiento">[\s\S]*?<\/div>)/i.exec(
      html
    )?.[1];
  if (!box) return null;
  const name = /<div class="nombre">([\s\S]*?)<\/div>/i.exec(box)?.[1];
  const fullName = name ? textOf(name) : '';
  if (fullName === '') return null;
  const birth = /<div class="fecha nacimiento">([\s\S]*?)<\/div>/i.exec(box)?.[1];
  return {
    personId: /fotoEntrenadorImage"[^>]*Foto\.aspx\?c=(\d+)/i.exec(box)?.[1] ?? null,
    fullName,
    birth: birth ? textOf(birth) || null : null
  };
}

/** «25/05/1978 Burgos (Burgos)» → «Burgos (Burgos)»; `null` si sólo trae la fecha. */
export function birthPlaceOf(birth: string | null): string | null {
  if (!birth) return null;
  const place = birth.replace(/^\s*\d{1,2}[/-]\d{1,2}[/-]\d{4}\s*/, '').trim();
  return place === '' ? null : place;
}

export function parseTeamPage(html: string): FebTeamPage {
  const clubName = /<div class="box-club">[\s\S]*?<div class="nombre">([\s\S]*?)<\/div>/i.exec(
    html
  );
  const roster: FebRosterRow[] = [];
  // La plantilla es la tabla con columna de nacionalidad; las celdas llevan
  // clase, así que se leen por clase y no por posición.
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = table[1] ?? '';
    if (!/<th[^>]*class="nacionalidad"/i.test(body)) continue;
    for (const row of tableRows(body)) {
      const cells = rowCells(row);
      const nameCell = cells.find((cell) => cell.className === 'nombre jugador');
      const playerId = /Jugador\.aspx\?[^'"]*c=(\d+)/i.exec(nameCell?.html ?? '')?.[1];
      if (!nameCell || !playerId) continue;
      const byClass = (className: string) =>
        cellText(cells.find((cell) => cell.className === className));
      roster.push({
        playerId,
        fullName: textOf(nameCell.html),
        position: byClass('puesto'),
        shirtNumber: byClass('dorsal'),
        birth: byClass('fecha nacimiento'),
        nationality: byClass('nacionalidad'),
        homegrown: byClass('formacion'),
        height: byClass('altura'),
        weight: byClass('peso')
      });
    }
  }
  return {
    clubName: clubName ? textOf(clubName[1] ?? '') || null : null,
    clubAddress: spanById(html, 'direccionLabel'),
    pavilionName: spanById(html, 'pabellonLabel'),
    pavilionAddress: spanById(html, 'dirPabellonLabel'),
    roster,
    coach: parseCoachBox(html)
  };
}

export interface FebStatsLine {
  games: number;
  seconds: number;
  points: number;
  twoPointMade: number;
  twoPointAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  freeThrowMade: number;
  freeThrowAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  blocks: number;
  blocksReceived: number;
  dunks: number;
  fouls: number;
  foulsDrawn: number;
  rating: number;
}

export interface FebPlayerStats {
  playerId: string;
  /** «APELLIDOS, NOMBRE» tal y como lo escribe la tabla. */
  commaName: string;
  /** Por fase: `LR` liga regular, `PO` playoffs… */
  phases: Map<string, FebStatsLine>;
}

/** «23/28 <span>82,1%</span>» → [23, 28]. */
function madeAttempted(html: string): [number, number] {
  const match = /(\d+)\s*\/\s*(\d+)/.exec(textOf(html));
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function statsLine(cells: { className: string; html: string }[]): FebStatsLine {
  const get = (className: string) => cells.find((cell) => cell.className === className)?.html ?? '';
  const int = (className: string) => toInt(textOf(get(className))) ?? 0;
  const [twoPointMade, twoPointAttempted] = madeAttempted(get('tiros dos'));
  const [threePointMade, threePointAttempted] = madeAttempted(get('tiros tres'));
  const [freeThrowMade, freeThrowAttempted] = madeAttempted(get('tiros libres'));
  return {
    games: int('partidos'),
    seconds: minutesToSeconds(textOf(get('minutos'))),
    points: int('puntos'),
    twoPointMade,
    twoPointAttempted,
    threePointMade,
    threePointAttempted,
    freeThrowMade,
    freeThrowAttempted,
    offensiveRebounds: int('rebotes ofensivos'),
    defensiveRebounds: int('rebotes defensivos'),
    assists: int('asistencias'),
    steals: int('recuperaciones'),
    turnovers: int('perdidas'),
    blocks: int('tapones favor'),
    blocksReceived: int('tapones contra'),
    dunks: int('mates'),
    fouls: int('faltas cometidas'),
    foulsDrawn: int('faltas recibidas'),
    rating: int('valoracion')
  };
}

/**
 * La tabla de «Estadísticas acumuladas de la plantilla»: una fila por jugador
 * y fase; las filas de la segunda fase en adelante dejan el nombre vacío y son
 * del jugador de la fila anterior.
 */
export function parseAccumulatedStats(html: string): FebPlayerStats[] {
  const players: FebPlayerStats[] = [];
  let current: FebPlayerStats | null = null;
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = table[1] ?? '';
    if (!/<th[^>]*class="fase"/i.test(body) || !/<th[^>]*class="nombre jugador"/i.test(body)) {
      continue;
    }
    for (const row of tableRows(body)) {
      const cells = rowCells(row);
      const nameCell = cells.find((cell) => cell.className === 'nombre jugador');
      const phaseCell = cells.find((cell) => cell.className === 'fase');
      if (!nameCell || !phaseCell) continue;
      const playerId = /Jugador\.aspx\?[^'"]*c=(\d+)/i.exec(nameCell.html)?.[1];
      if (playerId) {
        current = players.find((player) => player.playerId === playerId) ?? null;
        if (!current) {
          current = { playerId, commaName: textOf(nameCell.html), phases: new Map() };
          players.push(current);
        }
      }
      const phase = textOf(phaseCell.html);
      if (!current || phase === '') continue;
      current.phases.set(phase, statsLine(cells));
    }
  }
  return players;
}

/** Las estadísticas de la FEB en el formato común. No da titularidades. */
export function toSourceStats(line: FebStatsLine): SourceStats {
  return { ...line, starts: null };
}

export interface FebPlayerPage {
  commaName: string | null;
  shirtNumber: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  birth: string | null;
  nationality: string | null;
}

export function parsePlayerPage(html: string): FebPlayerPage {
  const box = /<div class="box-jugador">([\s\S]*?)<h1/i.exec(html)?.[1] ?? '';
  const field = (label: string): string | null => {
    const match = new RegExp(
      `<span[^>]*class="label"[^>]*>\\s*${label}\\s*</span>\\s*<span[^>]*class="string"[^>]*>([\\s\\S]*?)</span>`,
      'i'
    ).exec(box);
    const text = match ? textOf(match[1] ?? '') : '';
    // «- Kg», «- cm»: la FEB rellena con guion lo que no tiene.
    return text === '' || /^-\s*(kg|cm)?$/i.test(text) ? null : text;
  };
  const name = /<div class="nombre">([\s\S]*?)<\/div>/i.exec(box)?.[1];
  const dorsal = /class="dorsal">([\s\S]*?)<\/div>/i.exec(box)?.[1];
  return {
    commaName: name ? textOf(name) || null : null,
    shirtNumber: dorsal ? textOf(dorsal) || null : null,
    position: field('Puesto'),
    height: field('Altura'),
    weight: field('Peso'),
    birth: field('Fecha Nacimiento'),
    nationality: field('Nacionalidad')
  };
}

/**
 * La ciudad de una dirección de la FEB: lo que va tras el último código postal
 * y antes de la provincia entre paréntesis («… 15702 Santiago de Compostela (A
 * Coruña)»). Algunas direcciones repiten código postal y ciudad en mayúsculas
 * dentro de la calle, por eso cuenta el último. El nombre oficial con el
 * artículo detrás («Coruña, A») se da la vuelta. `null` si no sigue el patrón.
 */
export function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const matches = [...decodeEntities(address).matchAll(/\b\d{5}\s+([^()\d]+?)\s*(?:\(|$)/g)];
  const city = matches.at(-1)?.[1]?.trim();
  if (!city) return null;
  const article = /^(.+),\s*(A|O|As|Os|El|La|Los|Las|L'|Es|Sa|Ses)$/i.exec(city);
  return article ? `${article[2]} ${article[1]}` : city;
}
