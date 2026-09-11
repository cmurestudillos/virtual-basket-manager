import { describe, expect, it } from 'vitest';
import { uniformAttributes } from '../attributes';
import { POSITIONS, type Position } from '../positions';
import {
  DEFAULT_MINUTES_BY_DEPTH,
  LINEUP_SIZE,
  REGULATION_TEAM_MINUTES,
  buildAutomaticRotation,
  slotPositionForDepth,
  totalTargetMinutes,
  type RotationCandidate
} from '../rotation';

/** Plantilla de doce: dos por posición más dos comodines, con niveles distintos. */
function buildRoster(): RotationCandidate[] {
  return Array.from({ length: 12 }, (_, index) => {
    const position = POSITIONS[index % POSITIONS.length] as Position;
    return {
      id: `p${index + 1}`,
      position,
      secondaryPosition: null,
      // Los cinco primeros son los mejores de su puesto, los demás peores.
      attributes: uniformAttributes(index < LINEUP_SIZE ? 75 : 55)
    };
  });
}

describe('buildAutomaticRotation', () => {
  it('saca de titular al mejor de cada posición, en orden de base a pívot', () => {
    const rotation = buildAutomaticRotation(buildRoster());
    const starters = rotation.slice(0, LINEUP_SIZE);

    expect(starters.map((slot) => slot.slotPosition)).toEqual([...POSITIONS]);
    expect(starters.map((slot) => slot.playerId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('coloca a toda la plantilla y reparte los 200 minutos del partido', () => {
    const rotation = buildAutomaticRotation(buildRoster());

    expect(rotation).toHaveLength(12);
    expect(rotation.map((slot) => slot.depth)).toEqual([...Array(12).keys()]);
    expect(totalTargetMinutes(rotation)).toBe(REGULATION_TEAM_MINUTES);
  });

  it('los suplentes figuran en su posición natural, no en un hueco del quinteto', () => {
    const rotation = buildAutomaticRotation(buildRoster());
    const bench = rotation.slice(LINEUP_SIZE);

    expect(bench.every((slot) => slot.targetMinutes < DEFAULT_MINUTES_BY_DEPTH[0])).toBe(true);
    expect(bench.map((slot) => slot.slotPosition)).toEqual(
      bench.map((slot) => POSITIONS[(Number(slot.playerId.slice(1)) - 1) % POSITIONS.length])
    );
  });

  it('prefiere la posición secundaria antes que sacar a cualquiera fuera de sitio', () => {
    const roster: RotationCandidate[] = [
      { id: 'base', position: 'PG', secondaryPosition: null, attributes: uniformAttributes(60) },
      { id: 'escolta', position: 'SG', secondaryPosition: null, attributes: uniformAttributes(60) },
      { id: 'alero', position: 'SG', secondaryPosition: 'SF', attributes: uniformAttributes(55) },
      { id: 'ala', position: 'PF', secondaryPosition: null, attributes: uniformAttributes(60) },
      { id: 'pivot', position: 'C', secondaryPosition: null, attributes: uniformAttributes(60) },
      { id: 'otro', position: 'PG', secondaryPosition: null, attributes: uniformAttributes(70) }
    ];

    const rotation = buildAutomaticRotation(roster);
    const alero = rotation.find((slot) => slot.slotPosition === 'SF');

    expect(alero?.playerId).toBe('alero');
  });

  it('una plantilla corta no deja huecos inventados', () => {
    const rotation = buildAutomaticRotation(buildRoster().slice(0, 3));

    expect(rotation).toHaveLength(3);
    expect(rotation.map((slot) => slot.depth)).toEqual([0, 1, 2]);
  });
});

describe('slotPositionForDepth', () => {
  it('asigna los huecos 1 a 5 al quinteto', () => {
    expect(POSITIONS.map((_, depth) => slotPositionForDepth(depth, 'C'))).toEqual([...POSITIONS]);
  });

  it('deja al banquillo en su posición natural', () => {
    expect(slotPositionForDepth(LINEUP_SIZE, 'SG')).toBe('SG');
    expect(slotPositionForDepth(11, 'C')).toBe('C');
  });
});
