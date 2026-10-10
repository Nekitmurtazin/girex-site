/* Фильтры каталога GIREX по ТЗ «Логика фильтров каталога».
   Серия попадает в выдачу, если хотя бы одно её активное исполнение (SKU)
   удовлетворяет всем выбранным условиям. OR внутри группы, AND между группами. */
(function () {
  var grid = document.getElementById('cat-grid');
  if (!grid) return;

  var GROUP_LABELS = window.GIREX_GROUPS || {};
  var DEMO = '<span class="demo-mark" title="Выдуманные данные для демонстрации">демо</span>';

  /* level: 'sku' — значение берётся из исполнения, 'series' — из серии */
  var GROUPS = [
    { key: 'stock', title: 'Наличие', level: 'sku', get: function (s) { return [s.st === 'in' ? 'В наличии' : 'Под заказ']; }, demo: true },
    { key: 'conn',  title: 'Тип присоединения', level: 'series', get: function (i) { return i.conn ? [i.conn] : []; } },
    { key: 'dn',    title: 'Номинальный диаметр DN', level: 'sku', get: function (s) { return [s.dn]; }, label: function (v) { return 'DN' + v; }, numeric: true, searchable: true, limit: 10 },
    { key: 'pn',    title: 'Номинальное давление PN', level: 'sku', get: function (s) { return s.pn ? [s.pn] : []; }, label: function (v) { return 'PN' + v; }, numeric: true },
    { key: 'cls',   title: 'Класс давления', level: 'sku', get: function (s) { return s.cls ? [s.cls] : []; }, label: function (v) { return 'Class ' + v; }, numeric: true },
    { key: 'drive', title: 'Тип управления', level: 'sku', get: function (s) { return s.drive ? [s.drive] : []; } },
    { key: 'mat',   title: 'Материал корпуса', level: 'sku', get: function (s) { return s.mat ? [s.mat] : []; } },
    { key: 'bore',  title: 'Проход', level: 'series', get: function (i) { return i.bore ? [i.bore] : []; } },
    { key: 'media', title: 'Рабочая среда', level: 'series', get: function (i) { return i.media || []; }, demo: true },
    { key: 'temp',  title: 'Рабочая температура', level: 'series', numeric: true,
      get: function (i) { return [80, 120, 180, 250, 400].filter(function (t) { return i.tmax >= t; }); },
      label: function (v) { return 'выдерживает +' + v + ' °C'; } },
    { key: 'group', title: 'Раздел', level: 'series', get: function (i) { return [i.group]; }, label: function (v) { return GROUP_LABELS[v] || v; } }
  ];
  var QUICK = ['dn', 'pn', 'conn', 'drive', 'mat', 'media'];
  var BYKEY = {};
  GROUPS.forEach(function (g) { BYKEY[g.key] = g; });

  var items = [];
  var state = { q: '', sort: 'default', per: 24, page: 1, sel: {} };
  GROUPS.forEach(function (g) { state.sel[g.key] = []; });

  var panel = document.getElementById('filters-body');
  var quickBar = document.getElementById('quick-body');

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  /* ——— данные ——— */
  fetch('products.json').then(function (r) { return r.json(); }).then(function (list) {
    var byId = {};
    list.forEach(function (p) { byId[p.id] = p; });
    [].forEach.call(grid.querySelectorAll('.cat-card'), function (card) {
      var btn = card.querySelector('[data-add-to-cart]');
      var p = btn && byId[btn.dataset.id];
      if (!p) return;
      var a = p.attr || {};
      var active = (p.skus || []).filter(function (s) { return s.st !== 'discontinued'; });
      items.push({
        el: card, id: p.id, group: p.group, search: card.getAttribute('data-search'),
        conn: a.conn, bore: a.bore, media: a.media || [], tmax: a.tmax == null ? -999 : a.tmax,
        skus: active, dnMin: active.length ? Math.min.apply(null, active.map(function (s) { return s.dn; })) : 9999,
        dnMax: active.length ? Math.max.apply(null, active.map(function (s) { return s.dn; })) : 0
      });
      decorate(card, p, active);
    });
    buildPanel();
    buildQuick();
    readUrl();
    render();
  });

  /* бейдж наличия и число исполнений в карточке */
  function decorate(card, p, active) {
    var head = card.querySelector('.cat-card > div > div');
    if (!head || card.querySelector('.stock')) return;
    var inStock = active.filter(function (s) { return s.st === 'in'; });
    var badge = el('span', 'stock ' + (inStock.length ? 'in' : active.length ? 'order' : 'off'));
    if (inStock.length) badge.textContent = 'В наличии: ' + inStock.length + ' исп.';
    else if (active.length) badge.textContent = 'Под заказ от ' + Math.min.apply(null, active.map(function (s) { return s.lead || 99; })) + ' дн.';
    else badge.textContent = 'Нет активных исполнений';
    head.style.display = 'flex';
    head.style.flexWrap = 'wrap';
    head.style.gap = '6px';
    head.style.alignItems = 'center';
    head.appendChild(badge);
    head.insertAdjacentHTML('beforeend', DEMO);
  }

  /* ——— логика совпадений ——— */
  function seriesOk(item, skipKey) {
    if (state.q && item.search.indexOf(state.q) < 0) return false;
    for (var k = 0; k < GROUPS.length; k++) {
      var g = GROUPS[k];
      if (g.level !== 'series' || g.key === skipKey || !state.sel[g.key].length) continue;
      var vals = g.get(item);
      if (!state.sel[g.key].some(function (v) { return vals.indexOf(v) >= 0; })) return false;
    }
    return true;
  }

  function skuOk(sku, skipKey, extra) {
    for (var k = 0; k < GROUPS.length; k++) {
      var g = GROUPS[k];
      if (g.level !== 'sku') continue;
      var sel = g.key === skipKey ? (extra || []) : state.sel[g.key];
      if (!sel.length) continue;
      var vals = g.get(sku);
      if (!sel.some(function (v) { return vals.indexOf(v) >= 0; })) return false;
    }
    return true;
  }

  function matches(item, skipKey, extra) {
    var g = skipKey ? BYKEY[skipKey] : null;
    if (g && g.level === 'series') {
      if (!seriesOk(item, skipKey)) return false;
      var vals = g.get(item);
      if (extra && extra.length && !extra.some(function (v) { return vals.indexOf(v) >= 0; })) return false;
      return item.skus.some(function (s) { return skuOk(s); });
    }
    if (!seriesOk(item)) return false;
    return item.skus.some(function (s) { return skuOk(s, skipKey, extra); });
  }

  function countFor(g, value) {
    var sel = state.sel[g.key];
    var trial = sel.indexOf(value) >= 0 ? sel : sel.concat([value]);
    var n = 0;
    items.forEach(function (i) { if (matches(i, g.key, trial)) n++; });
    return n;
  }

  function allValues(g) {
    var set = [];
    items.forEach(function (i) {
      var src = g.level === 'sku' ? i.skus : [i];
      src.forEach(function (s) {
        g.get(s).forEach(function (v) { if (set.indexOf(v) < 0) set.push(v); });
      });
    });
    return g.numeric ? set.sort(function (a, b) { return a - b; })
                     : set.sort(function (a, b) { return String(a).localeCompare(String(b), 'ru'); });
  }

  /* ——— панель ——— */
  function buildPanel() {
    panel.textContent = '';
    GROUPS.forEach(function (g) {
      var values = allValues(g);
      if (!values.length) return;
      var box = el('div', 'f-group');
      var head = el('button', 'f-head');
      head.type = 'button';
      head.innerHTML = '<span>' + g.title + (g.demo ? DEMO : '') + '</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.addEventListener('click', function () { box.classList.toggle('collapsed'); });
      var body = el('div', 'f-items');

      if (g.searchable) {
        var fs = el('input', 'f-search');
        fs.type = 'search';
        fs.placeholder = 'Поиск по DN';
        fs.addEventListener('input', function () {
          var q = fs.value.trim().toLowerCase();
          box.classList.toggle('expanded', !!q);
          [].forEach.call(body.querySelectorAll('.chip-f'), function (lb) {
            lb.style.display = lb.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
          });
        });
        body.appendChild(fs);
      }

      values.forEach(function (v, idx) {
        var lab = el('label', 'chip-f');
        if (g.limit && idx >= g.limit) lab.classList.add('extra');
        var inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.dataset.group = g.key;
        inp.dataset.value = String(v);
        inp.addEventListener('change', function () { toggle(g.key, v, inp.checked); });
        var txt = el('span', 'chip-label');
        txt.textContent = g.label ? g.label(v) : v;
        lab.append(inp, txt, el('span', 'chip-count'));
        body.appendChild(lab);
      });

      if (g.limit && values.length > g.limit) {
        var more = el('button', 'f-more');
        more.type = 'button';
        more.textContent = 'Показать ещё ' + (values.length - g.limit);
        more.addEventListener('click', function () { box.classList.add('expanded'); more.remove(); });
        body.appendChild(more);
      }
      box.append(head, body);
      panel.appendChild(box);
    });
  }

  function buildQuick() {
    quickBar.textContent = '';
    QUICK.forEach(function (key) {
      var g = BYKEY[key];
      var values = allValues(g);
      if (!values.length) return;
      var wrap = el('label', 'q-field');
      var cap = el('span', 'q-cap');
      cap.textContent = { dn: 'Диаметр DN', pn: 'Давление PN', conn: 'Присоединение', drive: 'Управление', mat: 'Материал', media: 'Среда' }[key];
      var sel = document.createElement('select');
      sel.dataset.group = key;
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = 'любой';
      sel.appendChild(o0);
      values.forEach(function (v) {
        var o = document.createElement('option');
        o.value = String(v);
        o.textContent = g.label ? g.label(v) : v;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        state.sel[key] = sel.value ? [g.numeric ? +sel.value : sel.value] : [];
        state.page = 1;
        render();
      });
      wrap.append(cap, sel);
      quickBar.appendChild(wrap);
    });
  }

  function toggle(key, value, on) {
    var arr = state.sel[key];
    var i = arr.indexOf(value);
    if (on && i < 0) arr.push(value);
    if (!on && i >= 0) arr.splice(i, 1);
    state.page = 1;
    render();
  }

  /* ——— отрисовка ——— */
  function render() {
    var visible = items.filter(function (i) { return matches(i); });

    GROUPS.forEach(function (g) {
      [].forEach.call(panel.querySelectorAll('input[data-group="' + g.key + '"]'), function (inp) {
        var value = g.numeric ? +inp.dataset.value : inp.dataset.value;
        var n = countFor(g, value);
        var lab = inp.closest('.chip-f');
        lab.querySelector('.chip-count').textContent = n;
        var on = state.sel[g.key].indexOf(value) >= 0;
        inp.checked = on;
        inp.disabled = n === 0 && !on;
        lab.classList.toggle('disabled', inp.disabled);
      });
      var q = quickBar.querySelector('select[data-group="' + g.key + '"]');
      if (q) {
        var cur = state.sel[g.key];
        q.value = cur.length === 1 ? String(cur[0]) : '';
        [].forEach.call(q.options, function (o) {
          if (!o.value) return;
          var value = g.numeric ? +o.value : o.value;
          var n = countFor(g, value);
          o.disabled = n === 0 && cur.indexOf(value) < 0;
          o.textContent = (g.label ? g.label(value) : value) + ' (' + n + ')';
        });
      }
    });

    var sorted = visible.slice();
    if (state.sort === 'dn-asc') sorted.sort(function (a, b) { return a.dnMin - b.dnMin; });
    else if (state.sort === 'dn-desc') sorted.sort(function (a, b) { return b.dnMax - a.dnMax; });
    else if (state.sort === 'name') sorted.sort(function (a, b) { return a.search.localeCompare(b.search, 'ru'); });
    else if (state.sort === 'stock') sorted.sort(function (a, b) {
      return b.skus.filter(function (s) { return s.st === 'in'; }).length - a.skus.filter(function (s) { return s.st === 'in'; }).length;
    });

    var pages = Math.max(1, Math.ceil(sorted.length / state.per));
    if (state.page > pages) state.page = pages;
    var from = (state.page - 1) * state.per;
    var pageItems = sorted.slice(from, from + state.per);
    items.forEach(function (i) { i.el.classList.add('hidden'); });
    pageItems.forEach(function (i) {
      i.el.classList.remove('hidden');
      grid.appendChild(i.el);
      carryFilters(i);
    });

    var word = plural(visible.length, 'товар', 'товара', 'товаров');
    document.getElementById('cat-found').textContent = 'Найдено: ' + visible.length + ' ' + word;
    document.getElementById('cat-empty').style.display = visible.length ? 'none' : 'block';
    renderChips();
    renderHeading();
    renderPager(pages);
    syncUrl();
    var ma = document.getElementById('mobile-apply');
    if (ma) ma.textContent = 'Показать ' + visible.length + ' ' + word;
    var ft = document.getElementById('filters-toggle-count');
    var active = GROUPS.reduce(function (n, g) { return n + state.sel[g.key].length; }, 0) + (state.q ? 1 : 0);
    if (ft) ft.textContent = active ? ' (' + active + ')' : '';
  }

  /* переход в карточку с выбранными DN/PN, если они однозначны */
  function carryFilters(item) {
    var extra = [];
    if (state.sel.dn.length === 1) extra.push('dn=DN' + state.sel.dn[0]);
    if (state.sel.pn.length === 1) extra.push('pn=PN' + state.sel.pn[0]);
    [].forEach.call(item.el.querySelectorAll('a[href^="product.html"]'), function (a) {
      a.href = 'product.html?id=' + encodeURIComponent(item.id) + (extra.length ? '&' + extra.join('&') : '');
    });
  }

  function plural(n, a, b, c) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
    return c;
  }

  function renderChips() {
    var box = document.getElementById('active-chips');
    box.textContent = '';
    GROUPS.forEach(function (g) {
      state.sel[g.key].forEach(function (v) {
        var chip = el('button', 'a-chip');
        chip.type = 'button';
        chip.innerHTML = '<span></span><span class="x">×</span>';
        chip.firstChild.textContent = g.label ? g.label(v) : v;
        chip.addEventListener('click', function () { toggle(g.key, v, false); });
        box.appendChild(chip);
      });
    });
    if (state.q) {
      var qc = el('button', 'a-chip');
      qc.type = 'button';
      qc.innerHTML = '<span></span><span class="x">×</span>';
      qc.firstChild.textContent = '«' + state.q + '»';
      qc.addEventListener('click', function () {
        state.q = '';
        document.getElementById('cat-search').value = '';
        render();
      });
      box.appendChild(qc);
    }
    box.style.display = box.children.length ? 'flex' : 'none';
    document.getElementById('reset-all-top').style.display = box.children.length ? 'inline' : 'none';
  }

  /* при одном выбранном разделе заголовок страницы — название раздела */
  var h1 = document.getElementById('cat-h1');
  var baseH1 = h1 ? h1.textContent : '';
  var baseTitle = document.title;
  var sub = document.getElementById('cat-sub');
  var baseSub = sub ? sub.textContent : '';
  function renderHeading() {
    var one = state.sel.group.length === 1 ? GROUP_LABELS[state.sel.group[0]] : '';
    if (h1) h1.textContent = one || baseH1;
    document.title = one ? one + ' — каталог GIREX' : baseTitle;
    if (!sub) return;
    if (!one) { sub.textContent = baseSub; return; }
    var n = items.filter(function (i) { return i.group === state.sel.group[0]; }).length;
    sub.textContent = n + ' ' + plural(n, 'позиция', 'позиции', 'позиций') + ' в разделе.';
  }

  function renderPager(pages) {
    var pager = document.getElementById('cat-pager');
    pager.textContent = '';
    if (pages < 2) return;
    for (var p = 1; p <= pages; p++) {
      (function (p) {
        var b = el('button', 'pg' + (p === state.page ? ' current' : ''));
        b.type = 'button';
        b.textContent = p;
        b.addEventListener('click', function () {
          state.page = p;
          render();
          document.querySelector('.cat-top').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        pager.appendChild(b);
      })(p);
    }
  }

  /* ——— URL ——— */
  var restoring = false;
  function syncUrl() {
    if (restoring) return;
    var params = new URLSearchParams();
    GROUPS.forEach(function (g) { if (state.sel[g.key].length) params.set(g.key, state.sel[g.key].join(',')); });
    if (state.q) params.set('q', state.q);
    if (state.sort !== 'default') params.set('sort', state.sort);
    if (state.per !== 24) params.set('per', state.per);
    if (state.page > 1) params.set('page', state.page);
    var url = location.pathname + (params.toString() ? '?' + params.toString() : '');
    if (url !== location.pathname + location.search) history.pushState(null, '', url);
  }

  function readUrl() {
    restoring = true;
    var params = new URLSearchParams(location.search);
    GROUPS.forEach(function (g) {
      var raw = params.get(g.key);
      state.sel[g.key] = raw ? raw.split(',').map(function (v) { return g.numeric ? +v : v; }) : [];
    });
    /* старые ссылки вида catalog.html#g-shar */
    var legacy = /^#g-(\w+)$/.exec(location.hash);
    if (legacy && !state.sel.group.length && GROUP_LABELS[legacy[1]]) {
      state.sel.group = [legacy[1]];
      history.replaceState(null, '', location.pathname + location.search);
    }
    state.q = (params.get('q') || '').toLowerCase();
    state.sort = params.get('sort') || 'default';
    state.per = +(params.get('per') || 24);
    state.page = +(params.get('page') || 1);
    document.getElementById('cat-search').value = params.get('q') || '';
    document.getElementById('cat-sort').value = state.sort;
    document.getElementById('cat-per').value = String(state.per);
    restoring = false;
  }
  window.addEventListener('popstate', function () { readUrl(); render(); });

  /* ——— события ——— */
  var t;
  document.getElementById('cat-search').addEventListener('input', function (e) {
    clearTimeout(t);
    var v = e.target.value.trim().toLowerCase();
    t = setTimeout(function () { state.q = v; state.page = 1; render(); }, 180);
  });
  document.getElementById('cat-sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('cat-per').addEventListener('change', function (e) { state.per = +e.target.value; state.page = 1; render(); });
  function resetAll() {
    GROUPS.forEach(function (g) { state.sel[g.key] = []; });
    state.q = '';
    state.page = 1;
    document.getElementById('cat-search').value = '';
    render();
  }
  ['reset-all', 'reset-all-top', 'mobile-reset'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', resetAll);
  });
  document.getElementById('filters-toggle').addEventListener('click', function () {
    document.querySelector('.filters').classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  function closePanel() {
    document.querySelector('.filters').classList.remove('open');
    document.body.style.overflow = '';
  }
  document.getElementById('filters-close').addEventListener('click', closePanel);
  document.getElementById('mobile-apply').addEventListener('click', closePanel);
})();
