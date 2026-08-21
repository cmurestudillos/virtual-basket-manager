import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../settings.service';
import type { SettingsRepository } from '../settings.repository';

function buildRepository(): SettingsRepository {
  return {
    findByKey: vi.fn().mockReturnValue('1600x900'),
    upsert: vi.fn()
  } as unknown as SettingsRepository;
}

describe('SettingsService', () => {
  it('lee un ajuste conocido', () => {
    const repository = buildRepository();
    const service = new SettingsService(repository);

    expect(service.get('resolution')).toBe('1600x900');
    expect(repository.findByKey).toHaveBeenCalledWith('resolution');
  });

  it('guarda un ajuste conocido', () => {
    const repository = buildRepository();
    const service = new SettingsService(repository);

    service.set('ruleset', 'fiba');

    expect(repository.upsert).toHaveBeenCalledWith('ruleset', 'fiba');
  });

  it('rechaza una clave desconocida antes de llegar al repositorio', () => {
    const repository = buildRepository();
    const service = new SettingsService(repository);

    // El renderer no debería poder mandar esto nunca, pero el payload cruza una
    // serialización y los tipos de TypeScript no sobreviven al viaje.
    expect(() => service.get('lo-que-sea' as 'resolution')).toThrow();
    expect(repository.findByKey).not.toHaveBeenCalled();
  });

  it('rechaza un valor vacío', () => {
    const repository = buildRepository();
    const service = new SettingsService(repository);

    expect(() => service.set('resolution', '')).toThrow();
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
