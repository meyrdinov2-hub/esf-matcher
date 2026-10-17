/**
 * Сравнительный прогон стенда.
 *
 * Три сценария, чтобы видеть вклад каждого слоя по отдельности:
 *   1. базовая линия      — всегда «не знаю»;
 *   2. только правила     — первый запуск у нового клиента, память пуста;
 *   3. правила + память   — рабочее состояние: за прошлый период уже
 *                           накоплены подтверждённые сопоставления.
 *
 * Третий сценарий — главный. Он показывает, как система выглядит через
 * месяц работы, а не в первый день.
 */

import { runBench, printReport, nullMatcher } from './bench.js';
import { createMatcher } from './match/pipeline.js';
import { MatchMemory } from './match/memory.js';
import { CATALOG } from './catalog.js';
import { generateDocuments } from './generator.js';

/**
 * Имитирует историю: берём документы с другим зерном — «прошлый период» —
 * и считаем, что все их строки бухгалтер уже сопоставил вручную.
 * Строки класса unknown в историю не попадают: позиции в справочнике нет,
 * значит и подтверждать было нечего.
 */
function warmMemoryFromHistory({ seed, count }) {
  const past = generateDocuments({ seed, count });
  const rows = past.flatMap((d) => d.rows)
    .filter((r) => r.truth.catalogId)
    .map((r) => ({
      supplierBin: r.supplierBin,
      supplierName: r.supplierName,
      catalogId: r.truth.catalogId,
    }));
  return { memory: MatchMemory.fromHistory(rows), rowCount: rows.length };
}

const OPTS = { seed: 20260819, count: 6 };

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  Стенд сопоставления номенклатуры · синтетические данные      ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

printReport(await runBench(nullMatcher, OPTS), '1. базовая линия');

const rulesOnly = createMatcher({ catalog: CATALOG });
printReport(await runBench(rulesOnly, OPTS), '2. только правила (память пуста)');

const { memory, rowCount } = warmMemoryFromHistory({ seed: 777001, count: 10 });
console.log(`Память прогрета историей: ${rowCount} строк → ${memory.size} уникальных пар`);
const withMemory = createMatcher({ catalog: CATALOG, memory });
printReport(await runBench(withMemory, OPTS), '3. правила + память');
