import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CACHE_ROOT } from './http';
import type { SourceLeague, SourcePlayer } from './source-types';

/** Dónde deja cada extractor su resultado: `.real-data-cache/sources/<liga>-<año>.json`. */
export function sourceFile(slug: string, seasonStartYear: number): string {
  return join(CACHE_ROOT, 'sources', `${slug}-${seasonStartYear}.json`);
}

export function writeSourceLeague(file: string, league: SourceLeague): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(league, null, 2) + '\n', 'utf8');
}

/** Opciones de línea de comandos comunes: `--force` vuelve a descargarlo todo. */
export function cliOptions(argv = process.argv.slice(2)): { force: boolean } {
  return { force: argv.includes('--force') };
}

function percent(players: SourcePlayer[], has: (player: SourcePlayer) => boolean): string {
  if (players.length === 0) return '—';
  return `${Math.round((players.filter(has).length / players.length) * 100)} %`;
}

/**
 * Resumen para revisar a ojo lo extraído: cuántos equipos y jugadores y qué
 * parte de cada campo ha salido. Un porcentaje raro suele ser un cambio en la
 * web de la fuente.
 */
export function summarizeLeague(league: SourceLeague): string {
  const players = league.teams.flatMap((team) => team.players);
  const lines = [
    `${league.name} ${league.seasonStartYear}-${String(league.seasonStartYear + 1).slice(-2)}: ` +
      `${league.teams.length} equipos, ${players.length} jugadores`,
    ...league.teams.map(
      (team) =>
        `  ${String(team.finalPosition ?? '?').padStart(2)}. ${team.name} ` +
        `(${team.city ?? 'sin ciudad'}; ${team.pavilionName ?? 'sin pabellón'}` +
        `${team.pavilionCapacity ? `, ${team.pavilionCapacity}` : ''}): ${team.players.length} jugadores`
    ),
    `  fecha de nacimiento ${percent(players, (p) => p.birthDate !== null)}, ` +
      `nacionalidad ${percent(players, (p) => p.nationality !== null)}, ` +
      `posición ${percent(players, (p) => p.position !== null)}, ` +
      `altura ${percent(players, (p) => p.heightCm !== null)}, ` +
      `peso ${percent(players, (p) => p.weightKg !== null)}, ` +
      `dorsal ${percent(players, (p) => p.shirtNumber !== null)}, ` +
      `cupo ${percent(players, (p) => p.licence !== null)}, ` +
      `estadísticas ${percent(players, (p) => p.stats !== null)}`,
    `  avisos: ${league.warnings.length}`
  ];
  return lines.join('\n');
}
