/**
 * Синтетический справочник номенклатуры — имитация того, что лежит у ТОО в 1С.
 *
 * Структура папок повторяет увиденную на записи: Материалы_2026,
 * Номенклатура_2023-2025, Услуги. Это важно: справочник ведётся по годам,
 * то есть одна и та же по смыслу позиция может существовать в нескольких
 * вариантах, и матчеру придётся выбирать между ними.
 *
 * Существеннее другое. Справочник неоднороден по «зернистости»:
 *   — есть крупные корзины («Продукты питания»), куда сваливаются десятки
 *     разных товаров;
 *   — есть узкие позиции с почти дословным названием товара;
 *   — есть позиции, названные по внутренней логике, не выводимой из текста.
 * Ровно это делает задачу нетривиальной, и генератор обязан это отражать.
 */

export const FOLDERS = {
  MAT_2026: 'Материалы_2026',
  NOM_2023: 'Номенклатура_2023-2025',
  SERVICES: 'Услуги',
};

/**
 * @typedef {object} CatalogItem
 * @property {string} id      код номенклатуры (как в 1С — 11 цифр)
 * @property {string} name    наименование в справочнике
 * @property {string} folder  папка
 * @property {string} unit    базовая единица
 * @property {'bucket'|'specific'} grain  зернистость позиции
 */

/** @type {CatalogItem[]} */
export const CATALOG = [
  // --- Крупные корзины: сюда уходит основная масса продуктовых строк ---
  { id: '00000000101', name: 'Продукты питания', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'bucket' },
  { id: '00000000102', name: 'Бытовая химия', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'bucket' },
  { id: '00000000103', name: 'Канцелярские товары', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'bucket' },
  { id: '00000000104', name: 'Хозяйственный инвентарь', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'bucket' },

  // --- Узкие позиции: названы почти как товар ---
  { id: '00000000201', name: 'Печенье', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'specific' },
  { id: '00000000202', name: 'Гель для стирки', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'specific' },
  { id: '00000000203', name: 'Кофе NESCAFE растворимый 170ГР', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'specific' },
  { id: '00000000204', name: 'КОНФЕТЫ СНИКЕРС МИНИС ВЕС', folder: FOLDERS.MAT_2026, unit: 'кг', grain: 'specific' },
  { id: '00000000205', name: 'Пакет CAREFOOD БОЛЬШОЙ BIO ШТ', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'specific' },
  { id: '00000000206', name: 'Пакет CAREFOOD СРЕДНИЙ BIO ШТ', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'specific' },
  { id: '00000000207', name: 'Вода питьевая негазированная 5л', folder: FOLDERS.MAT_2026, unit: 'шт', grain: 'specific' },
  { id: '00000000208', name: 'Салфетки бумажные', folder: FOLDERS.MAT_2026, unit: 'уп', grain: 'specific' },

  // --- Позиция с «человеческой» логикой: название не выводится из товара ---
  { id: '00000000728', name: 'Средство для мытья рук Чистозря Жидкое мыло 1л', folder: FOLDERS.NOM_2023, unit: 'шт', grain: 'specific' },

  // --- Прошлогодняя номенклатура: дубли по смыслу, ловушка для матчера ---
  { id: '00000000301', name: 'Продукты питания (2024)', folder: FOLDERS.NOM_2023, unit: 'шт', grain: 'bucket' },
  { id: '00000000302', name: 'Кофе растворимый', folder: FOLDERS.NOM_2023, unit: 'шт', grain: 'specific' },

  // --- Мерч: размерная сетка, каждая позиция отдельной строкой ---
  ...buildApparel(),

  // --- Услуги ---
  { id: '00000000864', name: '3D motion ролик', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
  { id: '00000000865', name: 'Post 100 шт в Threads', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
  { id: '00000000181', name: 'Аренда зала', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
  { id: '00000000807', name: 'Демонтаж', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
  { id: '00000000916', name: 'Суточные', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
  { id: '00000000093', name: 'Услуги подарочные сертификаты', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
  { id: '00000000574', name: 'Услуги диагностики ноутбука', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
  { id: '00000000795', name: 'Услуги по организации перевозок пассажиров', folder: FOLDERS.SERVICES, unit: 'шт', grain: 'specific' },
];

/**
 * Поло в шести размерах и двух цветах — двенадцать позиций, отличающихся
 * только атрибутами в скобках. На записи именно на них уходит больше всего
 * времени, поэтому в справочнике они заведены полным перебором.
 */
function buildApparel() {
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const colors = ['белый', 'черный'];
  const out = [];
  let n = 400;
  for (const color of colors) {
    for (const size of sizes) {
      out.push({
        id: String(n++).padStart(11, '0'),
        name: `Поло с коротким рукавом 100 % хлопок (${color} ${size})`,
        folder: FOLDERS.MAT_2026,
        unit: 'шт',
        grain: 'specific',
        attrs: { size, color },
      });
    }
  }
  return out;
}

/** Быстрый доступ по коду. */
export const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]));

export function findCatalogItem(id) {
  return CATALOG_BY_ID.get(id) ?? null;
}
