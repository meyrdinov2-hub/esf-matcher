/**
 * Таблица соответствий — накопленная память сопоставлений.
 *
 * Самый ценный слой во всей системе и при этом самый простой. Поставщики
 * называют товары стабильно: если «ГЕЛЬ ДЛЯ СТИРКИ BIMAX COLOR 1,3Л» один
 * раз увели в «Гель для стирки», то и в следующей накладной это будет тот
 * же товар. Один раз подтвердили — дальше подставляется само, без всякой
 * модели.
 *
 * Здесь же оседают сопоставления, которые из текста не выводятся вовсе
 * (гель для посуды → жидкое мыло). Модель их не угадает никогда, а таблица
 * запомнит с первого раза.
 */

import { clean } from '../normalize.js';

/** Ключ пары. БИН в ключе намеренно: у разных поставщиков одно и то же
 *  наименование может означать разные позиции. */
export function pairKey(supplierBin, supplierName) {
  return `${supplierBin ?? '*'}::${clean(supplierName)}`;
}

export class MatchMemory {
  constructor(entries = []) {
    /** @type {Map<string, {catalogId: string, hits: number, confirmedAt: string}>} */
    this.map = new Map();
    for (const e of entries) this.map.set(e.key, e);
  }

  lookup(supplierBin, supplierName) {
    return (
      this.map.get(pairKey(supplierBin, supplierName)) ??
      // запасной вариант: та же строка у другого поставщика — слабее, но лучше, чем ничего
      this.map.get(pairKey('*', supplierName)) ??
      null
    );
  }

  /** Фиксирует подтверждённое человеком сопоставление. */
  remember(supplierBin, supplierName, catalogId, { confirmedAt = null } = {}) {
    const key = pairKey(supplierBin, supplierName);
    const existing = this.map.get(key);
    this.map.set(key, {
      key,
      supplierBin,
      supplierName,
      catalogId,
      hits: (existing?.hits ?? 0) + 1,
      confirmedAt: confirmedAt ?? existing?.confirmedAt ?? null,
    });
  }

  /** Забыть пару — если бухгалтер понял, что раньше сопоставлял неверно. */
  forget(supplierBin, supplierName) {
    this.map.delete(pairKey(supplierBin, supplierName));
  }

  get size() {
    return this.map.size;
  }

  toJSON() {
    return [...this.map.values()];
  }

  static fromJSON(json) {
    return new MatchMemory(Array.isArray(json) ? json : []);
  }

  /**
   * Разбор истории: строки ранее проведённых ЭСФ с уже заполненной
   * колонкой «Товар». Именно этим методом в систему заезжают годы работы
   * бухгалтерии — без единого доступа, просто выгрузкой.
   */
  static fromHistory(rows) {
    const mem = new MatchMemory();
    for (const r of rows) {
      if (!r.catalogId || !r.supplierName) continue;
      mem.remember(r.supplierBin, r.supplierName, r.catalogId, { confirmedAt: r.date ?? null });
    }
    return mem;
  }
}
