import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { TROPHY_DESIGN, TROPHY_KINDS, TROPHY_METALS, TROPHY_SHAPES } from '@shared/domain/trophies';
import { buildTrophy, buildTrophyFor } from '../trophy-models';
import { METAL_COLORS } from '../trophy-metals';

function meshNames(trophy: Object3D): string[] {
  return trophy.children.filter((child): child is Mesh => child instanceof Mesh).map((m) => m.name);
}

/** Ancho y alto de la pieza entera: es lo que decide si la cámara la encuadra. */
function size(trophy: Object3D): Vector3 {
  trophy.updateMatrixWorld(true);
  return new Box3().setFromObject(trophy).getSize(new Vector3());
}

describe('los trofeos, dibujados por código', () => {
  it('cada forma sale distinta: ninguna silueta se repite', () => {
    const silhouettes = TROPHY_SHAPES.map((shape) => {
      const box = size(buildTrophy({ shape, metal: 'gold' }));
      return `${box.x.toFixed(2)}x${box.y.toFixed(2)}`;
    });
    expect(new Set(silhouettes).size).toBe(TROPHY_SHAPES.length);
  });

  it('caben todas en el mismo encuadre: entre medio metro y noventa centímetros', () => {
    for (const kind of TROPHY_KINDS) {
      const box = size(buildTrophyFor(kind));
      expect(box.y, kind).toBeGreaterThan(0.4);
      expect(box.y, kind).toBeLessThan(0.95);
    }
  });

  it('la copa de liga y la de Copa llevan asas; la continental, la boca abierta con su labio', () => {
    for (const shape of ['league_cup', 'low_cup'] as const) {
      expect(meshNames(buildTrophy({ shape, metal: 'gold' }))).toEqual(
        expect.arrayContaining(['handle-left', 'handle-right'])
      );
    }
    expect(meshNames(buildTrophy({ shape: 'wide_cup', metal: 'platinum' }))).toContain('rim');
    // La de Copa es baja y ancha; la de liga, alta.
    const league = size(buildTrophy({ shape: 'league_cup', metal: 'gold' }));
    const cup = size(buildTrophy({ shape: 'low_cup', metal: 'silver' }));
    expect(league.y).toBeGreaterThan(cup.y);
  });

  it('el cáliz de la liga americana lleva sus tres aros', () => {
    const names = meshNames(buildTrophy({ shape: 'chalice', metal: 'gold' }));
    expect(names.filter((name) => name.startsWith('ring-'))).toHaveLength(3);
  });

  it('el Mundial es una esfera de meridianos sobre una columna', () => {
    const names = meshNames(buildTrophy({ shape: 'globe', metal: 'gold' }));
    expect(names.filter((name) => name.startsWith('meridian-')).length).toBeGreaterThanOrEqual(6);
    expect(names).toContain('body');
  });

  it('el ascenso es una placa, no una copa', () => {
    const names = meshNames(buildTrophy({ shape: 'plaque', metal: 'bronze' }));
    expect(names).toContain('plate');
    expect(names).not.toContain('body');
  });

  it('la estatuilla de los premios lleva su balón', () => {
    expect(meshNames(buildTrophy({ shape: 'statuette', metal: 'gold' }))).toContain('ball');
  });

  it('todas se apoyan en su peana', () => {
    for (const kind of TROPHY_KINDS) {
      expect(meshNames(buildTrophyFor(kind)), kind).toContain('base');
    }
  });

  it('el metal de la copa es el de su categoría', () => {
    const trophy = buildTrophyFor('continental_third');
    const body = trophy.children.find((child) => child.name === 'body') as Mesh;
    const material = body.material as MeshStandardMaterial;
    expect(material.color.getHex()).toBe(METAL_COLORS[TROPHY_DESIGN.continental_third.metal].color);
  });

  it('los metales en 3D son los mismos que los tokens del trofeo plano', () => {
    const css = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8');
    for (const metal of TROPHY_METALS) {
      const match = css.match(new RegExp(`--color-tv-metal-${metal}:\\s*#([0-9a-f]{6})`, 'i'));
      expect(match, metal).not.toBeNull();
      expect(parseInt(match![1]!, 16), metal).toBe(METAL_COLORS[metal].color);
    }
  });
});
