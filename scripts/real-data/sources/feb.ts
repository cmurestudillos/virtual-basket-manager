import { extractFebLeague } from './feb-extract';

/**
 * Extractor de la Primera FEB desde baloncestoenvivo.feb.es.
 *
 *   pnpm real:feb            usa la caché de descargas
 *   pnpm real:feb --force    lo vuelve a descargar todo
 *
 * Cómo se lee la web, en `feb-extract.ts`.
 */

await extractFebLeague({
  nm: 'primerafeb',
  group: 1,
  regularPhase: /liga regular/i,
  standingsCacheKey: 'feb:2025:primerafeb:clasificacion-liga-regular',
  competitionId: 'liga-plata',
  name: 'Primera FEB',
  shortName: 'PFEB',
  slug: 'feb'
});
