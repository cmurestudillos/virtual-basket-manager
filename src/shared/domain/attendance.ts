/**
 * Pabellón y afición: cuánta gente viene, qué paga y cómo se toma lo que ve.
 *
 * El precio de la entrada es la primera decisión económica de verdad del juego:
 * subirlo ingresa más por espectador y trae menos gente —y enfada al abonado—,
 * bajarlo llena el pabellón y calienta el ambiente. Como no hay una respuesta
 * correcta, hay decisión.
 *
 * Funciones puras: ni base de datos ni azar.
 */

/** Precio de referencia del juego; con él, un pabellón normal se llena a medias. */
export const REFERENCE_TICKET_PRICE_CENTS = 20_00;
export const DEFAULT_TICKET_PRICE_CENTS = REFERENCE_TICKET_PRICE_CENTS;
export const MIN_TICKET_PRICE_CENTS = 5_00;
export const MAX_TICKET_PRICE_CENTS = 120_00;

/** El abono sale por doce entradas aunque la liga tenga diecisiete partidos en casa. */
export const SEASON_TICKET_GAMES = 12;

export function seasonTicketPriceCents(ticketPriceCents: number): number {
  return Math.round(ticketPriceCents * SEASON_TICKET_GAMES);
}

/** Ambiente del pabellón, 0-100: sube ganando y se enfría con los precios altos. */
export const MIN_SUPPORT = 0;
export const MAX_SUPPORT = 100;
export const DEFAULT_SUPPORT = 55;

export interface AttendanceInput {
  capacity: number;
  seasonTicketHolders: number;
  /** Ambiente actual, 0-100. */
  fanSupport: number;
  ticketPriceCents: number;
  /** Reputación del rival, 1-100: un grande llena más. */
  opponentReputation: number;
}

/**
 * Espectadores de un partido en casa.
 *
 * Los abonados cuentan como presentes: ya han pagado y su asiento está ocupado,
 * así que son el suelo de la asistencia. Por encima de ellos, la taquilla
 * depende del ambiente, de quién viene de visitante y, sobre todo, del precio.
 */
export function expectedAttendance(input: AttendanceInput): number {
  const capacity = Math.max(0, Math.round(input.capacity));
  const holders = clamp(Math.round(input.seasonTicketHolders), 0, capacity);

  const base = 0.32 + (clamp(input.fanSupport, MIN_SUPPORT, MAX_SUPPORT) / 100) * 0.48;
  const opponent = 0.9 + (clamp(input.opponentReputation, 1, 100) / 100) * 0.2;
  const demand = capacity * base * opponent * priceFactor(input.ticketPriceCents);

  return clamp(Math.round(Math.max(demand, holders)), 0, capacity);
}

/**
 * Elasticidad del precio: a mitad de precio viene cerca de un 50 % más de
 * gente, y al triple se queda la mitad. Es una curva suave a propósito —el
 * aficionado no desaparece de golpe, se va desinflando.
 */
export function priceFactor(ticketPriceCents: number): number {
  const price = clamp(ticketPriceCents, MIN_TICKET_PRICE_CENTS, MAX_TICKET_PRICE_CENTS);
  return Math.pow(REFERENCE_TICKET_PRICE_CENTS / price, 0.55);
}

/** Taquilla de un partido: sólo paga quien no tiene abono. */
export function gateRevenueCents(
  attendance: number,
  seasonTicketHolders: number,
  ticketPriceCents: number
): number {
  const paying = Math.max(0, Math.round(attendance) - Math.round(seasonTicketHolders));
  return paying * Math.round(ticketPriceCents);
}

/**
 * Cómo se toma la afición el último partido en casa.
 *
 * Ganar suma y perder resta, pero el precio está siempre de fondo: cobrar el
 * triple de lo normal enfría el pabellón aunque se gane, y regalar la entrada
 * no compra una afición si el equipo pierde todas las semanas.
 */
export function supportAfterGame(
  fanSupport: number,
  outcome: { won: boolean; ticketPriceCents: number }
): number {
  const result = outcome.won ? 2.5 : -2.5;
  // Referencia arriba y abajo: 10 € calienta, 40 € enfría.
  const price = (priceFactor(outcome.ticketPriceCents) - 1) * 3;

  return clamp(Math.round(fanSupport + result + price), MIN_SUPPORT, MAX_SUPPORT);
}

/**
 * Abonados de la temporada siguiente.
 *
 * Se renuevan en verano y salen del ambiente con el que acabó la temporada y
 * del precio que se les pide: es la parte del ingreso que se cobra por
 * adelantado y la que premia haber cuidado al aficionado el año anterior.
 */
export function renewSeasonTickets(input: {
  capacity: number;
  fanSupport: number;
  ticketPriceCents: number;
}): number {
  const capacity = Math.max(0, Math.round(input.capacity));
  const share =
    (0.18 + (clamp(input.fanSupport, MIN_SUPPORT, MAX_SUPPORT) / 100) * 0.32) *
    priceFactor(input.ticketPriceCents);

  return clamp(Math.round(capacity * share), 0, capacity);
}

/** Etiqueta del ambiente, para no enseñar un número pelado. */
export function supportLabel(fanSupport: number): string {
  if (fanSupport >= 80) return 'Entregada';
  if (fanSupport >= 60) return 'Animada';
  if (fanSupport >= 40) return 'Tibia';
  if (fanSupport >= 20) return 'Fría';
  return 'Enfadada';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
