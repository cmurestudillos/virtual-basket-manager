import type { InboxCategory, InboxRoute } from '@shared/domain/inbox';
import type { PressTone } from '@shared/domain/press';

/** Un aviso de la bandeja. */
export interface InboxMessage {
  id: string;
  /** Fecha del juego en que pasó, en milisegundos. */
  createdOn: number;
  category: InboxCategory;
  title: string;
  body: string;
  /** A dónde lleva al pulsarlo; nulo si sólo informa. */
  route: InboxRoute | null;
  read: boolean;
  /** Si es una rueda de prensa, cuál. */
  pressConferenceId: string | null;
}

export interface InboxView {
  messages: InboxMessage[];
  unread: number;
}

/** Una de las respuestas posibles, sin sus efectos: eso se descubre contestando. */
export interface PressOption {
  tone: PressTone;
  toneLabel: string;
  text: string;
}

export interface PressConference {
  id: string;
  createdOn: number;
  question: string;
  options: PressOption[];
  /** Lo que contestaste; nulo si aún no. */
  answeredTone: PressTone | null;
  /** Cómo se lo tomaron la grada y el consejo, en una frase. */
  reaction: string | null;
  /** Ya no se puede contestar: llegó otra rueda de prensa después. */
  expired: boolean;
}

export interface InboxApi {
  /** La bandeja, al día: lee lo que haya pasado desde la última vez. */
  get: () => Promise<InboxView>;
  /** Sólo el contador de no leídos, para el menú. */
  unreadCount: () => Promise<number>;
  markRead: (id: string) => Promise<InboxView>;
  markAllRead: () => Promise<InboxView>;
  getPress: (id: string) => Promise<PressConference | null>;
  answerPress: (id: string, tone: PressTone) => Promise<PressConference>;
}
