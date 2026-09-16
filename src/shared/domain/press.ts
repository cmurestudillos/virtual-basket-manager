/**
 * Ruedas de prensa: lo que dices cuando te ponen un micrófono delante.
 *
 * No hay rueda de prensa en cada partido —cansaría en la tercera jornada—, sólo
 * en los que dan que hablar: una racha, una paliza, unos playoffs, un consejo
 * que se impacienta. Y lo que se contesta mueve dos cosas que **ya pesan** en
 * la partida: el ambiente de la grada, que llena el pabellón y renueva abonos,
 * y la paciencia del consejo, que decide si sigues. No hay moral de vestuario
 * que tocar, así que no se inventa: se actúa sobre lo que existe.
 *
 * Ninguna respuesta es gratis. Echar balones fuera enciende a la grada y
 * enfría al consejo; asumir la culpa tranquiliza a la directiva pero no
 * entusiasma a nadie. Si una respuesta fuera siempre la buena, no habría nada
 * que decidir.
 *
 * Funciones puras: ni base de datos ni azar.
 */

import { DANGER_CONFIDENCE } from './board';

export type PressTopic =
  'playoffs' | 'boardPressure' | 'heavyDefeat' | 'losingStreak' | 'bigWin' | 'winningStreak';

export type PressTone = 'humble' | 'confident' | 'combative';

export const PRESS_TONES = ['humble', 'confident', 'combative'] as const;

export const PRESS_TONE_LABELS: Record<PressTone, string> = {
  humble: 'Humilde',
  confident: 'Seguro',
  combative: 'Combativo'
};

/** Lo que se sabe del partido cuando llega la prensa. */
export interface PressContext {
  won: boolean;
  /** Diferencia final a favor (negativa si se perdió). */
  margin: number;
  /** Racha tras el partido: +3 son tres victorias seguidas, -3 tres derrotas. */
  streak: number;
  isPlayoff: boolean;
  /** Confianza del consejo después del partido. */
  confidence: number;
  opponentName: string;
}

/** Lo que una respuesta le hace a la grada y al consejo. */
export interface PressEffect {
  confidence: number;
  support: number;
}

export interface PressAnswer {
  tone: PressTone;
  text: string;
  effect: PressEffect;
}

/** Diferencia a partir de la cual un partido es una paliza. */
export const BLOWOUT_MARGIN = 20;
export const STREAK_FOR_PRESS = 3;
export const WINNING_STREAK_FOR_PRESS = 4;

/**
 * ¿Hay rueda de prensa, y de qué?
 *
 * Sólo un tema por partido, y por orden de lo que más pesa: unos playoffs son
 * noticia aunque se gane por dos, y un consejo al borde del despido tapa
 * cualquier racha. Sin tema no hay rueda de prensa.
 */
export function pressTopicFor(context: PressContext): PressTopic | null {
  if (context.isPlayoff) return 'playoffs';
  if (context.confidence < DANGER_CONFIDENCE && !context.won) return 'boardPressure';
  if (!context.won && -context.margin >= BLOWOUT_MARGIN) return 'heavyDefeat';
  if (context.streak <= -STREAK_FOR_PRESS) return 'losingStreak';
  if (context.won && context.margin >= BLOWOUT_MARGIN) return 'bigWin';
  if (context.streak >= WINNING_STREAK_FOR_PRESS) return 'winningStreak';
  return null;
}

/** La pregunta, con el partido dentro: una pregunta genérica no se contesta con ganas. */
export function pressQuestion(topic: PressTopic, context: PressContext): string {
  const racha = Math.abs(context.streak);
  switch (topic) {
    case 'playoffs':
      return context.won
        ? `Victoria ante ${context.opponentName} en playoffs. ¿Está el equipo para ir hasta el final?`
        : `Derrota ante ${context.opponentName} en playoffs. ¿Se puede remontar la serie?`;
    case 'boardPressure':
      return 'Se habla de que la directiva ya maneja otros nombres. ¿Se siente respaldado?';
    case 'heavyDefeat':
      return `Perder de ${-context.margin} ante ${context.opponentName}. ¿Qué ha pasado ahí dentro?`;
    case 'losingStreak':
      return `Son ${racha} derrotas seguidas. ¿Qué le pasa al equipo?`;
    case 'bigWin':
      return `Ganar de ${context.margin} a ${context.opponentName}. ¿Es este el equipo de verdad?`;
    case 'winningStreak':
      return `${racha} victorias seguidas. ¿Hasta dónde puede llegar este equipo?`;
  }
}

/**
 * Las tres respuestas de cada tema.
 *
 * Los efectos son pequeños a propósito —un punto o tres sobre cien—: una rueda
 * de prensa no salva un año, pero diez bien llevadas sí se notan. La confianza
 * y el ambiente se mueven en direcciones opuestas casi siempre, porque eso es
 * lo que pasa: lo que la grada quiere oír rara vez es lo que el consejo quiere.
 */
export const PRESS_ANSWERS: Record<PressTopic, readonly PressAnswer[]> = {
  playoffs: [
    {
      tone: 'humble',
      text: 'Partido a partido. El rival es muy bueno y cualquier despiste se paga.',
      effect: { confidence: 1, support: 0 }
    },
    {
      tone: 'confident',
      text: 'Este equipo ha venido a ganar el título, y lo vamos a pelear.',
      effect: { confidence: 0, support: 3 }
    },
    {
      tone: 'combative',
      text: 'Que nadie nos dé por muertos. Aquí se compite hasta el último segundo.',
      effect: { confidence: -1, support: 4 }
    }
  ],
  boardPressure: [
    {
      tone: 'humble',
      text: 'Entiendo la preocupación. Los resultados no son buenos y soy el primer responsable.',
      effect: { confidence: 3, support: -1 }
    },
    {
      tone: 'confident',
      text: 'Tengo la confianza del club y un plan. Los resultados van a llegar.',
      effect: { confidence: 1, support: 1 }
    },
    {
      tone: 'combative',
      text: 'No voy a perder el tiempo con rumores. Mi trabajo está en la pista.',
      effect: { confidence: -3, support: 2 }
    }
  ],
  heavyDefeat: [
    {
      tone: 'humble',
      text: 'No hay excusas. Pido disculpas a la afición: hoy no hemos estado a la altura.',
      effect: { confidence: 2, support: 1 }
    },
    {
      tone: 'confident',
      text: 'Un mal día lo tiene cualquiera. No voy a sacar conclusiones de un partido.',
      effect: { confidence: -1, support: -1 }
    },
    {
      tone: 'combative',
      text: 'Hay jugadores que tienen que dar un paso adelante, y lo van a dar.',
      effect: { confidence: 1, support: 2 }
    }
  ],
  losingStreak: [
    {
      tone: 'humble',
      text: 'Asumo la responsabilidad. Soy yo quien tiene que encontrar la solución.',
      effect: { confidence: 2, support: -1 }
    },
    {
      tone: 'confident',
      text: 'El equipo compite bien. Son detalles, y los detalles van a cambiar.',
      effect: { confidence: 0, support: 1 }
    },
    {
      tone: 'combative',
      text: 'Nos están pitando en contra partido tras partido y alguien lo tendrá que decir.',
      effect: { confidence: -2, support: 3 }
    }
  ],
  bigWin: [
    {
      tone: 'humble',
      text: 'Un gran partido, pero son dos puntos. Mañana hay que volver a trabajar.',
      effect: { confidence: 2, support: 0 }
    },
    {
      tone: 'confident',
      text: 'Esto es lo que puede hacer este equipo cuando juega a su nivel.',
      effect: { confidence: 1, support: 2 }
    },
    {
      tone: 'combative',
      text: 'Algunos nos daban por acabados. Hoy tienen la respuesta.',
      effect: { confidence: -1, support: 3 }
    }
  ],
  winningStreak: [
    {
      tone: 'humble',
      text: 'Estamos en buen momento, pero no hemos ganado nada. Los pies en el suelo.',
      effect: { confidence: 2, support: 0 }
    },
    {
      tone: 'confident',
      text: 'Este equipo puede aspirar a lo máximo. No nos ponemos techo.',
      effect: { confidence: -1, support: 3 }
    },
    {
      tone: 'combative',
      text: 'El que quiera ganarnos tendrá que sudarlo. Esto no ha hecho más que empezar.',
      effect: { confidence: 0, support: 2 }
    }
  ]
};

export function pressAnswer(topic: PressTopic, tone: PressTone): PressAnswer {
  return PRESS_ANSWERS[topic].find((answer) => answer.tone === tone) as PressAnswer;
}

/** Cómo se ha tomado lo que dijiste, en una frase: el número no se enseña. */
export function pressReaction(effect: PressEffect): string {
  const grada =
    effect.support >= 2
      ? 'La grada lo celebra'
      : effect.support <= -1
        ? 'A la grada no le gusta'
        : 'La grada lo escucha sin más';
  const consejo =
    effect.confidence >= 2
      ? 'el consejo lo valora'
      : effect.confidence <= -1
        ? 'el consejo arruga el gesto'
        : 'el consejo no dice nada';
  return `${grada}, y ${consejo}.`;
}

/**
 * Racha tras una serie de resultados, del más antiguo al más reciente: +n si
 * las últimas n fueron victorias, -n si fueron derrotas.
 */
export function currentStreak(results: readonly boolean[]): number {
  const last = results[results.length - 1];
  if (last === undefined) {
    return 0;
  }
  let length = 0;
  for (let index = results.length - 1; index >= 0 && results[index] === last; index -= 1) {
    length += 1;
  }
  return last ? length : -length;
}
