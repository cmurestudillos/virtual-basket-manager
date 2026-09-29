import type { TrophyMetal } from '@shared/domain/trophies';

/**
 * Los cuatro metales de los trofeos, en cifras para three.js.
 *
 * Son los mismos colores que los tokens `tv-metal-*` de `assets/main.css`, que
 * pintan el trofeo plano de respaldo (`TrophyIcon`): la copa en 3D y la del
 * icono tienen que ser del mismo metal. Un test compara las dos listas.
 */
export const METAL_COLORS: Record<TrophyMetal, { color: number; emissive: number }> = {
  gold: { color: 0xd9a92b, emissive: 0x2a1d00 },
  silver: { color: 0xc3c9d1, emissive: 0x1a1d21 },
  bronze: { color: 0xb87333, emissive: 0x2a1408 },
  platinum: { color: 0xe3e8ee, emissive: 0x20252a }
};
