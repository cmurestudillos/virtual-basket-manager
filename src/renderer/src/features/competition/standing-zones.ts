import type { StandingZone } from '@shared/domain/promotion';

/**
 * Las marcas de zona de una clasificación: la barra de 4 px en la primera
 * celda de la fila, como IBM.
 *
 * Verde (`zone-up`) para lo que se gana —playoffs o ascenso— y granate
 * (`zone-down`) para el descenso, que son las dos de `.data-table`. El play-in
 * de la liga americana va en ámbar: está a medio camino entre las dos.
 *
 * Una división puede tener a la vez ascenso y playoffs: entonces el ascenso
 * pasa a cian, porque dos zonas distintas con el mismo color no se distinguen
 * en la leyenda.
 */

export type ShownZone = Exclude<StandingZone, null>;

/** El orden en que se leen en la leyenda: de arriba abajo de la tabla. */
export const ZONE_ORDER: readonly ShownZone[] = ['promotion', 'playoffs', 'playIn', 'relegation'];

const PLAY_IN = 'shadow-[inset_4px_0_0_var(--color-tv-amber)]';
const PROMOTION_BESIDE_PLAYOFFS = 'shadow-[inset_4px_0_0_var(--color-tv-cyan)]';

/** Las zonas que tiene de verdad una tabla, en el orden de la leyenda. */
export function zonesIn(rows: readonly { zone: StandingZone }[]): ShownZone[] {
  const seen = new Set(rows.map((row) => row.zone));
  return ZONE_ORDER.filter((zone) => seen.has(zone));
}

/** La clase de la primera celda de una fila, según las zonas que hay en su tabla. */
export function zoneCellClass(zone: StandingZone, zones: readonly ShownZone[]): string {
  switch (zone) {
    case 'playoffs':
      return 'zone-up';
    case 'promotion':
      return zones.includes('playoffs') ? PROMOTION_BESIDE_PLAYOFFS : 'zone-up';
    case 'playIn':
      return PLAY_IN;
    case 'relegation':
      return 'zone-down';
    default:
      return '';
  }
}

/** El color de la muestra de cada zona en la leyenda: el mismo que su barra. */
export function zoneSwatchClass(zone: ShownZone, zones: readonly ShownZone[]): string {
  switch (zone) {
    case 'playoffs':
      return 'bg-tv-green';
    case 'promotion':
      return zones.includes('playoffs') ? 'bg-tv-cyan' : 'bg-tv-green';
    case 'playIn':
      return 'bg-tv-amber';
    case 'relegation':
      return 'bg-tv-red-deep';
  }
}
