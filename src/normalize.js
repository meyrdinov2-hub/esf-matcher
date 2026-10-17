/**
 * Нормализация наименований товаров.
 *
 * Наименования поставщиков в ЭСФ приходят как попало: капсом, с брендом в
 * середине, с граммовкой слитно, с латиницей вперемешку с кириллицей.
 * Задача модуля — привести строку к виду, по которому её можно сравнивать,
 * и заодно вытащить всё измеримое (объём, вес, фасовку) в отдельные поля.
 */

/** Единицы измерения → канонический код и множитель к базовой единице. */
const UNITS = [
  { re: /^(кг|kg)$/, unit: 'g', k: 1000 },
  { re: /^(гр?|g)$/, unit: 'g', k: 1 },
  { re: /^(л|l)$/, unit: 'ml', k: 1000 },
  { re: /^(мл|ml)$/, unit: 'ml', k: 1 },
  { re: /^(шт|штук|штука|pcs)$/, unit: 'pcs', k: 1 },
  { re: /^(уп|упак|упаковка)$/, unit: 'pack', k: 1 },
];

/**
 * Слова, которые встречаются почти в каждом наименовании и потому ничего
 * не различают. Убираем их до сравнения, иначе они раздувают схожесть.
 */
const STOPWORDS = new Set([
  'для', 'и', 'с', 'в', 'на', 'из', 'по', 'от', 'а', 'же',
  'шт', 'штук', 'уп', 'упак', 'пач',
]);

/**
 * Ходовые сокращения поставщиков. Разворачиваем в полную форму, чтобы
 * «ср-во» и «средство» сошлись.
 */
const ABBREV = new Map([
  ['ср-во', 'средство'],
  ['срво', 'средство'],
  ['ср', 'средство'],
  ['ж/б', 'жестянаябанка'],
  ['с/б', 'стекляннаябанка'],
  ['п/э', 'полиэтилен'],
  ['н/о', 'необработанный'],
  ['м/у', 'мягкаяупаковка'],
  ['тп', 'тетрапак'],
  ['пс', 'пластик'],
  ['пэт', 'пэт'],
  ['т/паста', 'зубнаяпаста'],
  ['мультифр', 'мультифрукт'],
  ['раств', 'растворимый'],
  ['нат', 'натуральный'],
  ['молоч', 'молочный'],
  ['шок', 'шоколад'],
]);

/**
 * Вставляет пробел на стыке кириллицы и латиницы: «БЕЛЫЙXS» → «БЕЛЫЙ XS».
 *
 * Поставщики регулярно склеивают слова при выгрузке, и чаще всего склейка
 * происходит именно на смене алфавита. Для матчера это критично: пока
 * размер не отделён в самостоятельный токен, его не видно, и двенадцать
 * позиций размерной сетки становятся неразличимы между собой.
 */
export function splitScripts(s) {
  return String(s)
    .replace(/([а-яА-ЯёЁ])([a-zA-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])([а-яА-ЯёЁ])/g, '$1 $2');
}

/** Базовая чистка: регистр, ё, разделители, лишние пробелы. */
export function clean(raw) {
  return splitScripts(String(raw ?? ''))
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, ' ')
    .replace(/[(){}\[\]]/g, ' ')
    .replace(/[.,;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Вытаскивает количественные признаки: объём/вес и фасовку вида «20X225ГР».
 * Возвращает найденные величины и строку без них — дальше сравнивать удобнее
 * по «голому» тексту, а числа сопоставлять отдельно.
 */
export function extractQuantities(text) {
  const quantities = [];
  let rest = text;

  // Фасовка: «20x225гр», «6х1л» — множитель и единичный объём.
  rest = rest.replace(
    /(\d+)\s*[xх*]\s*(\d+(?:[.,]\d+)?)\s*(кг|kg|гр?|g|мл|ml|л|l)\b/gi,
    (_m, count, value, unit) => {
      const norm = normalizeUnit(value, unit);
      if (norm) quantities.push({ ...norm, count: Number(count) });
      return ' ';
    },
  );

  // Одиночная величина: «1,3л», «450мл», «120гр».
  rest = rest.replace(
    /(\d+(?:[.,]\d+)?)\s*(кг|kg|гр?|g|мл|ml|л|l|шт|pcs)\b/gi,
    (_m, value, unit) => {
      const norm = normalizeUnit(value, unit);
      if (norm) quantities.push({ ...norm, count: 1 });
      return ' ';
    },
  );

  return { quantities, rest: rest.replace(/\s+/g, ' ').trim() };
}

function normalizeUnit(value, rawUnit) {
  const num = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  const u = String(rawUnit).toLowerCase();
  for (const { re, unit, k } of UNITS) {
    if (re.test(u)) return { unit, amount: num * k };
  }
  return null;
}

/**
 * Процент жирности («3,5 %») — отдельный признак: для молочки он часто
 * единственное, что отличает две позиции.
 */
export function extractPercent(text) {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return { percent: null, rest: text };
  return {
    percent: Number(m[1].replace(',', '.')),
    rest: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim(),
  };
}

/** Разбивает на токены, разворачивает сокращения, выкидывает стоп-слова. */
export function tokenize(text) {
  return text
    .split(/[\s/\\-]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ABBREV.get(t) ?? t)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/**
 * Полный разбор наименования. Результат используют и матчер, и генератор,
 * поэтому форма одна на всех.
 */
export function parseName(raw) {
  const cleaned = clean(raw);
  const { percent, rest: noPercent } = extractPercent(cleaned);
  const { quantities, rest } = extractQuantities(noPercent);
  const tokens = tokenize(rest);

  return {
    raw: String(raw ?? ''),
    cleaned,
    tokens,
    tokenSet: new Set(tokens),
    quantities,
    percent,
    /** Латинские токены — обычно бренды, они сильный сигнал совпадения. */
    latin: tokens.filter((t) => /^[a-z0-9&+.-]+$/.test(t)),
  };
}

/** Символьные n-граммы — устойчивы к опечаткам и разной морфологии. */
export function trigrams(text) {
  const padded = `  ${text.replace(/\s+/g, ' ')} `;
  const out = new Set();
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}
