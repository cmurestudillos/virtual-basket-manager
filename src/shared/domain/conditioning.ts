/**
 * Estado físico entre partidos.
 *
 * La frescura dentro de un partido ya la lleva el motor; esto es la otra mitad:
 * con cuánto llega el jugador al siguiente. Es lo que convierte el reparto de
 * minutos en una decisión con consecuencias — apretar a un titular treinta y
 * tantos minutos cada tres días se paga en el partido siguiente, y antes o
 * después en la enfermería.
 *
 * Funciones puras sobre números: ni base de datos ni azar.
 */

export const MAX_CONDITION = 100;

/** Por debajo de esto, darle treinta minutos a alguien es buscarse un problema. */
export const TIRED_CONDITION = 70;

/**
 * Forma que pierde un jugador por los minutos que acaba de jugar.
 *
 * La resistencia es lo que separa a quien puede jugar 35 minutos cada tres días
 * de quien no: con 80 de resistencia un partido completo cuesta unos 24 puntos,
 * y con 40 se acerca a 30.
 */
export function gameWear(minutesPlayed: number, stamina: number): number {
  const perMinute = 1.15 - (clamp(stamina, 1, 99) / 100) * 0.5;
  return Math.max(0, minutesPlayed) * perMinute;
}

export function conditionAfterGame(
  condition: number,
  minutesPlayed: number,
  stamina: number
): number {
  return round(clamp(condition - gameWear(minutesPlayed, stamina), 0, MAX_CONDITION));
}

/** Forma que recupera en un día de descanso. */
export function dailyRecovery(stamina: number): number {
  return 6 + (clamp(stamina, 1, 99) / 100) * 6;
}

/**
 * Forma tras unos días sin jugar.
 *
 * La recuperación es lineal y con tope, así que saltarse seis días de calendario
 * de golpe —lo que hace «ir a la jornada»— da exactamente lo mismo que avanzar
 * seis veces de uno en uno. Esa equivalencia es la que permite que el reloj vaya
 * a saltos sin que el estado físico dependa de cómo lo hayas movido.
 */
export function conditionAfterRest(condition: number, days: number, stamina: number): number {
  const recovered = condition + Math.max(0, days) * dailyRecovery(stamina);
  return round(clamp(recovered, 0, MAX_CONDITION));
}

/**
 * Forma que cuesta una semana de entrenamiento. La intensidad es el mando: a 10
 * se entrena el doble de duro que a 5, y se llega al fin de semana fundido.
 */
export function trainingWear(intensity: number, recovering: boolean): number {
  if (recovering) {
    return 0;
  }
  return clamp(intensity, 1, 10) * 1.8;
}

/** Lo que gana de más quien se dedica a recuperar en vez de a entrenar. */
export const RECOVERY_FOCUS_BONUS = 8;

/** Etiqueta legible de la forma, como la que enseñaba PC Basket en la plantilla. */
export function conditionLabel(condition: number): string {
  if (condition >= 90) return 'Fresco';
  if (condition >= 75) return 'Bien';
  if (condition >= 55) return 'Cargado';
  return 'Fundido';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value);
}
