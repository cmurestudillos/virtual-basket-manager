/**
 * El nombre de un jugador, partido en nombre y apellido.
 *
 * El juego lo escribe como IBM: «Nombre APELLIDO», con el apellido en
 * mayúsculas, y en lo estrecho «N. APELLIDO». Muchas pantallas sólo reciben el
 * nombre entero, así que hace falta partirlo, y se parte siempre igual: la
 * primera palabra es el nombre y el resto el apellido. «Juan Carlos Navarro»
 * sale «Juan CARLOS NAVARRO», que es el precio de no guardar dos campos en
 * todos los contratos; quien los tenga separados, que los pase separados.
 */

export interface PlayerNameParts {
  /** Vacío si el jugador se conoce por una sola palabra («Sabonis»). */
  first: string;
  last: string;
}

export function splitPlayerName(fullName: string): PlayerNameParts {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  if (!first) return { first: '', last: '' };
  if (rest.length === 0) return { first: '', last: first };
  return { first, last: rest.join(' ') };
}

/** «Juan» → «J.»; sin nombre, nada. */
export function nameInitial(first: string): string {
  return first ? `${first.charAt(0)}.` : '';
}
