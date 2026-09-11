/**
 * Las reglas de inscripción: cuántos de casa hay que tener y hasta dónde puede
 * llegar la nómina.
 *
 * Son las dos cosas que impiden que el mercado se juegue sólo con la
 * calculadora del mejor disponible. El cupo obliga a cuidar la cantera y el
 * mercado nacional; el tope salarial obliga a que la plantilla quepa en lo que
 * ingresa el club.
 *
 * El tope es **blando y europeo**: no hay un _salary cap_ de la NBA con
 * excepciones y sanciones, hay un consejo que no te deja firmar lo que no se
 * puede pagar. Si algún día entra formato NBA, ese cap es otra pieza distinta.
 *
 * Funciones puras: ni base de datos ni azar.
 */

/** Jugadores del país del club que hay que tener inscritos como mínimo. */
export const MIN_HOMEGROWN = 4;

/**
 * Cuánto de lo que ingresa el club puede irse en fichas.
 *
 * Un 15 % por encima de lo que entra: es el margen que un consejo europeo
 * consiente —se tapa con la caja de años buenos— y por encima de eso ya no
 * firma. No es un tope caprichoso: las plantillas del juego ya gastan en fichas
 * casi todo lo que ingresan, así que un tope por debajo de sus ingresos dejaría
 * a media liga sin poder fichar a nadie desde el primer día.
 */
export const WAGE_CEILING_SHARE = 1.15;

export function wageCeilingCents(seasonIncomeCents: number): number {
  return Math.round(Math.max(0, seasonIncomeCents) * WAGE_CEILING_SHARE);
}

export interface SquadRuleCheck {
  ok: boolean;
  /** Por qué no, dicho como lo diría el director deportivo. */
  reason: string;
}

const OK: SquadRuleCheck = { ok: true, reason: '' };

/**
 * ¿Se puede fichar a este jugador?
 *
 * Un extranjero sólo entra si, con él dentro, siguen quedando los de casa que
 * exige el reglamento. Fichar a un nacional nunca rompe el cupo.
 */
export function canSign(input: {
  homegrownInSquad: number;
  squadSize: number;
  maxSquadSize: number;
  signingIsHomegrown: boolean;
  wageBillCents: number;
  wageOfferedCents: number;
  wageCeilingCents: number;
}): SquadRuleCheck {
  if (input.squadSize >= input.maxSquadSize) {
    return { ok: false, reason: `La plantilla ya tiene ${input.maxSquadSize} jugadores` };
  }

  const homegrown = input.homegrownInSquad + (input.signingIsHomegrown ? 1 : 0);
  if (homegrown < MIN_HOMEGROWN) {
    return {
      ok: false,
      reason: `Hay que inscribir al menos ${MIN_HOMEGROWN} jugadores de formación`
    };
  }

  if (input.wageBillCents + input.wageOfferedCents > input.wageCeilingCents) {
    return { ok: false, reason: 'La nómina se saldría del tope que fija el consejo' };
  }

  return OK;
}

/** ¿Se puede dejar salir a este jugador, por venta, cesión o rescisión? */
export function canLeave(input: {
  homegrownInSquad: number;
  leavingIsHomegrown: boolean;
  squadSize: number;
  minSquadSize: number;
}): SquadRuleCheck {
  if (input.squadSize <= input.minSquadSize) {
    return { ok: false, reason: `No puedes bajar de ${input.minSquadSize} jugadores` };
  }

  const homegrown = input.homegrownInSquad - (input.leavingIsHomegrown ? 1 : 0);
  if (homegrown < MIN_HOMEGROWN) {
    return {
      ok: false,
      reason: `Te quedarías sin los ${MIN_HOMEGROWN} jugadores de formación obligatorios`
    };
  }

  return OK;
}
