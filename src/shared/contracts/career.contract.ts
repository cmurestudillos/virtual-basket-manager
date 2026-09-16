/**
 * El modo carrera: tu hoja de servicios y quién te quiere.
 *
 * Sólo tiene sentido en partidas creadas en modo carrera; en modo mánager el
 * despido sigue siendo el final y estas llamadas devuelven una carrera apagada.
 */

/** Una etapa al frente de un club. */
export interface CareerSpell {
  teamId: string;
  teamName: string;
  /** Primera y última temporada al frente. `endSeason` nulo si sigue en curso. */
  startSeason: number;
  endSeason: number | null;
  /** `dismissed`, `left`, o nulo mientras dura. */
  endReason: string | null;
  /** Títulos ganados en esa etapa. */
  titles: number;
}

/** Un club que te quiere de entrenador. */
export interface CareerOffer {
  teamId: string;
  teamName: string;
  competitionName: string;
  /** 1 = máxima categoría: bajar a segunda tras un despido es una salida real. */
  tier: number;
  reputation: number;
  /** Puesto actual en su liga, para saber qué te vas a encontrar. */
  position: number | null;
  teams: number;
  /** Lo que te va a pedir su consejo, ya traducido. */
  objectiveLabel: string;
  /** Cómo de arriba o abajo queda respecto a donde estabas. */
  stepLabel: string;
}

export interface CareerStatus {
  /** La partida se creó en modo carrera. */
  careerMode: boolean;
  managerName: string;
  /** Lo que vales ahora mismo, 1-100. */
  reputation: number;
  reputationLabel: string;
  /** Estás sin equipo y hay que elegir destino. */
  unemployed: boolean;
  /** El club que diriges, si diriges alguno. */
  currentTeamName: string | null;
  spells: CareerSpell[];
  /** Temporadas dirigidas y títulos, para la cabecera. */
  seasonsManaged: number;
  titles: number;
  /**
   * Clubes interesados. Estando libre, los que tienen el banquillo abierto este
   * mes; con equipo, sólo al acabar la temporada y sólo los que tientan.
   */
  offers: CareerOffer[];
  /** Las ofertas llegan teniendo equipo: aceptar una es dejar el tuyo. */
  offersWhileEmployed: boolean;
  /** Se puede dimitir: carrera, con banquillo. */
  canResign: boolean;
  /** Se puede esperar a otra ventana: carrera, sin banquillo. */
  canWait: boolean;
  /** Fecha del juego, para saber cuánto tiempo se lleva esperando. */
  currentDate: number;
}

export interface CareerApi {
  getStatus: () => Promise<CareerStatus>;
  /** Acepta la oferta de un club y pasa a dirigirlo desde ya. */
  accept: (teamId: string) => Promise<CareerStatus>;
  /** Deja el banquillo por voluntad propia. */
  resign: () => Promise<CareerStatus>;
  /** Deja pasar un mes sin banquillo, con el mundo jugándose, y trae ofertas nuevas. */
  wait: () => Promise<CareerStatus>;
}
