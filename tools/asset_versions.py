"""Проставляет метки версий к скриптам и стилям сайта: src="cart.js?v=1a2b3c4d".

Хостинг разрешает браузерам хранить .js и .css 45 дней, поэтому без метки посетители
после обновления сайта продолжают работать со старыми скриптами. Метка — начало md5
содержимого файла: меняется только у изменённых файлов.

Запускать из корня сайта перед каждой выкладкой:  python tools/asset_versions.py
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = re.compile(r'(?P<attr>src|href)="(?P<file>[a-z0-9_-]+\.(?:js|css))(?:\?v=[0-9a-f]*)?"')


def version(name, cache={}):
    if name not in cache:
        path = ROOT / name
        cache[name] = hashlib.md5(path.read_bytes()).hexdigest()[:8] if path.is_file() else None
    return cache[name]


def stamp(match):
    v = version(match["file"])
    if v is None:
        return match[0]
    return f'{match["attr"]}="{match["file"]}?v={v}"'


changed = 0
for page in sorted(ROOT.glob("*.html")):
    text = page.read_text(encoding="utf-8")
    new = REF.sub(stamp, text)
    if new != text:
        page.write_text(new, encoding="utf-8")
        changed += 1
print(f"метки версий обновлены в {changed} страницах")
