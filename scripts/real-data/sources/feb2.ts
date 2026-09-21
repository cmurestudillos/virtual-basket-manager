import { extractFebLeague } from './feb-extract';

/**
 * Extractor del grupo Este de la Segunda FEB desde baloncestoenvivo.feb.es,
 * sólo para el equipo que se mete en la Primera FEB del juego.
 *
 *   pnpm real:feb2            usa la caché de descargas
 *   pnpm real:feb2 --force    lo vuelve a descargar todo
 *
 * La Primera FEB real 2025-26 tiene 17 equipos y la del juego, 18: la plaza
 * que falta es para el club de Huesca, que jugó la 2025-26 en el grupo Este de
 * la Segunda FEB. Se extrae el grupo entero porque los atributos salen del
 * percentil de cada jugador en su liga; sólo ese equipo entra en el juego.
 */

/** El club de Huesca en la web de la FEB (su id de equipo de la 2025-26). */
const HUESCA_TEAM_ID = '981281';

await extractFebLeague({
  nm: 'segundafeb',
  group: 2,
  // «Liga Regular "ESTE"», sin confundirse con el «OESTE».
  regularPhase: /liga regular\W+este/i,
  standingsCacheKey: 'feb:2025:segundafeb:clasificacion-liga-regular-este',
  competitionId: 'segunda-feb-este',
  name: 'Segunda FEB Este',
  shortName: 'SFEB',
  slug: 'feb2-este',
  guest: {
    into: 'liga-plata',
    teamIds: [HUESCA_TEAM_ID],
    // Una tercera categoría, sin liga ficticia equivalente: la escala de la
    // Liga Plata ficticia bajada medio escalón (ver `scaleReference`).
    scale: { league: 'liga-plata', stepsDown: 0.5 }
  }
});
