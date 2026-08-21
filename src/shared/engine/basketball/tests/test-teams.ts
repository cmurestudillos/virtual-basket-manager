import { uniformAttributes, type PlayerAttributes } from '@shared/domain/attributes';
import { POSITIONS, type Position } from '@shared/domain/positions';
import { DEFAULT_TACTICS, type TeamTactics } from '@shared/domain/tactics';
import type { EnginePlayer, EngineTeam } from '../types';

/**
 * Plantillas sintéticas para los tests del motor. Doce jugadores, dos por
 * posición más dos comodines, todos del mismo nivel salvo lo que el test
 * quiera retocar.
 */
export function buildTestTeam(
  id: string,
  level: number,
  overrides: Partial<TeamTactics> = {}
): EngineTeam {
  const players: EnginePlayer[] = [];

  for (let index = 0; index < 12; index += 1) {
    const position = POSITIONS[index % POSITIONS.length] as Position;
    players.push({
      id: `${id}-p${index + 1}`,
      name: `${id} jugador ${index + 1}`,
      position,
      // Los suplentes son algo peores, como en cualquier plantilla real.
      attributes: tunedAttributes(index < 5 ? level : level - 6),
      condition: 100
    });
  }

  return {
    id,
    name: `Equipo ${id}`,
    players,
    starters: players.slice(0, 5).map((player) => player.id),
    tactics: { ...DEFAULT_TACTICS, ...overrides }
  };
}

function tunedAttributes(level: number): PlayerAttributes {
  const base = uniformAttributes(Math.max(20, Math.min(95, level)));
  // Sin resistencia alta el motor rota constantemente y los tests de minutos
  // se vuelven ruido; se fija alta a propósito.
  return { ...base, stamina: 80 };
}
