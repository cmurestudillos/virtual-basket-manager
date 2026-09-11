/**
 * El mercado: cuánto vale un jugador, cuánto pide su club y qué acepta.
 *
 * La regla de fondo es que un traspaso tiene **tres precios** que hay que
 * cuadrar a la vez: lo que pide el club que lo tiene, lo que pide el jugador de
 * ficha y lo que te puedes permitir tú. Un manager en el que sólo cuenta el
 * primero se juega con una calculadora; con los tres, se negocia.
 *
 * Todo en céntimos enteros. Funciones puras: ni base de datos ni azar.
 */

export type TransferWindow = 'summer' | 'winter' | 'closed';

export const TRANSFER_WINDOW_LABELS: Record<TransferWindow, string> = {
  summer: 'Mercado de verano',
  winter: 'Mercado de invierno',
  closed: 'Mercado cerrado'
};

/**
 * Qué ventana está abierta en una fecha del juego.
 *
 * Verano de julio a septiembre —la temporada arranca a finales de ese mes— y
 * una ventana corta en enero, como en cualquier liga europea. Fuera de ellas no
 * se ficha: es lo que obliga a llegar hecho a la temporada en vez de arreglar
 * la plantilla en marzo.
 */
export function windowFor(date: Date): TransferWindow {
  const month = date.getUTCMonth();
  if (month >= 6 && month <= 8) {
    return 'summer';
  }
  return month === 0 ? 'winter' : 'closed';
}

export function isWindowOpen(date: Date): boolean {
  return windowFor(date) !== 'closed';
}

/** Temporadas que le quedan de contrato a fecha de hoy. */
export function contractYearsLeft(contractUntil: Date | null, today: Date): number {
  if (!contractUntil) {
    return 0;
  }

  const days = (contractUntil.getTime() - today.getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(days / 365));
}

/**
 * Lo que pide un club por uno de los suyos.
 *
 * Manda el contrato: a un jugador al que le quedan cuatro años se le pone
 * precio de cuatro años, y a uno que acaba en junio casi no se le puede pedir
 * nada porque en verano se va gratis. Esa es la palanca que hace que los
 * vencimientos importen.
 */
export function askingPriceCents(input: {
  valueCents: number;
  contractYearsLeft: number;
  age: number;
}): number {
  const years = Math.min(5, Math.max(0, input.contractYearsLeft));
  // Sin contrato no hay traspaso que pagar; con uno largo, prima.
  const contract = years === 0 ? 0 : 0.55 + years * 0.22;
  // Un veterano vale menos de traspaso aunque hoy rinda igual.
  const age = input.age >= 33 ? 0.55 : input.age >= 30 ? 0.75 : input.age <= 23 ? 1.15 : 1;

  return Math.max(0, Math.round(input.valueCents * contract * age));
}

/**
 * Ficha anual que pide el jugador para firmar.
 *
 * Sale de lo que vale: quien te cuesta caro de traspaso, cobra caro. Un poco
 * por encima de lo que cobra ahora, porque nadie cambia de club para ganar lo
 * mismo.
 *
 * El 6 % del valor no es un número redondo caprichoso: es la proporción a la
 * que está el dataset del juego entre ficha y valor de mercado. Con un
 * porcentaje mayor, un solo fichaje descuadraría unas cuentas que están
 * calibradas contra esas nóminas.
 */
export function wageDemandCents(input: { valueCents: number; currentWageCents: number }): number {
  const fromValue = Math.round(input.valueCents * 0.06);
  return Math.max(MIN_WAGE_CENTS, Math.round(input.currentWageCents * 1.1), fromValue);
}

/** Ficha mínima de un profesional: nadie firma por menos. */
export const MIN_WAGE_CENTS = 30_000_00;

/** Años de contrato que se pueden ofrecer. */
export const MIN_CONTRACT_YEARS = 1;
export const MAX_CONTRACT_YEARS = 5;

export interface OfferDecision {
  accepted: boolean;
  /** Por qué, en una línea, para poder enseñarlo tal cual. */
  reason: string;
  /**
   * Lo que aceptarían, cuando la oferta se queda cerca. Es la negociación del
   * juego: en vez de un no seco, el club pone su precio y tú decides.
   */
  counterOfferCents?: number;
}

/** Por debajo de esto ni se molestan en contestar con un precio. */
export const COUNTER_OFFER_FLOOR = 0.6;

/**
 * Qué contesta el club dueño a una oferta.
 *
 * Dos cosas tienen que cuadrar: el dinero y que no se queden sin plantilla. Un
 * club con doce fichas no vende a su undécimo por mucho que le pagues, igual
 * que en la vida.
 */
export function respondToOffer(input: {
  askingPriceCents: number;
  feeCents: number;
  wageOfferedCents: number;
  wageDemandCents: number;
  sellerRosterSize: number;
  minimumRosterSize: number;
}): OfferDecision {
  if (input.sellerRosterSize <= input.minimumRosterSize) {
    return { accepted: false, reason: 'El club no puede quedarse con menos plantilla' };
  }
  if (input.wageOfferedCents < input.wageDemandCents) {
    return { accepted: false, reason: 'El jugador pide más ficha' };
  }
  // Un 5 % de margen: regatear un poco está bien visto, tirar el precio no.
  if (input.feeCents < Math.round(input.askingPriceCents * 0.95)) {
    const serious = input.feeCents >= Math.round(input.askingPriceCents * COUNTER_OFFER_FLOOR);

    return {
      accepted: false,
      reason: serious
        ? 'El club pide más por el traspaso, pero se sentaría a hablar'
        : 'El club ni se plantea esa oferta',
      // Se rebaja un poco lo que pedían: si la contraoferta fuera el precio
      // original, negociar no serviría de nada.
      ...(serious ? { counterOfferCents: Math.round(input.askingPriceCents * 0.97) } : {})
    };
  }

  return { accepted: true, reason: 'Acuerdo cerrado' };
}

/**
 * Lo que cuesta rescindir un contrato: la mitad de lo que queda por pagar.
 *
 * Ni gratis —sería la puerta de atrás para vaciar la plantilla— ni el total,
 * que dejaría la rescisión como algo que nadie usa nunca.
 */
export function releaseCostCents(wageCents: number, contractYearsLeft: number): number {
  return Math.round(wageCents * Math.max(0, contractYearsLeft) * 0.5);
}

/**
 * Fin de una cesión: el 30 de junio siguiente.
 *
 * Las cesiones son siempre por lo que queda de temporada. Una cesión a dos años
 * sería un traspaso con otro nombre.
 */
export function loanEndDate(today: Date): Date {
  const year = today.getUTCMonth() >= 6 ? today.getUTCFullYear() + 1 : today.getUTCFullYear();
  return new Date(Date.UTC(year, 5, 30));
}

/**
 * Qué contesta un club al que le ofreces a uno de los tuyos cedido.
 *
 * Acepta si tiene sitio y si el jugador le sirve de verdad: nadie se lleva
 * cedido a alguien peor que su duodécimo, porque le ocupa ficha para nada.
 */
export function acceptsLoan(input: {
  borrowerRosterSize: number;
  borrowerMaxRoster: number;
  playerOverall: number;
  borrowerWorstOverall: number;
}): OfferDecision {
  if (input.borrowerRosterSize >= input.borrowerMaxRoster) {
    return { accepted: false, reason: 'Ese club no tiene sitio en su plantilla' };
  }
  if (input.playerOverall <= input.borrowerWorstOverall) {
    return { accepted: false, reason: 'Ese club no lo ve mejor que lo que ya tiene' };
  }

  return { accepted: true, reason: 'Cesión cerrada hasta final de temporada' };
}

/**
 * Valor de mercado a partir de lo que es el jugador.
 *
 * Se recalcula al firmar y al renovar, para que un chaval que ha explotado deje
 * de valer lo que valía cuando salió de la cantera.
 */
export function marketValueCents(input: {
  overall: number;
  potential: number;
  age: number;
}): number {
  const base = Math.pow(Math.max(1, input.overall) / 10, 3.6) * 9_000;
  // El techo cuenta mientras haya tiempo de alcanzarlo.
  const upside = input.age <= 24 ? 1 + Math.max(0, input.potential - input.overall) * 0.02 : 1;
  const age = input.age >= 34 ? 0.45 : input.age >= 31 ? 0.7 : input.age <= 21 ? 1.1 : 1;

  return Math.round(base * upside * age) * 100;
}
