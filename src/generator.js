/**
 * Генератор синтетических входящих ЭСФ с эталоном.
 *
 * Выдаёт две вещи одновременно: строки раздела G так, как их пишет
 * поставщик, и правильный ответ для каждой строки. Второе на реальных
 * данных пришлось бы размечать руками — здесь оно бесплатно.
 *
 * ВАЖНО о честности стенда. Строки размечены по классам сложности, и три
 * из них принципиально не решаются анализом текста:
 *   — bucket: товар уходит в крупную корзину, и понять, в какую именно,
 *     можно только зная привычки конкретной бухгалтерии;
 *   — idiosyncratic: сопоставление, которое человек сделал по своей логике
 *     (гель для посуды → жидкое мыло). Из текста не выводится в принципе;
 *   — unknown: позиции в справочнике нет, правильный ответ — «не знаю».
 * Матчер, который уверенно отвечает на эти классы, не умный, а опасный.
 */

import { CATALOG } from './catalog.js';

/* ------------------------------------------------------------------ */
/*  Детерминированный ПСЧ — чтобы прогоны стенда были воспроизводимы   */
/* ------------------------------------------------------------------ */

export function makeRng(seed = 20260819) {
  let s = seed >>> 0;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const chance = (rng, p) => rng() < p;

/* ------------------------------------------------------------------ */
/*  Заготовки товаров                                                  */
/* ------------------------------------------------------------------ */

/**
 * base      — как товар называется по сути
 * brand     — бренд, поставщики любят вставлять его в середину
 * qty       — фасовка, дописывается в конец
 * truth     — код позиции в нашем справочнике (null = позиции нет)
 * difficulty— класс сложности, см. шапку файла
 */
const SEEDS = [
  // --- semantic: ответ выводится из текста ---
  { base: 'гель для стирки', brand: 'BIMAX COLOR', qty: '1,3Л', truth: '00000000202', difficulty: 'semantic' },
  { base: 'печенье', brand: 'БЕЛЬВИТА ВИТАМИН ФУНДУК/МЕД', qty: '20X225ГР', truth: '00000000201', difficulty: 'semantic' },
  { base: 'кофе', brand: 'NESCAFE ГОЛД АРОМА РАСТВОРИМЫЙ', qty: '170ГР', truth: '00000000203', difficulty: 'semantic' },
  { base: 'салфетки бумажные', brand: 'ZEWA', qty: '100ШТ', truth: '00000000208', difficulty: 'semantic' },
  { base: 'вода питьевая негазированная', brand: 'ТУРГЕНЬ', qty: '5Л', truth: '00000000207', difficulty: 'semantic' },

  // --- exact: наименование почти дословно совпадает со справочником ---
  { base: 'пакет CAREFOOD большой BIO', brand: '', qty: 'ШТ', truth: '00000000205', difficulty: 'exact' },
  { base: 'пакет CAREFOOD средний BIO', brand: '', qty: 'ШТ', truth: '00000000206', difficulty: 'exact' },
  { base: 'конфеты сникерс минис', brand: '', qty: 'ВЕС', truth: '00000000204', difficulty: 'exact' },

  // --- bucket: разные товары в одну корзину «Продукты питания» ---
  { base: 'сок', brand: 'ФРУТО НЯНЯ МУЛЬТИФРУКТ', qty: '200МЛ', truth: '00000000101', difficulty: 'bucket' },
  { base: 'паста творожная', brand: 'САВУШКИН ДЕСЕРТ ЧИЗКЕЙК 3,5%', qty: '120ГР', truth: '00000000101', difficulty: 'bucket' },
  { base: 'пюре', brand: 'ФРУТО НЯНЯ ЯБЛ/ЗЕМЛЯНИКА/ЕЖЕВИКА/ОВСЯН/ПЕЧЕНЬЕ', qty: '90ГР ПАУЧ', truth: '00000000101', difficulty: 'bucket' },
  { base: 'молоко', brand: 'ЛАКТЕЛЬ С ВИТАМИНОМ D 2,5%', qty: '1П ТП', truth: '00000000101', difficulty: 'bucket' },
  { base: 'йогурт питьевой', brand: 'АКТИВИА КЛУБНИКА 2,0%', qty: '260Г', truth: '00000000101', difficulty: 'bucket' },
  { base: 'сыр плавленый', brand: 'ХОХЛАНД СЛИВОЧНЫЙ', qty: '200Г', truth: '00000000101', difficulty: 'bucket' },

  // --- idiosyncratic: сопоставление по внутренней логике бухгалтера ---
  { base: 'гель для мытья посуды', brand: 'FREYA СОЧНЫЙ ГРЕЙПФРУТ', qty: '450МЛ', truth: '00000000728', difficulty: 'idiosyncratic' },
  { base: 'средство чистящее универсальное', brand: 'ДОМЕСТОС', qty: '750МЛ', truth: '00000000728', difficulty: 'idiosyncratic' },

  // --- unknown: в справочнике такого нет, ждём честное «не знаю» ---
  { base: 'кабель питания', brand: 'HDMI 2.1 4K', qty: '3М', truth: null, difficulty: 'unknown' },
  { base: 'картридж лазерный', brand: 'HP 106A', qty: 'ШТ', truth: null, difficulty: 'unknown' },
  { base: 'подписка на сервис удаленного видеонаблюдения', brand: '', qty: 'ИЮЛЬ 2026', truth: null, difficulty: 'unknown' },
];

/** Поло — отдельно: атрибутный разбор размера и цвета. */
function apparelSeeds() {
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const colors = ['белый', 'черный'];
  const out = [];
  for (const color of colors) {
    for (const size of sizes) {
      const item = CATALOG.find(
        (c) => c.attrs && c.attrs.size === size && c.attrs.color === color,
      );
      out.push({
        base: 'поло с коротким рукавом 100 % хлопок',
        brand: '',
        qty: `(${color} ${size})`,
        truth: item.id,
        difficulty: 'attribute',
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Стили поставщиков                                                  */
/* ------------------------------------------------------------------ */

/**
 * Каждый поставщик коверкает наименования по-своему и стабильно.
 * Стабильность важна: именно она делает осмысленной таблицу соответствий —
 * один раз сопоставил, дальше подставляется само.
 */
export const SUPPLIERS = [
  {
    bin: '990140000121',
    name: 'ТОО «Магнум Кэш энд Керри»',
    style: (rng, s) => upper(`${s.base} ${s.brand} ${s.qty}`),
  },
  {
    bin: '010340003456',
    name: 'ТОО «Восток Дистрибьюшн»',
    // бренд вперёд, потом суть
    style: (rng, s) => upper(`${s.brand} ${s.base} ${s.qty}`),
  },
  {
    bin: '150240004425',
    name: 'ТОО «Ак-Ниет Трейд»',
    // сокращения и слипшаяся фасовка
    style: (rng, s) => abbreviate(upper(`${s.base} ${s.brand}`)) + ' ' + s.qty.replace(/\s+/g, ''),
  },
  {
    bin: '200940007788',
    name: 'ИП Сериков',
    // как есть, но с опечатками и без капса
    style: (rng, s) => maybeTypo(rng, `${s.base} ${s.brand} ${s.qty}`.trim()),
  },
];

const upper = (s) => s.replace(/\s+/g, ' ').trim().toUpperCase();

function abbreviate(s) {
  return s
    .replace(/СРЕДСТВО/g, 'СР-ВО')
    .replace(/РАСТВОРИМЫЙ/g, 'РАСТВ')
    .replace(/НАТУРАЛЬНЫЙ/g, 'НАТ')
    .replace(/МОЛОЧНЫЙ/g, 'МОЛОЧ')
    .replace(/МУЛЬТИФРУКТ/g, 'МУЛЬТИФР');
}

function maybeTypo(rng, s) {
  if (!chance(rng, 0.3)) return s;
  const i = Math.floor(rng() * s.length);
  if (s[i] === ' ') return s;
  // пропуск буквы — самая частая опечатка при ручном вводе
  return s.slice(0, i) + s.slice(i + 1);
}

/**
 * Дрейф наименования между накладными.
 *
 * Критично для честности стенда. Один и тот же товар поставщик от раза к
 * разу пишет чуть иначе: то «170ГР», то «170 гр», то допишет «УП» в конец.
 * Без дрейфа таблица соответствий срабатывает по дословному совпадению
 * всегда и показывает недостижимые в жизни цифры — стенд начинает врать
 * в плюс, а вместе с ним и обещания заказчику.
 */
function drift(rng, s) {
  let out = s;

  // фасовка: слитно / через пробел / другой регистр единицы
  if (chance(rng, 0.35)) {
    out = out.replace(/(\d)\s*(ГР|МЛ|Л|КГ|Г)\b/gi, (_m, d, u) =>
      chance(rng, 0.5) ? `${d} ${u}` : `${d}${u.toLowerCase()}`);
  }

  // хвостовой мусор, который поставщик то ставит, то нет
  if (chance(rng, 0.22)) {
    out += ' ' + pick(rng, ['УП', 'ШТ', '/ПАК', 'КОР', '']);
  }

  // разделители внутри строки
  if (chance(rng, 0.15)) out = out.replace(/\//g, ' ');
  if (chance(rng, 0.12)) out = out.replace(/\s{2,}/g, ' ').replace(/ - /g, '-');

  return out.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/*  Сборка документов                                                  */
/* ------------------------------------------------------------------ */

let rowCounter = 0;

function buildRow(rng, seed, supplier) {
  rowCounter += 1;
  const supplierName = drift(rng, supplier.style(rng, seed));
  const qty = 1 + Math.floor(rng() * 9);
  const price = Math.round((100 + rng() * 9000) * 100) / 100;

  return {
    n: rowCounter,
    /** Как товар назвал поставщик — это вход матчера. */
    supplierName,
    /** Дублируем БИН в строку: матчер работает построчно, а привычки
     *  наименования у каждого поставщика свои. */
    supplierBin: supplier.bin,
    /** «Признак происхождения» — на записи встречались значения 2 и 4. */
    origin: chance(rng, 0.7) ? 2 : 4,
    unitCode: '796',
    unit: 'шт',
    qty,
    priceNoTax: price,
    amountNoTax: Math.round(qty * price * 100) / 100,
    vatRate: 12,
    /** --- эталон, матчеру не показываем --- */
    truth: {
      catalogId: seed.truth,
      difficulty: seed.difficulty,
    },
  };
}

/**
 * Генерирует пачку документов. Состав подобран так, чтобы повторить
 * пропорции с записи: длинные продуктовые накладные и отдельный документ
 * с размерной сеткой.
 */
export function generateDocuments({ seed = 20260819, count = 6 } = {}) {
  const rng = makeRng(seed);
  rowCounter = 0;
  const docs = [];

  for (let d = 0; d < count; d += 1) {
    const supplier = pick(rng, SUPPLIERS);
    const isApparel = d === count - 1; // последний документ — мерч

    const seeds = isApparel
      ? apparelSeeds()
      : shuffle(rng, SEEDS).slice(0, 12 + Math.floor(rng() * 12));

    docs.push({
      regNumber: `ESF-${supplier.bin}-2026081${d}-${5170000 + d * 137}`,
      number: String(2682 + d * 17).padStart(8, '0'),
      date: `1${d % 9}.08.2026`,
      supplier: { bin: supplier.bin, name: supplier.name },
      currency: 'KZT',
      rows: seeds.map((s) => buildRow(rng, s, supplier)),
    });
  }

  return docs;
}

function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Убирает эталон — то, что реально увидит матчер. */
export function stripTruth(docs) {
  return docs.map((doc) => ({
    ...doc,
    rows: doc.rows.map(({ truth, ...row }) => row),
  }));
}

/* ------------------------------------------------------------------ */

if (process.argv[1]?.endsWith('generator.js')) {
  const docs = generateDocuments();
  const rows = docs.flatMap((d) => d.rows);
  console.log(`Документов: ${docs.length}, строк: ${rows.length}\n`);
  const byDifficulty = {};
  for (const r of rows) {
    byDifficulty[r.truth.difficulty] = (byDifficulty[r.truth.difficulty] ?? 0) + 1;
  }
  console.table(byDifficulty);
  console.log('\nПримеры строк:');
  for (const r of rows.slice(0, 12)) {
    console.log(`  ${r.supplierName.padEnd(62)} → ${r.truth.catalogId ?? '—'} [${r.truth.difficulty}]`);
  }
}
