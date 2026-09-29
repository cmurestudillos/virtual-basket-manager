import { describe, expect, it } from 'vitest';
import { sectionHasTabs } from '../sections';

describe('sectionHasTabs', () => {
  it('hay pestañas de sección cuando la sección tiene más de una pantalla', () => {
    expect(sectionHasTabs('lineup')).toBe(true);
    expect(sectionHasTabs('history')).toBe(true);
    expect(sectionHasTabs('competition')).toBe(true);
  });

  it('no las hay con una sola pantalla, ni fuera del marco', () => {
    expect(sectionHasTabs('market')).toBe(false);
    expect(sectionHasTabs('national')).toBe(false);
    expect(sectionHasTabs('settings')).toBe(false);
    expect(sectionHasTabs(undefined)).toBe(false);
  });

  it('cuenta las rutas sin pestaña propia de una sección con pestañas', () => {
    expect(sectionHasTabs('team-profile')).toBe(true);
  });
});
