/**
 * Конвейер сопоставления.
 *
 * Слои идут от дешёвых и надёжных к дорогим и сомнительным, и первый
 * уверенный ответ останавливает работу:
 *
 *   1. память      — пара уже подтверждалась человеком. Практически истина.
 *   2. точное      — нормализованные наименования совпали дословно.
 *   3. нечёткое    — близость по токенам, триграммам и бренду.
 *   4. модель      — подключается снаружи, только на остаток.
 *
 * Смысл порядка: чем больше берут первые два слоя, тем меньше поводов
 * звать модель — и тем дешевле и предсказуемее вся система.
 */

import { parseName, trigrams, clean } from '../normalize.js';
import { extractAttrs, attrsCompatible } from './attrs.js';
import { MatchMemory } from './memory.js';

/* ------------------------------------------------------------------ */
/*  Мера близости                                                      */
/* ------------------------------------------------------------------ */

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Доля токенов справочной позиции, найденных в строке поставщика.
 *  Именно containment, а не симметричная мера: наименование в справочнике
 *  почти всегда короче — «Гель для стирки» против длинной строки с брендом
 *  и фасовкой. Симметричная мера такие пары штрафует незаслуженно. */
function containment(catalogTokens, supplierTokens) {
  if (!catalogTokens.size) return 0;
  let inter = 0;
  for (const t of catalogTokens) if (supplierTokens.has(t)) inter += 1;
  return inter / catalogTokens.size;
}

function trigramSim(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter += 1;
  return inter / Math.sqrt(a.size * b.size);
}

/** Совпадение фасовки: 170ГР и 170ГР — сильный сигнал, что позиция та же. */
function quantityBonus(a, b) {
  if (!a.length || !b.length) return 0;
  for (const qa of a) {
    for (const qb of b) {
      if (qa.unit === qb.unit && Math.abs(qa.amount - qb.amount) < 0.01) return 1;
    }
  }
  return 0;
}

/** Итоговая близость строки поставщика и позиции справочника. */
export function similarity(supplier, catalogItem) {
  const cont = containment(catalogItem.parsed.tokenSet, supplier.parsed.tokenSet);
  const jac = jaccard(catalogItem.parsed.tokenSet, supplier.parsed.tokenSet);
  const tri = trigramSim(catalogItem.grams, supplier.grams);

  // Латинские токены — почти всегда бренд. Совпал бренд — совпала и позиция.
  const brandHits = catalogItem.parsed.latin.filter((t) => supplier.parsed.tokenSet.has(t)).length;
  const brand = catalogItem.parsed.latin.length
    ? brandHits / catalogItem.parsed.latin.length
    : 0;

  const qty = quantityBonus(supplier.parsed.quantities, catalogItem.parsed.quantities);

  return (
    0.42 * cont +
    0.14 * jac +
    0.24 * tri +
    0.12 * brand +
    0.08 * qty
  );
}

/* ------------------------------------------------------------------ */
/*  Подготовка справочника                                             */
/* ------------------------------------------------------------------ */

export function prepareCatalog(catalog) {
  return catalog.map((item) => ({
    ...item,
    parsed: parseName(item.name),
    grams: trigrams(clean(item.name)),
    attrs: item.attrs ?? extractAttrs(item.name),
  }));
}

/* ------------------------------------------------------------------ */
/*  Конвейер                                                           */
/* ------------------------------------------------------------------ */

/**
 * Пороги подобраны так, чтобы «тихая ошибка» стоила дороже отказа.
 * minScore  — ниже этого даже лучший кандидат не рассматривается;
 * minGap    — насколько лучший должен опережать второго. Малый отрыв
 *             означает, что позиция неотличима от соседней, и решать
 *             должен человек, а не округление во втором знаке.
 */
export const TUNING = {
  minScore: 0.55,
  minGap: 0.08,
  memoryConfidence: 0.99,
  exactConfidence: 0.95,
};

export function createMatcher({
  catalog,
  memory = new MatchMemory(),
  llm = null,
  tuning = TUNING,
} = {}) {
  const prepared = prepareCatalog(catalog);
  const byExactName = new Map();
  for (const item of prepared) {
    byExactName.set(clean(item.name), item);
  }

  /** Сопоставляет одну строку. */
  async function matchRow(row) {
    const supplierName = row.supplierName ?? '';
    const supplierBin = row.supplierBin ?? row.supplier?.bin ?? null;

    // --- слой 1: память ---
    const remembered = memory.lookup(supplierBin, supplierName);
    if (remembered) {
      return {
        catalogId: remembered.catalogId,
        confidence: tuning.memoryConfidence,
        layer: 'memory',
        reason: `подтверждалось ранее (${remembered.hits}×)`,
        alternatives: [],
      };
    }

    const supplier = {
      parsed: parseName(supplierName),
      grams: trigrams(clean(supplierName)),
      attrs: extractAttrs(supplierName),
    };

    // --- слой 2: точное совпадение ---
    const exact = byExactName.get(clean(supplierName));
    if (exact) {
      return {
        catalogId: exact.id,
        confidence: tuning.exactConfidence,
        layer: 'exact',
        reason: 'наименования совпали дословно',
        alternatives: [],
      };
    }

    // --- слой 3: нечёткое сопоставление ---
    const scored = prepared
      // жёсткий фильтр по размеру и цвету — до всякой близости
      .filter((item) => attrsCompatible(supplier.attrs, item.attrs))
      .map((item) => ({ item, score: similarity(supplier, item) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];
    const alternatives = scored.slice(0, 4).map((s) => ({
      catalogId: s.item.id,
      name: s.item.name,
      score: Number(s.score.toFixed(3)),
    }));

    if (best && best.score >= tuning.minScore) {
      const gap = best.score - (second?.score ?? 0);
      if (gap >= tuning.minGap) {
        return {
          catalogId: best.item.id,
          // уверенность растёт и от близости, и от отрыва от второго кандидата
          confidence: Math.min(0.94, 0.5 + best.score * 0.35 + Math.min(gap, 0.3) * 0.5),
          layer: 'fuzzy',
          reason: `близость ${best.score.toFixed(2)}, отрыв ${gap.toFixed(2)}`,
          alternatives,
        };
      }
      // кандидаты неразличимы — это повод спросить, а не угадывать
      return {
        catalogId: null,
        confidence: 0.4,
        layer: 'fuzzy',
        reason: `неоднозначно: ${best.item.name} и ${second.item.name} почти равны`,
        alternatives,
      };
    }

    // --- слой 4: модель, если подключена ---
    if (llm) {
      const suggestion = await llm({ row, supplier, candidates: alternatives, catalog: prepared });
      if (suggestion) return { ...suggestion, layer: 'llm', alternatives };
    }

    return {
      catalogId: null,
      confidence: 0,
      layer: 'none',
      reason: 'похожих позиций не найдено',
      alternatives,
    };
  }

  /** Пакетная обработка — интерфейс, который ждёт стенд. */
  return async function match(rows) {
    const out = [];
    for (const row of rows) out.push(await matchRow(row));
    return out;
  };
}
