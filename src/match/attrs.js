/**
 * Разбор атрибутов: размер и цвет.
 *
 * Зачем отдельно. «Поло … (белый XS)» и «Поло … (белый XXL)» различаются
 * двумя символами из шестидесяти — по текстовой близости они почти
 * неотличимы, и любой нечёткий матчер рано или поздно подставит не тот
 * размер. Причём подставит уверенно, то есть молча.
 *
 * Поэтому размер и цвет вынуты из текста и работают как жёсткий фильтр:
 * если у товара и у позиции справочника размеры заданы и не совпали —
 * кандидат выбывает, какой бы похожей ни была остальная строка.
 */

import { splitScripts } from '../normalize.js';

const SIZES = ['XXXL', 'XXL', 'XL', 'XS', 'S', 'M', 'L'];

/** Цвета и их формы: поставщик пишет «БЕЛЫЙ», справочник — «белый». */
const COLORS = new Map([
  ['белый', 'белый'], ['белая', 'белый'], ['бел', 'белый'], ['white', 'белый'],
  ['черный', 'черный'], ['черная', 'черный'], ['чер', 'черный'], ['black', 'черный'],
  ['красный', 'красный'], ['красная', 'красный'], ['red', 'красный'],
  ['синий', 'синий'], ['синяя', 'синий'], ['blue', 'синий'],
  ['зеленый', 'зеленый'], ['green', 'зеленый'],
  ['серый', 'серый'], ['grey', 'серый'], ['gray', 'серый'],
]);

/**
 * Размер ищем только как отдельный токен: иначе «S» найдётся внутри любого
 * латинского бренда, а «М» — в русском слове.
 */
export function extractSize(text) {
  const tokens = splitScripts(String(text)).toUpperCase().split(/[^A-ZА-Я0-9]+/).filter(Boolean);
  for (const size of SIZES) {
    if (tokens.includes(size)) return size;
  }
  // Кириллические омоглифы: бухгалтер может набрать русскую «М» вместо латинской.
  const cyr = { 'ХС': 'XS', 'С': 'S', 'М': 'M', 'Л': 'L', 'ХЛ': 'XL' };
  for (const [k, v] of Object.entries(cyr)) {
    if (tokens.includes(k)) return v;
  }
  return null;
}

export function extractColor(text) {
  const tokens = splitScripts(String(text)).toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);
  for (const t of tokens) {
    const c = COLORS.get(t);
    if (c) return c;
  }
  return null;
}

export function extractAttrs(text) {
  return { size: extractSize(text), color: extractColor(text) };
}

/**
 * Жёсткая проверка совместимости.
 *
 * Правило асимметрично намеренно: если атрибут задан у обеих сторон, он
 * обязан совпасть; если хотя бы у одной он отсутствует — не мешаем, пусть
 * решает текстовая близость. Так фильтр отсекает подмену размера, но не
 * ломает сопоставление обычных товаров, где размеров нет вовсе.
 *
 * @returns {boolean} false — кандидата надо выбросить
 */
export function attrsCompatible(a, b) {
  if (a.size && b.size && a.size !== b.size) return false;
  if (a.color && b.color && a.color !== b.color) return false;
  return true;
}

/** Есть ли вообще что проверять — влияет на уверенность. */
export function hasAttrs(a) {
  return Boolean(a.size || a.color);
}
