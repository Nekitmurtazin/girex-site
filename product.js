/* Карточка товара по ТЗ «Карточка товара и выбор исполнения».
   Варианты строятся только из реальных исполнений (SKU) серии: несовместимые значения
   остаются видимыми, но недоступны; единственный оставшийся вариант выбирается сам. */
(function () {
  var params = new URLSearchParams(location.search);
  var id = params.get('id');
  var ALL = [], P = null, SKUS = [];
  var sel = { dn: '', press: '', mat: '' };
  var DEMO = '<span class="demo-mark" title="Выдуманные данные для демонстрации">демо</span>';

  function el(tag, props, text) {
    var n = document.createElement(tag);
    Object.assign(n, props || {});
    if (text != null) n.textContent = text;
    return n;
  }
  function isDemo(field) { return (P.demo || []).indexOf(field) >= 0; }
  function demoAfter(node, field) { if (!field || isDemo(field)) node.insertAdjacentHTML('beforeend', DEMO); }

  fetch('products.json').then(function (r) { return r.json(); }).then(function (list) {
    ALL = list;
    P = list.filter(function (x) { return x.id === id; })[0];
    if (!P) {
      document.getElementById('p-main').style.display = 'none';
      document.querySelector('.tabs').style.display = 'none';
      document.getElementById('p-missing').style.display = 'block';
      return;
    }
    SKUS = (P.skus || []).map(function (s) {
      s.press = s.pn ? 'PN' + s.pn : (s.cls ? 'Class ' + s.cls : '');
      return s;
    });
    var bySku = params.get('sku') && SKUS.filter(function (s) { return s.a === params.get('sku'); })[0];
    if (bySku) {
      sel = { dn: 'DN' + bySku.dn, press: bySku.press, mat: bySku.mat };
    } else {
      sel.dn = params.get('dn') || '';
      sel.press = params.get('pn') || '';
      sel.mat = params.get('mat') || '';
    }
    staticParts();
    render();
  });

  /* ——— данные выбора ——— */
  var FIELDS = [
    { key: 'dn', label: 'Диаметр DN', get: function (s) { return 'DN' + s.dn; }, sort: function (a, b) { return +a.slice(2) - +b.slice(2); } },
    { key: 'press', label: 'Давление', get: function (s) { return s.press; }, sort: function (a, b) { return +a.replace(/\D/g, '') - +b.replace(/\D/g, ''); } },
    { key: 'mat', label: 'Материал корпуса', get: function (s) { return s.mat; } }
  ];

  function compatible(skipKey) {
    return SKUS.filter(function (s) {
      return FIELDS.every(function (f) {
        if (f.key === skipKey || !sel[f.key]) return true;
        return f.get(s) === sel[f.key];
      });
    });
  }

  function valuesOf(f) {
    var set = [];
    SKUS.forEach(function (s) { var v = f.get(s); if (v && set.indexOf(v) < 0) set.push(v); });
    return f.sort ? set.sort(f.sort) : set;
  }

  function currentSku() {
    var list = compatible(null);
    var full = FIELDS.every(function (f) { return !valuesOf(f).length || sel[f.key]; });
    return full && list.length === 1 ? list[0] : null;
  }

  /* автоподстановка единственного оставшегося значения */
  function autofill() {
    var changed = true, guard = 0;
    while (changed && guard++ < 5) {
      changed = false;
      FIELDS.forEach(function (f) {
        if (sel[f.key]) return;
        var vals = [];
        compatible(f.key).forEach(function (s) { var v = f.get(s); if (vals.indexOf(v) < 0) vals.push(v); });
        if (vals.length === 1 && valuesOf(f).length > 1) { sel[f.key] = vals[0]; changed = true; }
      });
    }
    // выбранное значение, ставшее невозможным, сбрасываем
    FIELDS.forEach(function (f) {
      if (sel[f.key] && !compatible(null).length) sel[f.key] = '';
    });
  }

  /* ——— неизменяемые части ——— */
  function staticParts() {
    document.title = P.name + ' — GIREX';
    var gl = document.getElementById('p-group');
    gl.textContent = P.groupName;
    gl.href = 'catalog.html?group=' + encodeURIComponent(P.group);
    document.getElementById('p-group-label').textContent = P.groupName;
    document.getElementById('p-crumb').textContent = P.models[0] || P.name.slice(0, 40);
    document.getElementById('p-name').textContent = P.name;
    document.getElementById('p-family').textContent = P.models[0] || '—';
    document.getElementById('p-lead').textContent = lead();
    gallery();
    tabsStatic();

    document.getElementById('p-reset').onclick = function () {
      sel = { dn: '', press: '', mat: '' };
      render();
    };
    document.getElementById('p-add').onclick = function () {
      var s = currentSku();
      Cart.add({ id: P.id, name: P.name, model: s ? s.a : (P.models[0] || ''), size: [sel.dn, sel.press, sel.mat].filter(Boolean).join(', '), qty: 1 });
      cartToast('Добавлено в заявку: ' + (s ? s.a : P.models[0] || P.name.slice(0, 40)));
    };
    document.getElementById('p-ask').onclick = function () {
      var s = currentSku();
      Cart.add({ id: P.id, name: P.name, model: s ? s.a : (P.models[0] || ''), size: [sel.dn, sel.press, sel.mat].filter(Boolean).join(', '), qty: 1 });
      location.href = 'cart.html?from=' + encodeURIComponent(s ? s.a : P.id);
    };
  }

  function lead() {
    var a = P.attr || {};
    var bits = [];
    if (a.conn) bits.push(a.conn.toLowerCase() + ' присоединение');
    if (a.dn && a.dn.length) bits.push('DN' + a.dn[0] + ' – DN' + a.dn[a.dn.length - 1]);
    if (P.temp) bits.push('рабочая температура ' + P.temp);
    var t = bits.join(', ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) + '.' : '';
  }

  function gallery() {
    var thumbs = document.getElementById('p-thumbs');
    var stage = document.getElementById('p-img');
    thumbs.textContent = '';
    if (!P.img) { stage.style.display = 'none'; return; }
    stage.src = P.img;
    stage.alt = P.name;
    var t = el('button', { className: 'thumb active', type: 'button', title: 'Фото' });
    t.appendChild(el('img', { src: P.img, alt: '' }));
    thumbs.appendChild(t);
    if (P.dims) {
      var d = el('button', { className: 'thumb', type: 'button', title: 'Таблица размеров' });
      d.appendChild(el('span', null, 'Размеры'));
      d.onclick = function () { openTab('harakteristiki'); };
      thumbs.appendChild(d);
    }
    var ch = el('button', { className: 'thumb', type: 'button', title: 'Чертёж исполнения' });
    ch.appendChild(el('span', null, 'Чертёж PDF'));
    ch.onclick = function () { openTab('dokumentaciya'); };
    thumbs.appendChild(ch);
  }

  /* ——— динамика ——— */
  function render() {
    autofill();
    fields();
    var s = currentSku();
    status(s);
    specs(s);
    tabsDynamic(s);
    syncUrl(s);
  }

  function fields() {
    var box = document.getElementById('p-fields');
    box.textContent = '';
    if (!SKUS.length) {
      box.appendChild(el('div', { className: 'pick-note' }, 'Исполнения этой позиции подбирает инженер: пришлите типоразмер и условия работы.'));
      return;
    }
    FIELDS.forEach(function (f) {
      var all = valuesOf(f);
      if (!all.length) return;
      var avail = [];
      compatible(f.key).forEach(function (s) { var v = f.get(s); if (avail.indexOf(v) < 0) avail.push(v); });
      var wrap = el('div', { className: 'pick-field' });
      var cap = el('span', null, f.label);
      if (f.key !== 'dn' || isDemo('dn')) demoAfter(cap, f.key === 'press' ? 'press' : (f.key === 'mat' ? 'mat' : 'dn'));
      wrap.appendChild(cap);

      if (all.length > 6) {
        var s = el('select');
        s.appendChild(el('option', { value: '' }, 'выберите'));
        all.forEach(function (v) {
          var o = el('option', { value: v }, v + (avail.indexOf(v) < 0 ? ' — нет в сочетании' : ''));
          o.disabled = avail.indexOf(v) < 0 && sel[f.key] !== v;
          if (sel[f.key] === v) o.selected = true;
          s.appendChild(o);
        });
        s.onchange = function () { sel[f.key] = s.value; render(); };
        wrap.appendChild(s);
      } else {
        var opts = el('div', { className: 'pick-opts' });
        all.forEach(function (v) {
          var b = el('button', { type: 'button', className: 'opt' + (sel[f.key] === v ? ' on' : '') }, v);
          b.disabled = avail.indexOf(v) < 0 && sel[f.key] !== v;
          b.title = b.disabled ? 'Нет исполнения в таком сочетании' : '';
          b.onclick = function () { sel[f.key] = sel[f.key] === v ? '' : v; render(); };
          opts.appendChild(b);
        });
        wrap.appendChild(opts);
      }
      box.appendChild(wrap);
    });
    var drive = (P.attr || {}).drive;
    if (drive) {
      var dw = el('div', { className: 'pick-field' });
      dw.appendChild(el('span', null, 'Управление'));
      var o = el('div', { className: 'pick-opts' });
      var chip = el('span', { className: 'opt on' }, drive);
      chip.style.display = 'inline-flex';
      chip.style.alignItems = 'center';
      chip.style.cursor = 'default';
      o.appendChild(chip);
      dw.appendChild(o);
      box.appendChild(dw);
    }
  }

  function status(s) {
    var st = document.getElementById('p-status');
    var art = document.getElementById('p-article');
    var note = document.getElementById('p-note');
    var ask = document.getElementById('p-ask');
    st.className = 'status';
    if (!s) {
      var chosen = FIELDS.filter(function (f) { return sel[f.key]; }).length;
      st.textContent = chosen ? 'Выберите остальные параметры' : 'Выберите исполнение';
      st.className = 'status wait';
      art.textContent = P.models[0] || '—';
      ask.textContent = 'Узнать цену и наличие';
      note.textContent = 'Цену и срок поставки подтверждает менеджер: отвечаем в рабочее время в течение 2 часов.';
      return;
    }
    art.textContent = s.a;
    art.insertAdjacentHTML('beforeend', DEMO);
    if (s.st === 'in') {
      st.textContent = 'В наличии: ' + s.q + ' шт.';
      ask.textContent = 'Запросить счёт';
      note.textContent = 'Отгрузка со склада в Щёлково в день оплаты. Цену пришлём вместе со счётом.';
    } else if (s.st === 'order') {
      st.textContent = 'Под заказ, ' + s.lead + ' дней';
      st.className = 'status wait';
      ask.textContent = 'Узнать срок и цену';
      note.textContent = 'Срок указан ориентировочно и фиксируется в счёте.';
    } else {
      st.textContent = 'Снят с производства';
      st.className = 'status wait';
      ask.textContent = 'Подобрать замену';
      note.textContent = 'Это исполнение больше не выпускается. Похожие позиции — во вкладке «Аналоги».';
    }
    st.insertAdjacentHTML('beforeend', DEMO);
  }

  function specs(s) {
    var a = P.attr || {};
    var box = document.getElementById('p-specs');
    box.textContent = '';
    var rows = [];
    var dns = SKUS.map(function (x) { return x.dn; });
    if (dns.length) rows.push(['Диаметр', sel.dn || ('DN' + Math.min.apply(null, dns) + ' – DN' + Math.max.apply(null, dns)), !!sel.dn, 'dn']);
    var presses = valuesOf(FIELDS[1]);
    if (presses.length) rows.push(['Давление', sel.press || presses.join(' / '), !!sel.press, 'press']);
    if (a.conn) rows.push(['Присоединение', a.conn, false, '']);
    var mats = valuesOf(FIELDS[2]);
    if (mats.length) rows.push(['Материал корпуса', sel.mat || mats.join(', '), !!sel.mat, 'mat']);
    if (a.drive) rows.push(['Управление', a.drive, false, '']);
    if (P.temp) rows.push(['Рабочая температура', P.temp, false, 'temp']);
    if (a.media && a.media.length) rows.push(['Рабочая среда', a.media.join(', '), false, 'media']);
    if (P.standards && P.standards.length) rows.push(['Стандарты', P.standards.slice(0, 4).join(', '), false, '']);
    if (s) rows.push(['Наличие', s.st === 'in' ? 'на складе, ' + s.q + ' шт.' : (s.st === 'order' ? 'под заказ, ' + s.lead + ' дней' : 'снят с производства'), true, 'stock']);
    else rows.push(['Наличие и срок', 'зависят от исполнения', false, '']);
    rows.forEach(function (r) {
      var row = el('div', { className: 'spec-row' + (r[2] ? ' exact' : '') });
      row.appendChild(el('span', null, r[0]));
      var v = el('span', null, r[1]);
      if (r[3] && isDemo(r[3])) v.insertAdjacentHTML('beforeend', DEMO);
      row.appendChild(v);
      box.appendChild(row);
    });
  }

  /* ——— вкладки ——— */
  var TABS = [
    { key: 'opisanie', title: 'Описание' },
    { key: 'harakteristiki', title: 'Характеристики' },
    { key: 'dokumentaciya', title: 'Документация' },
    { key: 'sovmestimye', title: 'Совместимые' },
    { key: 'analogi', title: 'Аналоги' }
  ];

  function openTab(key) {
    TABS.forEach(function (t) { document.getElementById('tab-' + t.key).classList.toggle('on', t.key === key); });
    [].forEach.call(document.querySelectorAll('.tab-btn'), function (b) { b.classList.toggle('on', b.dataset.tab === key); });
    document.querySelector('.tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function tabsStatic() {
    var head = document.getElementById('tabs-head');
    head.textContent = '';
    TABS.forEach(function (t, i) {
      var b = el('button', { type: 'button', className: 'tab-btn' + (i === 0 ? ' on' : '') }, t.title);
      b.dataset.tab = t.key;
      b.onclick = function () { openTab(t.key); };
      head.appendChild(b);
    });
    document.getElementById('tab-opisanie').classList.add('on');

    var d = document.getElementById('tab-opisanie');
    d.textContent = '';
    if (P.features && P.features.length) {
      var ul = el('ul', { className: 'feat' });
      P.features.forEach(function (f) { ul.appendChild(el('li', null, f)); });
      d.appendChild(ul);
    } else {
      d.appendChild(el('div', { className: 'muted' }, 'Техническое описание серии пришлём по запросу.'));
    }

    var comp = document.getElementById('tab-sovmestimye');
    comp.textContent = '';
    var drives = ALL.filter(function (x) { return /привод/i.test(x.name) && x.id !== P.id; });
    var flanges = ALL.filter(function (x) { return x.group === 'flanec'; }).slice(0, 2);
    var items = (/клапан|задвижк|затвор/i.test(P.name) ? drives.concat(flanges) : flanges).slice(0, 4);
    if (items.length) {
      comp.appendChild(el('div', { className: 'muted' }, 'Позиции каталога, которые обычно заказывают вместе с этой:'));
      var g = el('div', { className: 'rel-grid' });
      g.style.marginTop = '16px';
      items.forEach(function (x) { g.appendChild(relCard(x)); });
      comp.appendChild(g);
    }

    var an = document.getElementById('tab-analogi');
    an.textContent = '';
    var same = ALL.filter(function (x) {
      if (x.id === P.id || x.group !== P.group) return false;
      var xa = x.attr || {}, pa = P.attr || {};
      if (!xa.dn || !pa.dn) return true;
      return xa.dn.some(function (v) { return pa.dn.indexOf(v) >= 0; });
    }).slice(0, 4);
    if (same.length) {
      an.appendChild(el('div', { className: 'muted' }, 'Позиции того же раздела с пересекающимся диапазоном диаметров:'));
      var g2 = el('div', { className: 'rel-grid' });
      g2.style.marginTop = '16px';
      same.forEach(function (x) { g2.appendChild(relCard(x)); });
      an.appendChild(g2);
    }
  }

  function tabsDynamic(s) {
    var h = document.getElementById('tab-harakteristiki');
    h.textContent = '';
    if (P.materials && P.materials.length) {
      h.appendChild(el('div', { className: 'pick-title' }, 'Комплектующие и материалы'));
      h.appendChild(table(['Деталь', 'Материал'], P.materials));
    }
    if (P.dims && P.dims.rows && P.dims.rows.length) {
      var t2 = el('div', { className: 'pick-title' }, 'Присоединительные и габаритные размеры, мм');
      t2.style.marginTop = '22px';
      h.appendChild(t2);
      var rows = P.dims.rows;
      if (sel.dn) {
        var num = sel.dn.replace('DN', '');
        var head = (P.dims.head || []).map(function (x) { return (x || '').toLowerCase(); });
        var col = head.indexOf('dn');
        if (col < 0) col = head.findIndex(function (x) { return x.indexOf('dn') >= 0 || x.indexOf('диаметр') >= 0; });
        var only = rows.filter(function (r) { return col >= 0 ? String(r[col]).trim() === num : r.indexOf(num) >= 0; });
        if (only.length) {
          rows = only;
          var hint = el('div', { className: 'pick-note' }, 'Показана строка исполнения ' + sel.dn + '. Сбросьте параметры, чтобы увидеть всю таблицу.');
          hint.style.margin = '6px 0 10px';
          h.appendChild(hint);
        }
      }
      h.appendChild(table(P.dims.head, rows));
    }
    if (SKUS.length) {
      var t3 = el('div', { className: 'pick-title' }, 'Исполнения серии');
      t3.style.marginTop = '22px';
      t3.insertAdjacentHTML('beforeend', DEMO);
      h.appendChild(t3);
      var list = compatible(null).slice(0, 40);
      h.appendChild(table(['Артикул', 'DN', 'Давление', 'Материал', 'Наличие'], list.map(function (x) {
        return [x.a, 'DN' + x.dn, x.press, x.mat, x.st === 'in' ? 'в наличии, ' + x.q + ' шт.' : (x.st === 'order' ? 'под заказ, ' + x.lead + ' дн.' : 'снят')];
      })));
    }

    var doc = document.getElementById('tab-dokumentaciya');
    doc.textContent = '';
    var docs = P.docs || [];
    if (docs.length) {
      var wrap = el('div', { className: 'rel-grid' });
      docs.forEach(function (dc) {
        var bySku = dc.scope === 'исполнение';
        var a = el('a', { className: 'rel-card', href: bySku && !s ? '#' : dc.file, target: '_blank', rel: 'noopener' });
        var b = el('b', null, dc.name + (bySku && s ? ' — ' + s.a : ''));
        b.insertAdjacentHTML('beforeend', DEMO);
        a.appendChild(b);
        a.appendChild(el('span', null, bySku && !s ? 'выберите исполнение, чтобы скачать' : dc.type + ' · ' + dc.size + ' · ' + (bySku ? 'для исполнения' : 'общий для серии')));
        if (bySku && !s) {
          a.style.opacity = '0.55';
          a.onclick = function (e) { e.preventDefault(); openTab('dokumentaciya'); };
        }
        wrap.appendChild(a);
      });
      doc.appendChild(wrap);
    }
  }

  function relCard(x) {
    var a = el('a', { className: 'rel-card', href: 'product.html?id=' + encodeURIComponent(x.id) });
    if (x.img) a.appendChild(el('img', { src: x.img, alt: '', loading: 'lazy' }));
    a.appendChild(el('b', null, x.name.length > 70 ? x.name.slice(0, 70) + '…' : x.name));
    var xa = x.attr || {};
    a.appendChild(el('span', null, (x.models[0] || '') + (xa.dn && xa.dn.length ? ' · DN' + xa.dn[0] + ' – DN' + xa.dn[xa.dn.length - 1] : '')));
    return a;
  }

  function table(head, rows) {
    var wrap = el('div', { className: 'scroll' });
    var t = el('table', { className: 'data' });
    if (head) {
      var tr = el('tr');
      head.forEach(function (x) { tr.appendChild(el('th', null, x || '')); });
      t.appendChild(tr);
    }
    rows.forEach(function (r) {
      var tr = el('tr');
      r.forEach(function (c) { tr.appendChild(el('td', null, c == null ? '' : c)); });
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    return wrap;
  }

  function syncUrl(s) {
    var p = new URLSearchParams();
    p.set('id', P.id);
    if (s) p.set('sku', s.a);
    else {
      if (sel.dn) p.set('dn', sel.dn);
      if (sel.press) p.set('pn', sel.press);
      if (sel.mat) p.set('mat', sel.mat);
    }
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }
})();
