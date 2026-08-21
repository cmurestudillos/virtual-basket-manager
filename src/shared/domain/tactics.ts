/**
 * Tácticas de equipo. En baloncesto la pizarra pesa mucho más que en fútbol
 * dentro de un partido concreto, porque el entrenador decide literalmente el
 * ritmo (cuántas posesiones se juegan) y de dónde salen los tiros.
 *
 * El modelo mantiene la estructura que usaban los dos referentes: un sistema
 * ofensivo, un sistema defensivo y unos cuantos deslizadores de intensidad,
 * todos ellos con efecto medible en el motor y no cosméticos.
 */

/** Sistema ofensivo. */
export type OffensiveSystem =
  /** Juego interior: buscar al poste bajo, tiros cerca del aro. */
  | 'inside'
  /** Juego exterior: circulación de balón y triple. */
  | 'outside'
  /** Contraataque: máximo ritmo, tiro rápido. */
  | 'fastbreak'
  /** Pick and roll continuo: depende del base y del pívot. */
  | 'pickAndRoll'
  /** Aclarado para la estrella: una figura asume las posesiones. */
  | 'isolation'
  /** Juego de equipo: reparto de tiro más plano, más asistencias. */
  | 'motion';

/** Sistema defensivo. */
export type DefensiveSystem =
  | 'manToMan'
  | 'zone23'
  | 'zone32'
  | 'zone131'
  /** Presión a toda pista: roba más, se cansa más y hace más faltas. */
  | 'fullCourtPress'
  /** Mixta con un hombre al hombre sobre la estrella rival. */
  | 'boxAndOne';

export const OFFENSIVE_SYSTEM_LABELS: Record<OffensiveSystem, string> = {
  inside: 'Juego interior',
  outside: 'Juego exterior',
  fastbreak: 'Contraataque',
  pickAndRoll: 'Bloqueo directo',
  isolation: 'Aclarado',
  motion: 'Juego de equipo'
};

export const DEFENSIVE_SYSTEM_LABELS: Record<DefensiveSystem, string> = {
  manToMan: 'Individual',
  zone23: 'Zona 2-3',
  zone32: 'Zona 3-2',
  zone131: 'Zona 1-3-1',
  fullCourtPress: 'Presión a toda pista',
  boxAndOne: 'Caja y uno'
};

export interface TeamTactics {
  offensiveSystem: OffensiveSystem;
  defensiveSystem: DefensiveSystem;
  /**
   * Ritmo deseado, 1-10. Sube las posesiones por partido y el desgaste; el
   * equivalente de "correr" o "parar el partido" en PC Basket.
   */
  pace: number;
  /** Intensidad defensiva, 1-10: más robos y más faltas. */
  defensiveIntensity: number;
  /** Insistencia en el rebote ofensivo, 1-10: segundas opciones a cambio de recibir contraataques. */
  offensiveReboundEffort: number;
  /** Jugador designado como referencia ofensiva (sube su uso). Opcional. */
  focusPlayerId: string | null;
}

export const DEFAULT_TACTICS: TeamTactics = {
  offensiveSystem: 'motion',
  defensiveSystem: 'manToMan',
  pace: 5,
  defensiveIntensity: 5,
  offensiveReboundEffort: 5,
  focusPlayerId: null
};

/**
 * Efecto de un sistema ofensivo sobre el reparto de tiro y el ritmo.
 * `shotMix` reparte la probabilidad de cada tipo de tiro y suma 1.
 */
export interface OffensiveSystemProfile {
  shotMix: { close: number; midRange: number; threePoint: number };
  /** Multiplicador sobre las posesiones por partido. */
  paceMultiplier: number;
  /** Multiplicador sobre la probabilidad de que una canasta lleve asistencia. */
  assistMultiplier: number;
  /** Multiplicador sobre las pérdidas. */
  turnoverMultiplier: number;
}

export const OFFENSIVE_SYSTEM_PROFILES: Record<OffensiveSystem, OffensiveSystemProfile> = {
  inside: {
    shotMix: { close: 0.55, midRange: 0.27, threePoint: 0.18 },
    paceMultiplier: 0.95,
    assistMultiplier: 1,
    turnoverMultiplier: 1.05
  },
  outside: {
    shotMix: { close: 0.3, midRange: 0.27, threePoint: 0.43 },
    paceMultiplier: 1,
    assistMultiplier: 1.1,
    turnoverMultiplier: 1
  },
  fastbreak: {
    shotMix: { close: 0.46, midRange: 0.2, threePoint: 0.34 },
    paceMultiplier: 1.12,
    assistMultiplier: 1.05,
    turnoverMultiplier: 1.15
  },
  pickAndRoll: {
    shotMix: { close: 0.42, midRange: 0.28, threePoint: 0.3 },
    paceMultiplier: 0.98,
    assistMultiplier: 1.15,
    turnoverMultiplier: 0.95
  },
  isolation: {
    shotMix: { close: 0.4, midRange: 0.34, threePoint: 0.26 },
    paceMultiplier: 0.93,
    assistMultiplier: 0.75,
    turnoverMultiplier: 0.95
  },
  motion: {
    shotMix: { close: 0.4, midRange: 0.27, threePoint: 0.33 },
    paceMultiplier: 1,
    assistMultiplier: 1.2,
    turnoverMultiplier: 0.95
  }
};

/** Efecto de un sistema defensivo. Los multiplicadores actúan sobre el ataque rival. */
export interface DefensiveSystemProfile {
  /** Multiplicador sobre el acierto rival en tiro cercano. */
  closeDefense: number;
  /** Multiplicador sobre el acierto rival en triple. */
  perimeterDefense: number;
  /** Multiplicador sobre las pérdidas rivales. */
  turnoverForced: number;
  /** Multiplicador sobre las faltas propias. */
  foulRate: number;
  /** Multiplicador sobre el rebote defensivo propio (la zona lo empeora). */
  defensiveRebound: number;
  /** Desgaste extra por posesión. */
  fatigueRate: number;
}

export const DEFENSIVE_SYSTEM_PROFILES: Record<DefensiveSystem, DefensiveSystemProfile> = {
  manToMan: {
    closeDefense: 1,
    perimeterDefense: 1,
    turnoverForced: 1,
    foulRate: 1,
    defensiveRebound: 1,
    fatigueRate: 1
  },
  zone23: {
    closeDefense: 0.94,
    perimeterDefense: 1.06,
    turnoverForced: 0.95,
    foulRate: 0.9,
    defensiveRebound: 0.94,
    fatigueRate: 0.9
  },
  zone32: {
    closeDefense: 1.05,
    perimeterDefense: 0.95,
    turnoverForced: 1,
    foulRate: 0.92,
    defensiveRebound: 0.96,
    fatigueRate: 0.92
  },
  zone131: {
    closeDefense: 1.04,
    perimeterDefense: 0.96,
    turnoverForced: 1.08,
    foulRate: 0.95,
    defensiveRebound: 0.92,
    fatigueRate: 1
  },
  fullCourtPress: {
    closeDefense: 1.06,
    perimeterDefense: 1.04,
    turnoverForced: 1.25,
    foulRate: 1.25,
    defensiveRebound: 0.98,
    fatigueRate: 1.35
  },
  boxAndOne: {
    closeDefense: 1.02,
    perimeterDefense: 1,
    turnoverForced: 1.05,
    foulRate: 1.05,
    defensiveRebound: 0.95,
    fatigueRate: 1.1
  }
};
