"""Пересобирает карточки товаров в catalog.html из products.json.

Меняет только содержимое сетки #cat-grid и словарь разделов window.GIREX_GROUPS;
остальная разметка страницы остаётся как есть. После сборки запустите
tools/asset_versions.py, если меняли скрипты или стили.

Запуск из корня сайта:  python tools/build_catalog.py
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
E = lambda s: html.escape(str(s), quote=True)

GROUP_LABELS = {"shar": "Шаровые краны", "zadv": "Задвижки и клапаны фланцевые",
                "rezb": "Задвижки и клапаны резьбовые", "kov": "Кованая арматура",
                "filtr": "Фильтры", "flanec": "Фланцы", "fiting": "Фитинги"}

# скрытые синонимы для поиска по каталогу: посетители ищут и по старым терминам
SEARCH_SYNONYMS = {"shar": "шаровой клапан шаровые клапаны"}

CART_ICON = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 4h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.6-1.2L21 8H6.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
             '<circle cx="10" cy="20" r="1.3" fill="currentColor"/><circle cx="17.5" cy="20" r="1.3" fill="currentColor"/></svg>')

DEMO = '<span class="demo-mark" title="Выдуманные данные для демонстрации">демо</span>'


def spec_rows(p):
    a = p["attr"]
    demo = set(p.get("demo", []))
    rows = []
    if a["dn"]:
        rows.append(("Диаметр", f"DN{a['dn'][0]} – DN{a['dn'][-1]}" if len(a["dn"]) > 1 else f"DN{a['dn'][0]}", "dn" in demo))
    if a["pn"]:
        rows.append(("Давление", "PN" + "/".join(str(x) for x in a["pn"]), "press" in demo))
    elif a["cls"]:
        rows.append(("Класс давления", "/".join(str(x) for x in a["cls"]) + " Lb", "press" in demo))
    if a["conn"]:
        rows.append(("Присоединение", a["conn"], False))
    if p.get("temp"):
        rows.append(("Температура", p["temp"], "temp" in demo))
    if a["mat"]:
        rows.append(("Материал корпуса", ", ".join(a["mat"]), "mat" in demo))
    if not rows and p["models"]:
        rows.append(("Модели", ", ".join(p["models"][:3]), False))
    return rows[:5]


def card(p, labels=GROUP_LABELS, synonyms=SEARCH_SYNONYMS):
    url = f"product.html?id={E(p['id'])}"
    a = p["attr"]
    badge = p["models"][0] if p["models"] else labels[p["group"]]
    rows = "".join(
        '<div style="display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid #F0EEEA; font-size: 13px">'
        f'<span style="color: #8A8F98; flex-shrink: 0">{E(k)}</span><span style="font-weight: 600; text-align: right">{E(v)}{DEMO if d else ""}</span></div>'
        for k, v, d in spec_rows(p))
    photo = (p.get("photos") or [None])[0]
    if photo:
        img = (f'<a href="{url}" style="height: 230px; background: #FDFDFD; display: flex; align-items: center; justify-content: center">'
               f'<img src="{E(photo)}" alt="{E(p["name"])}" width="800" height="600" loading="lazy" style="width: 100%; height: 100%; object-fit: contain"></a>')
    elif p["img"]:
        img = (f'<a href="{url}" style="height: 230px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; padding: 18px">'
               f'<img src="{E(p["img"])}" alt="{E(p["name"])}" loading="lazy" style="max-width: 100%; max-height: 100%; object-fit: contain"></a>')
    else:
        img = '<div style="height: 230px; background: #FAFAF9; display: flex; align-items: center; justify-content: center; color: #C3C7CD; font-size: 13px">нет изображения</div>'
    attr = json.dumps({k: a[k] for k in ("dn", "pn", "cls", "conn", "drive", "mat", "bore")}, ensure_ascii=False)
    search = " ".join([p["name"]] + p["models"] + [labels[p["group"]]] + ([synonyms[p["group"]]] if p["group"] in synonyms else [])).lower()
    model = E(p['models'][0]) if p['models'] else ''
    return f'''<article class="cat-card" data-group="{p['group']}" data-attr='{E(attr)}' data-search="{E(search)}" style="display: flex; flex-direction: column; background: #FFFFFF; border: 1px solid #EAE8E4; border-radius: 16px; overflow: hidden">
{img}
<div style="display: flex; flex-direction: column; gap: 10px; padding: 20px 22px 22px; flex-grow: 1">
<div style="display: flex"><span style="background: var(--accent-soft); color: var(--accent); border-radius: 6px; padding: 3px 10px; font-size: 12px; font-weight: 700">{E(badge)}</span></div>
<h3 style="margin: 0"><a href="{url}" class="card-title" style="font-size: 15.5px; font-weight: 700; line-height: 1.35; min-height: 42px; display: block">{E(p["name"])}</a></h3>
<div style="display: flex; flex-direction: column">{rows}</div>
<div style="margin-top: auto; padding-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px"><a href="{url}" class="btn-primary" style="height: 44px; font-size: 14px; width: 100%">О товаре</a><button type="button" class="btn-doc" style="height: 44px" data-add-to-cart data-id="{E(p['id'])}" data-name="{E(p['name'])}" data-model="{model}">{CART_ICON}В корзину</button></div>
</div>
</article>'''


def build(page, products, labels=GROUP_LABELS, synonyms=SEARCH_SYNONYMS):
    first = page.index('<article class="cat-card"')
    last = page.rindex('</article>') + len('</article>')
    cards = "\n".join(card(p, labels, synonyms) for p in products)
    page = page[:first] + cards + page[last:]
    groups = '<script>window.GIREX_GROUPS = ' + json.dumps(labels, ensure_ascii=False) + ';</script>'
    return re.sub(r'<script>window\.GIREX_GROUPS = .*?;</script>', lambda m: groups, page, count=1)


if __name__ == "__main__":
    path = ROOT / "catalog.html"
    products = json.loads((ROOT / "products.json").read_text(encoding="utf-8"))
    path.write_text(build(path.read_text(encoding="utf-8"), products), encoding="utf-8")
    print(f"каталог пересобран: {len(products)} позиций")
