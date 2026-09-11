/**
 * Las cuentas del club.
 *
 * Todo el dinero viaja en **céntimos enteros**, como manda el proyecto: un
 * presupuesto con decimales flotando acaba descuadrando solo. Y todo movimiento
 * se apunta en el libro; el saldo es la suma de lo apuntado y no un número
 * guardado aparte que pueda desincronizarse.
 *
 * Calibrado contra el dataset del juego, donde un club grande paga unos 4,7 M €
 * de nóminas al año y uno pequeño 1,5 M: con el precio de entrada por defecto y
 * sin tocar nada, cualquier club termina la temporada ligeramente en positivo.
 * Lo que decide si gana o pierde dinero son las decisiones — el precio de la
 * entrada, ampliar el pabellón, y más adelante los fichajes—, no la inercia.
 *
 * Funciones puras: ni base de datos ni azar.
 */

export type FinanceEntryType =
  /** Taquilla de un partido en casa. */
  | 'ticketing'
  /** Abonos de temporada, cobrados de una vez en pretemporada. */
  | 'membership'
  /** Derechos de televisión de la temporada. */
  | 'tv'
  /** Patrocinio principal de la temporada. */
  | 'sponsorship'
  /** Premio por la clasificación final o por el título. */
  | 'prize'
  /** Nóminas de la plantilla, mensuales. */
  | 'wages'
  /** Mantenimiento del pabellón, mensual. */
  | 'maintenance'
  /** Obras de ampliación del pabellón o de la cantera. */
  | 'facilities'
  /** Traspasos pagados o cobrados. */
  | 'transfer';

export const FINANCE_ENTRY_LABELS: Record<FinanceEntryType, string> = {
  ticketing: 'Taquilla',
  membership: 'Abonos',
  tv: 'Televisión',
  sponsorship: 'Patrocinio',
  prize: 'Premios',
  wages: 'Nóminas',
  maintenance: 'Mantenimiento',
  facilities: 'Instalaciones',
  transfer: 'Traspasos'
};

/** Mensualidades en las que se reparte un curso. */
export const MONTHS_PER_SEASON = 12;

/**
 * Nómina mensual de una plantilla.
 *
 * Las fichas son anuales —así se habla de un contrato— y se pagan en doce
 * mensualidades, que es lo que convierte quedarse sin caja en marzo en un
 * problema de verdad y no en un susto de un día.
 */
export function monthlyWagesCents(seasonWagesCents: number): number {
  return Math.round(seasonWagesCents / MONTHS_PER_SEASON);
}

/** Lo que cuesta tener el pabellón abierto un año, por asiento. */
export const MAINTENANCE_PER_SEAT_CENTS = 55_00;

export function monthlyMaintenanceCents(capacity: number): number {
  return Math.round((capacity * MAINTENANCE_PER_SEAT_CENTS) / MONTHS_PER_SEASON);
}

/**
 * Derechos de televisión de la temporada.
 *
 * Los cobra todo el mundo, pero el reparto va por lo que arrastra cada club, y
 * no linealmente: la diferencia entre el grande y el pequeño es la que explica
 * que uno pueda pagar cuatro veces más en fichas.
 */
export function seasonTvRightsCents(reputation: number): number {
  return Math.round(800_000_00 * reputationFactor(reputation));
}

/** Patrocinio principal: reputación y tamaño del pabellón. */
export function seasonSponsorshipCents(reputation: number, capacity: number): number {
  return Math.round(500_000_00 * reputationFactor(reputation) + capacity * 60_00);
}

/**
 * Premio por la clasificación final de la liga regular, más el extra de campeón.
 *
 * Acabar arriba paga, pero nunca tanto como para que una buena temporada
 * arregle una gestión mala: el grueso del dinero está en el día a día.
 */
export function seasonPrizeCents(
  position: number,
  teams: number,
  champion: boolean,
  tier = 1
): number {
  if (teams <= 0 || position <= 0) {
    return Math.round((champion ? CHAMPION_PRIZE_CENTS : 0) * tierFactor(tier));
  }

  const share = Math.max(0, teams - position + 1) / teams;
  const league = share * share * 600_000_00;
  return Math.round((league + (champion ? CHAMPION_PRIZE_CENTS : 0)) * tierFactor(tier));
}

/**
 * Cuánto paga una categoría comparada con la primera.
 *
 * La diferencia tiene que doler: si en segunda se cobrara casi lo mismo, bajar
 * sería un contratiempo deportivo y no el agujero en la caja que es de verdad.
 */
export function tierFactor(tier: number): number {
  return 1 / Math.pow(3, Math.max(0, tier - 1));
}

/** Lo que el club se lleva por subir de categoría, aparte de lo deportivo. */
export const PROMOTION_PRIZE_CENTS = 500_000_00;

export const CHAMPION_PRIZE_CENTS = 400_000_00;

/** Coste de ampliar el pabellón, por asiento nuevo. */
export const EXPANSION_COST_PER_SEAT_CENTS = 900_00;
/** Obra mínima y máxima de una ampliación, en asientos. */
export const MIN_EXPANSION_SEATS = 250;
export const MAX_EXPANSION_SEATS = 5_000;
/** Techo de aforo de un pabellón. */
export const MAX_CAPACITY = 25_000;

export function expansionCostCents(seats: number): number {
  return Math.max(0, Math.round(seats)) * EXPANSION_COST_PER_SEAT_CENTS;
}

/**
 * Cuánto pesa la reputación en lo que ingresa un club.
 *
 * Crece más rápido que la propia reputación (exponente 1,5) porque así es como
 * funciona: el club grande no cobra el doble que el mediano, cobra el triple.
 */
function reputationFactor(reputation: number): number {
  return Math.pow(clamp(reputation, 1, 100) / 50, 1.5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
