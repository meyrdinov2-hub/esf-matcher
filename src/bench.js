/**
 * Тестовый стенд.
 *
 * Меряет не «точность» — она здесь почти бесполезна, — а три исхода:
 *
 *   ✓ АВТО ВЕРНО      строка сопоставлена сама и правильно. Это выигрыш.
 *   ✗ АВТО НЕВЕРНО    строка сопоставлена сама и неправильно. Это ущерб:
 *                     бухгалтер не перепроверяет зелёные строки, ошибка
 *                     уходит в учёт молча. Главное число отчёта.
 *   ? НА ПРОВЕРКУ     матчер отказался решать. Не провал: честное «не знаю»
 *                     стоит дешевле тихой ошибки.
 *
 * Отдельно считается, сколько строк ушло на проверку зря — там, где ответ
 * был очевиден. Это цена осторожности, её тоже надо видеть.
 */

import { generateDocuments, stripTruth } from './generator.js';
import { CATALOG, findCatalogItem } from './catalog.js';

/** Порог уверенности, выше которого ответ принимается без человека. */
export const DEFAULT_THRESHOLD = 0.75;

/**
 * Классы, где отказ — правильное поведение, а не трусость.
 * unknown       — позиции в справочнике нет;
 * idiosyncratic — сопоставление не выводится из текста, только из истории.
 */
const HONEST_TO_SKIP = new Set(['unknown', 'idiosyncratic']);

/**
 * @param {(rows: object[], ctx: object) => Promise<object[]>} matcher
 *   получает строки без эталона, возвращает по предложению на строку:
 *   { catalogId: string|null, confidence: number, reason?: string }
 */
export async function runBench(matcher, { seed = 20260819, count = 6, threshold = DEFAULT_THRESHOLD } = {}) {
  const docs = generateDocuments({ seed, count });
  const truthRows = docs.flatMap((d) => d.rows);
  const blindDocs = stripTruth(docs);
  const blindRows = blindDocs.flatMap((d) => d.rows);

  const started = Date.now();
  const proposals = await matcher(blindRows, { catalog: CATALOG, documents: blindDocs });
  const elapsed = Date.now() - started;

  if (proposals.length !== truthRows.length) {
    throw new Error(`матчер вернул ${proposals.length} предложений на ${truthRows.length} строк`);
  }

  const stats = {
    total: truthRows.length,
    autoCorrect: 0,
    autoWrong: 0,
    escalated: 0,
    escalatedNeedlessly: 0,
    elapsedMs: elapsed,
  };

  /** Разбивка по классам сложности — где именно матчер силён и где врёт. */
  const byDifficulty = {};
  const mistakes = [];

  truthRows.forEach((row, i) => {
    const p = proposals[i] ?? { catalogId: null, confidence: 0 };
    const d = row.truth.difficulty;
    byDifficulty[d] ??= { total: 0, autoCorrect: 0, autoWrong: 0, escalated: 0 };
    byDifficulty[d].total += 1;

    const decided = p.catalogId != null && p.confidence >= threshold;

    if (!decided) {
      stats.escalated += 1;
      byDifficulty[d].escalated += 1;
      if (!HONEST_TO_SKIP.has(d)) stats.escalatedNeedlessly += 1;
      return;
    }

    if (p.catalogId === row.truth.catalogId) {
      stats.autoCorrect += 1;
      byDifficulty[d].autoCorrect += 1;
    } else {
      stats.autoWrong += 1;
      byDifficulty[d].autoWrong += 1;
      mistakes.push({
        supplierName: row.supplierName,
        expected: row.truth.catalogId,
        expectedName: findCatalogItem(row.truth.catalogId)?.name ?? '— нет в справочнике —',
        got: p.catalogId,
        gotName: findCatalogItem(p.catalogId)?.name ?? '?',
        confidence: p.confidence,
        difficulty: d,
        reason: p.reason ?? '',
      });
    }
  });

  return { stats, byDifficulty, mistakes, threshold };
}

/* ------------------------------------------------------------------ */
/*  Печать отчёта                                                      */
/* ------------------------------------------------------------------ */

export function printReport(result, label = '') {
  const { stats, byDifficulty, mistakes, threshold } = result;
  const pct = (n) => `${((n / stats.total) * 100).toFixed(1)}%`;

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`СТЕНД${label ? ': ' + label : ''}   порог=${threshold}   строк=${stats.total}   ${stats.elapsedMs} мс`);
  console.log('─'.repeat(64));
  console.log(`  ✓ авто верно      ${String(stats.autoCorrect).padStart(4)}  ${pct(stats.autoCorrect)}`);
  console.log(`  ✗ АВТО НЕВЕРНО    ${String(stats.autoWrong).padStart(4)}  ${pct(stats.autoWrong)}   ← главное число`);
  console.log(`  ? на проверку     ${String(stats.escalated).padStart(4)}  ${pct(stats.escalated)}`);
  console.log(`      из них зря    ${String(stats.escalatedNeedlessly).padStart(4)}`);

  console.log('\n  По классам сложности:');
  const rows = Object.entries(byDifficulty).map(([k, v]) => ({
    класс: k,
    всего: v.total,
    'авто верно': v.autoCorrect,
    'АВТО НЕВЕРНО': v.autoWrong,
    'на проверку': v.escalated,
  }));
  console.table(rows);

  if (mistakes.length) {
    console.log(`  Тихие ошибки (${mistakes.length}):`);
    for (const m of mistakes.slice(0, 10)) {
      console.log(`    «${m.supplierName}»  [${m.difficulty}] conf=${m.confidence.toFixed(2)}`);
      console.log(`       ждали: ${m.expectedName}`);
      console.log(`       дал:   ${m.gotName}${m.reason ? '   (' + m.reason + ')' : ''}`);
    }
    if (mistakes.length > 10) console.log(`    … ещё ${mistakes.length - 10}`);
  } else {
    console.log('  Тихих ошибок нет.');
  }
  console.log('');
}

/* ------------------------------------------------------------------ */
/*  Базовая линия: матчер, который всегда отказывается                 */
/* ------------------------------------------------------------------ */

/**
 * Нижняя граница осмысленности. Ошибок не делает вовсе, пользы не приносит
 * тоже — вся работа остаётся человеку. Любой настоящий матчер обязан быть
 * лучше по «авто верно», не ухудшив «АВТО НЕВЕРНО».
 */
export const nullMatcher = async (rows) =>
  rows.map(() => ({ catalogId: null, confidence: 0, reason: 'базовая линия: всегда на проверку' }));

/* ------------------------------------------------------------------ */

if (process.argv[1]?.endsWith('bench.js')) {
  const result = await runBench(nullMatcher);
  printReport(result, 'базовая линия (всегда «не знаю»)');
}
