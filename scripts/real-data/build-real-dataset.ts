import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Dataset } from '../../src/main/features/saves/dataset';
import { NATION_NAMES } from '../../src/shared/domain/national-teams';
import { mergeRealLeagues } from './lib/merge';
import type { SourceLeague } from './lib/source-types';

/**
 * Construye `resources/real-data/dataset.json` con las ligas reales extraídas.
 *
 *   pnpm real:build
 *
 * Lee todo lo que los extractores hayan dejado en `.real-data-cache/sources/`
 * (una liga por fichero), lo mezcla con el mundo ficticio y enseña un resumen
 * para revisarlo antes de jugar: cuántos jugadores tienen atributos estimados,
 * las nacionalidades que el juego no conoce y los mejores de cada liga, que es
 * la forma más rápida de ver si la conversión tiene sentido.
 */

const SOURCES = resolve('.real-data-cache/sources');
const FICTITIOUS = resolve('resources/seed-data/dataset.json');
const OUTPUT = resolve('resources/real-data/dataset.json');

if (!existsSync(SOURCES)) {
  console.error(
    'No hay ligas extraídas: ejecuta antes los extractores (pnpm real:acb, pnpm real:feb…).'
  );
  process.exit(1);
}

const sources = readdirSync(SOURCES)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(join(SOURCES, file), 'utf8')) as SourceLeague);

const fictitious = JSON.parse(readFileSync(FICTITIOUS, 'utf8')) as Dataset;
const { dataset, reports, rated } = mergeRealLeagues(
  fictitious,
  sources,
  new Set(Object.keys(NATION_NAMES))
);

mkdirSync(resolve('resources/real-data'), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

for (const report of reports) {
  const league = rated.get(report.competitionId) ?? [];
  const overalls = league.map((entry) => entry.overall).sort((a, b) => a - b);
  const at = (share: number): number => overalls[Math.floor(share * (overalls.length - 1))] ?? 0;
  const fictitiousTeams = new Set(
    fictitious.teams
      .filter((team) => team.competitionId === report.competitionId)
      .map((team) => team.id)
  );
  console.log(`\n${report.name} (${report.competitionId})`);
  console.log(
    `  ${report.teams} equipos, ${report.players} jugadores, ${report.estimated} con atributos estimados`
  );
  console.log(
    `  descartados: ${report.droppedDuplicates} repetidos, ${report.droppedOverRoster} por encima de la plantilla máxima`
  );
  console.log(`  media: p10 ${at(0.1)} · mediana ${at(0.5)} · p90 ${at(0.9)} · máx ${at(1)}`);
  console.log(`  (en la liga ficticia había ${fictitiousTeams.size} equipos)`);
  if (report.unknownNationalities.length > 0) {
    console.log(
      `  nacionalidades que el juego no conoce (se ponen la del club): ${report.unknownNationalities.join(', ')}`
    );
  }
  console.log(
    `  entrenadores reales: ${report.teams - report.withoutCoach.length} de ${report.teams}` +
      (report.withoutCoach.length > 0
        ? ` (sin entrenador, se inventa: ${report.withoutCoach.join(', ')})`
        : '')
  );
  const best = [...league].sort((a, b) => b.overall - a.overall).slice(0, 10);
  console.log('  los diez mejores:');
  for (const entry of best) {
    const minutes = entry.source.stats ? Math.round(entry.source.stats.seconds / 60) : 0;
    console.log(
      `    ${entry.overall} ${entry.position.padEnd(2)} ${entry.source.firstName} ${entry.source.lastName} (${minutes} min${entry.estimated ? ', estimado' : ''})`
    );
  }
}

console.log(
  `\nDataset real escrito en ${OUTPUT}: ${dataset.teams.length} equipos, ${dataset.players.length} jugadores; ligas reales: ${dataset.realLeagues.join(', ')}.`
);
