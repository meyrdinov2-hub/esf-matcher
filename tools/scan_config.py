"""
Разбор выгрузки конфигурации 1С в XML.

Конфигуратор выгружает каждый объект метаданных отдельным .xml. Ходить по
ним глазами долго, поэтому скрипт отвечает на три вопроса, которые нужны
для нашей задачи:

  1. какие документы имеют табличную часть со ссылкой на номенклатуру
     (это кандидаты, к форме которых мы прицепим подбор);
  2. как называются реквизиты этих табличных частей;
  3. есть ли в конфигурации уже готовый регистр соответствий номенклатуры
     поставщиков — вдруг велосипед изобретать не нужно.

Использование:
    python scan_config.py D:\\1C\\xml
    python scan_config.py D:\\1C\\xml --grep ЭСФ
"""

import argparse
import os
import re
import sys
from collections import defaultdict
from xml.etree import ElementTree as ET

NS = {"md": "http://v8.1c.ru/8.3/MDClasses"}

# Признак «это ссылка на позицию номенклатуры».
#
# Проверяем именно ТИП, а не имя реквизита. Имена обманывают: реквизит
# «Сделка» имеет тип DocumentRef.ПоступлениеТоваровУслуг, и поиск по слову
# «Товар» вытаскивает половину конфигурации. Тип же однозначен.
NOMENCLATURE_TYPES = (
    "CatalogRef.Номенклатура",
    "CatalogRef.НоменклатураПоставщиков",
    "CatalogRef.НоменклатураКонтрагентов",
)


def local(tag):
    """Имя тега без пространства имён."""
    return tag.rsplit("}", 1)[-1]


def text_of(el):
    return (el.text or "").strip() if el is not None else ""


def object_name(root):
    """Имя объекта метаданных из его корневого XML."""
    for props in root.iter():
        if local(props.tag) == "Properties":
            for child in props:
                if local(child.tag) == "Name":
                    return text_of(child)
    return None


def collect_attributes(root):
    """
    Возвращает {имя_табличной_части: [(реквизит, тип), ...]} и список
    реквизитов самого объекта.
    """
    tabular = defaultdict(list)
    own = []

    for el in root.iter():
        tag = local(el.tag)

        if tag == "TabularSection":
            ts_name = None
            for p in el:
                if local(p.tag) == "Properties":
                    for c in p:
                        if local(c.tag) == "Name":
                            ts_name = text_of(c)
            if not ts_name:
                continue
            for attr in el.iter():
                if local(attr.tag) != "Attribute":
                    continue
                a_name, a_type = None, []
                for p in attr:
                    if local(p.tag) == "Properties":
                        for c in p:
                            if local(c.tag) == "Name":
                                a_name = text_of(c)
                            if local(c.tag) == "Type":
                                for t in c.iter():
                                    if local(t.tag) == "TypeId" or local(t.tag) == "Type":
                                        v = text_of(t)
                                        if v:
                                            a_type.append(v)
                if a_name:
                    tabular[ts_name].append((a_name, ",".join(a_type)))

        elif tag == "Attribute":
            # реквизиты самого объекта (не внутри табличной части)
            pass

    return tabular, own


def looks_like_nomenclature(attr_name, attr_type):
    # Ссылка на номенклатуру должна быть единственным типом реквизита.
    # Составные типы (десяток DocumentRef через запятую) — это «Сделка»,
    # «Документ расчётов» и прочие связи, а не позиция товара.
    if attr_type.count(",") > 0:
        return False
    return any(t in attr_type for t in NOMENCLATURE_TYPES)


def scan(root_dir, grep=None):
    docs_dir = os.path.join(root_dir, "Documents")
    regs_dir = os.path.join(root_dir, "InformationRegisters")

    print(f"Выгрузка: {root_dir}")
    for name, path in (("Документов", docs_dir), ("Регистров сведений", regs_dir)):
        n = len([f for f in os.listdir(path) if f.endswith(".xml")]) if os.path.isdir(path) else 0
        print(f"  {name}: {n}")
    print()

    # --- документы с номенклатурой в табличной части ---
    hits = []
    if os.path.isdir(docs_dir):
        for fname in sorted(os.listdir(docs_dir)):
            if not fname.endswith(".xml"):
                continue
            if grep and grep.lower() not in fname.lower():
                continue
            path = os.path.join(docs_dir, fname)
            try:
                root = ET.parse(path).getroot()
            except ET.ParseError:
                continue
            doc_name = object_name(root) or fname[:-4]
            tabular, _ = collect_attributes(root)
            for ts_name, attrs in tabular.items():
                nom = [a for a in attrs if looks_like_nomenclature(*a)]
                if nom:
                    hits.append((doc_name, ts_name, len(attrs), nom))

    print(f"=== Документы с номенклатурой в табличной части: {len(hits)} ===\n")
    for doc, ts, total, nom in hits[:40]:
        print(f"{doc}")
        print(f"   табличная часть «{ts}» — реквизитов: {total}")
        for a_name, a_type in nom[:5]:
            print(f"      · {a_name}  [{a_type or 'тип не разобран'}]")
        print()
    if len(hits) > 40:
        print(f"… ещё {len(hits) - 40}\n")

    # --- регистры, похожие на таблицу соответствий ---
    print("=== Регистры сведений со словом «номенклатур» в имени ===")
    found_regs = []
    if os.path.isdir(regs_dir):
        for fname in sorted(os.listdir(regs_dir)):
            if fname.endswith(".xml") and "номенклатур" in fname.lower():
                found_regs.append(fname[:-4])
    for r in found_regs:
        print(f"   · {r}")
    if not found_regs:
        print("   не найдено")
    print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xml_dir", help="каталог выгрузки DumpConfigToFiles")
    ap.add_argument("--grep", help="фильтр по имени файла документа")
    args = ap.parse_args()

    if not os.path.isdir(args.xml_dir):
        sys.exit(f"нет каталога: {args.xml_dir}")
    scan(args.xml_dir, args.grep)


if __name__ == "__main__":
    main()
