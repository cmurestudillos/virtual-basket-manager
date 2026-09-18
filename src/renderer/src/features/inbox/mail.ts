import type { InboxCategory, InboxRoute } from '@shared/domain/inbox';
import type { Tone } from '@renderer/shared/ui';

/**
 * Cómo se enseña un aviso como un correo, igual en la bandeja y en el panel del
 * inicio.
 *
 * Los avisos no tienen remitente: salen de comparar dos fotos del club (ver
 * `shared/domain/inbox.ts`). El remitente es sólo la manera de contar de un
 * vistazo de qué va —quién te escribiría eso en un club de verdad— y sale de la
 * categoría, sin inventar a nadie con nombre.
 */
export interface MailSender {
  /** Quién firma: «Servicios médicos». */
  name: string;
  /** Las dos letras del círculo. */
  initials: string;
  /** Qué es, en la etiqueta: «Lesión». */
  label: string;
  tone: Tone;
}

export const MAIL_SENDERS: Record<InboxCategory, MailSender> = {
  injury: { name: 'Servicios médicos', initials: 'SM', label: 'Lesión', tone: 'bad' },
  recovery: { name: 'Servicios médicos', initials: 'SM', label: 'Alta', tone: 'good' },
  squad: { name: 'Secretaría técnica', initials: 'ST', label: 'Plantilla', tone: 'neutral' },
  board: { name: 'El consejo', initials: 'CO', label: 'Consejo', tone: 'warn' },
  title: { name: 'Competición', initials: 'CP', label: 'Título', tone: 'accent' },
  division: { name: 'Competición', initials: 'CP', label: 'Categoría', tone: 'accent' },
  contract: { name: 'Secretaría técnica', initials: 'ST', label: 'Contratos', tone: 'warn' },
  career: { name: 'Tu carrera', initials: 'TC', label: 'Carrera', tone: 'accent' },
  press: { name: 'Sala de prensa', initials: 'SP', label: 'Prensa', tone: 'neutral' },
  national: { name: 'La federación', initials: 'FE', label: 'Selección', tone: 'accent' },
  morale: { name: 'El vestuario', initials: 'VE', label: 'Vestuario', tone: 'warn' }
};

/** El texto del acceso directo de un aviso: «Ir a la ficha». */
const SHORTCUTS: Record<string, string> = {
  dashboard: 'Ir al inicio',
  player: 'Ir a la ficha',
  squad: 'Ir a la plantilla',
  finances: 'Ir a finanzas',
  history: 'Ir al historial',
  competition: 'Ir a competición',
  market: 'Ir al mercado',
  'team-profile': 'Ir a la ficha del club'
};

export function shortcutLabel(route: InboxRoute): string {
  return SHORTCUTS[route.name] ?? 'Ir';
}
