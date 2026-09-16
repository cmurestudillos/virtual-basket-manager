/**
 * La moral de los jugadores.
 *
 * Existía en la ficha desde el principio y no hacía nada. Ahora la mueven las
 * cosas que en un vestuario de verdad mueven el ánimo —**los minutos** que se
 * juegan comparados con los que uno cree merecer, **los resultados**, lo duro
 * que se **entrena** y que te llame **tu selección**— y tiene consecuencias:
 * un jugador contento rinde unos puntos por encima de lo que dicen sus medias,
 * uno hundido unos cuantos por debajo, y el descontento pide más para renovar
 * o directamente no quiere.
 *
 * Todo se mide contra 70, que es el ánimo normal de un profesional: con el
 * tiempo, sin nada que lo mueva, cualquiera vuelve ahí.
 *
 * Funciones puras: ni base de datos ni azar.
 */

export const DEFAULT_MORALE = 70;
export const MIN_MORALE = 0;
export const MAX_MORALE = 100;
/** Por debajo de esto, el jugador lo dice: es un aviso en la bandeja. */
export const UNHAPPY_MORALE = 35;
/** Y por debajo de esto no firma una renovación por nada del mundo. */
export const REFUSES_RENEWAL_MORALE = 20;

export type MoraleTone = 'good' | 'neutral' | 'warn' | 'bad';

export function moraleLabel(morale: number): string {
  if (morale >= 85) return 'Eufórico';
  if (morale >= 65) return 'Contento';
  if (morale >= 45) return 'Normal';
  if (morale >= 25) return 'Descontento';
  return 'Enfadado';
}

export function moraleTone(morale: number): MoraleTone {
  if (morale >= 65) return 'good';
  if (morale >= 45) return 'neutral';
  if (morale >= 25) return 'warn';
  return 'bad';
}

/**
 * Los minutos que un jugador cree merecer según su lugar en la plantilla
 * (1 = el mejor). Los cinco mejores quieren ser titulares; los tres
 * siguientes, rotación de verdad; los dos siguientes, minutos sueltos; y el
 * resto sabe que su papel es entrenar.
 */
export function expectedMinutes(roleRank: number): number {
  if (roleRank <= 5) return 26;
  if (roleRank <= 8) return 16;
  if (roleRank <= 10) return 8;
  return 0;
}

/**
 * La moral después de un partido en el que se vistió.
 *
 * Los minutos pesan más que el resultado: ganar sentado en el banquillo no
 * contenta a nadie que se cree titular. Y quien no esperaba jugar agradece los
 * minutos que le caigan.
 */
export function moraleAfterGame(input: {
  morale: number;
  minutesPlayed: number;
  roleRank: number;
  won: boolean;
  margin: number;
}): number {
  const expected = expectedMinutes(input.roleRank);
  let delta = 0;

  if (expected === 0) {
    delta += input.minutesPlayed >= 8 ? 1 : 0;
  } else {
    const ratio = input.minutesPlayed / expected;
    if (ratio >= 0.85) delta += 1;
    else if (ratio >= 0.5) delta += 0;
    else if (input.minutesPlayed > 0) delta -= 2;
    else delta -= 3;
  }

  const margin = Math.abs(input.margin);
  if (input.won) {
    delta += margin >= 15 ? 2 : 1;
  } else {
    delta -= margin >= 15 ? 2 : 1;
  }

  return clampMorale(input.morale + delta);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Puntos de vuelta a lo normal en un tramo del calendario: uno por cada tercer
 * día que se cruza. Se cuenta sobre días absolutos, así que da lo mismo avanzar
 * seis días de golpe que de uno en uno, igual que la forma física.
 */
export function moraleRecoveryPoints(from: Date, to: Date): number {
  const day = (date: Date) => Math.floor(date.getTime() / DAY_MS);
  return Math.max(0, Math.floor(day(to) / 3) - Math.floor(day(from) / 3));
}

/** Días sin nada que lo mueva: el ánimo vuelve a lo normal. */
export function moraleAfterRest(morale: number, recovery: number): number {
  if (recovery <= 0 || morale === DEFAULT_MORALE) {
    return morale;
  }
  return morale > DEFAULT_MORALE
    ? Math.max(DEFAULT_MORALE, morale - recovery)
    : Math.min(DEFAULT_MORALE, morale + recovery);
}

/**
 * Lo que una semana de entrenamiento le hace al ánimo: apretar mucho cansa la
 * cabeza además de las piernas, y una semana suave se agradece.
 */
export function trainingMoraleDelta(intensity: number): number {
  if (intensity >= 8) return -2;
  if (intensity <= 3) return 1;
  return 0;
}

/** Que te llame tu selección es un orgullo. */
export const CALLUP_MORALE_BOOST = 4;

/**
 * Lo que la moral le suma o resta a cada atributo en pista: de +4 eufórico a
 * -6 hundido. Es poco por atributo y mucho sumado: se nota en el partido sin
 * que un titular enfadado pase a ser un suplente.
 */
export function moraleAttributeOffset(morale: number): number {
  return Math.max(-6, Math.min(4, Math.round((morale - DEFAULT_MORALE) / 8)));
}

/** Cuánto más (o menos) pide para renovar según su ánimo. */
export function renewalWageFactor(morale: number): number {
  if (morale < UNHAPPY_MORALE) return 1.25;
  if (morale < 50) return 1.1;
  if (morale >= 85) return 0.9;
  return 1;
}

export function refusesToRenew(morale: number): boolean {
  return morale < REFUSES_RENEWAL_MORALE;
}

export function clampMorale(value: number): number {
  return Math.min(MAX_MORALE, Math.max(MIN_MORALE, Math.round(value)));
}
