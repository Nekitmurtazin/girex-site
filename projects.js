/* Раздел «Реализованные проекты» по ТЗ: список с фильтром категорий и детальная страница.
   Содержимое берётся из projects.json — редактируется без правки вёрстки. */
(function () {
  var DATA = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function img(src, alt, cls) {
    if (!src) {
      var ph = el('div', (cls || '') + ' ph');
      ph.textContent = 'фото не загружено';
      return ph;
    }
    var i = el('img', cls);
    i.src = src;
    i.alt = alt || '';
    i.loading = 'lazy';
    return i;
  }

  function published(list) {
    return list.filter(function (p) { return p.status === 'published'; })
      .sort(function (a, b) {
        var pr = (b.priority || 0) - (a.priority || 0);
        return pr || String(b.date || '').localeCompare(String(a.date || ''));
      });
  }

  function demoNote(items) {
    if (!items.some(function (p) { return p.demo; })) return null;
    var n = el('div', 'demo-note');
    n.innerHTML = 'Проекты, цифры и фотографии в этом разделе — демо-данные для показа наполненного вида. Отмечены значком <span class="demo-mark">демо</span>. Реальные материалы подставляются в projects.json.';
    return n;
  }

  /* ---------- страница списка ---------- */
  function renderList() {
    var box = document.getElementById('pr-list');
    if (!box) return;
    var items = published(DATA.projects);
    var active = new URLSearchParams(location.search).get('cat') || 'all';

    var intro = document.getElementById('pr-intro');
    if (intro && DATA.intro) {
      intro.textContent = DATA.intro.text || '';
    }

    var statsBox = document.getElementById('pr-stats');
    if (statsBox) {
      statsBox.textContent = '';
      (DATA.intro.stats || []).filter(function (s) { return s.value; }).forEach(function (s) {
        var c = el('div', 'pr-stat');
        c.appendChild(el('b', null, s.value));
        c.appendChild(el('span', null, s.label));
        if (DATA.intro.demo) c.firstChild.insertAdjacentHTML('beforeend', '<span class="demo-mark" title="Выдуманные данные">демо</span>');
        statsBox.appendChild(c);
      });
      statsBox.style.display = statsBox.children.length ? 'grid' : 'none';
    }

    var tabs = document.getElementById('pr-cats');
    tabs.textContent = '';
    DATA.categories.forEach(function (c) {
      var n = items.filter(function (p) { return c.id === 'all' || (p.categories || []).indexOf(c.id) >= 0; }).length;
      var b = el('button', 'pr-cat' + (c.id === active ? ' on' : ''), c.title + (c.id === 'all' ? '' : ' · ' + n));
      b.type = 'button';
      b.addEventListener('click', function () {
        active = c.id;
        var url = location.pathname + (c.id === 'all' ? '' : '?cat=' + c.id);
        history.pushState(null, '', url);
        paint();
      });
      tabs.appendChild(b);
    });

    var note = demoNote(items);
    var noteHost = document.getElementById('pr-note');
    noteHost.textContent = '';
    if (note) noteHost.appendChild(note);

    function paint() {
      [].forEach.call(tabs.children, function (b, i) {
        b.classList.toggle('on', DATA.categories[i].id === active);
      });
      var list = items.filter(function (p) { return active === 'all' || (p.categories || []).indexOf(active) >= 0; });
      box.textContent = '';
      if (!list.length) {
        var empty = el('div', 'pr-empty', 'В этом направлении пока нет опубликованных проектов. Посмотрите другие категории или напишите нам — расскажем о похожих работах.');
        box.appendChild(empty);
        return;
      }
      list.forEach(function (p) {
        var a = el('a', 'pr-card');
        a.href = 'project-' + p.slug + '.html';
        var media = el('div', 'pr-card-media');
        media.appendChild(img(p.cover, p.title, 'pr-cover'));
        var catTitle = (DATA.categories.filter(function (c) { return c.id === (p.categories || [])[0]; })[0] || {}).title;
        if (catTitle) media.appendChild(el('span', 'pr-badge', catTitle));
        if (p.demo) { var dm = el('span', 'demo-mark', 'демо'); dm.style.position = 'absolute'; dm.style.top = '10px'; dm.style.right = '10px'; dm.title = 'Выдуманный проект'; media.appendChild(dm); }
        a.appendChild(media);
        var body = el('div', 'pr-card-body');
        body.appendChild(el('h3', 'pr-card-title', p.title));
        body.appendChild(el('p', 'pr-card-text', p.cardText || ''));
        if (p.tags && p.tags.length) {
          var tg = el('div', 'pr-tags');
          p.tags.forEach(function (t) { tg.appendChild(el('span', 'pr-tag', t)); });
          body.appendChild(tg);
        }
        body.appendChild(el('span', 'pr-more', 'Подробнее →'));
        a.appendChild(body);
        box.appendChild(a);
      });
    }

    window.addEventListener('popstate', function () {
      active = new URLSearchParams(location.search).get('cat') || 'all';
      paint();
    });
    paint();
  }

  /* ---------- детальная страница ---------- */
  function renderDetail() {
    var host = document.getElementById('pr-detail');
    if (!host) return;
    var slug = new URLSearchParams(location.search).get('slug') || host.getAttribute('data-slug');
    var p = DATA.projects.filter(function (x) { return x.slug === slug && x.status === 'published'; })[0];
    if (!p) {
      host.appendChild(el('div', 'pr-empty', 'Проект не найден или ещё не опубликован.'));
      var back = el('a', 'btn-doc', 'Все проекты');
      back.href = 'projects.html';
      host.appendChild(back);
      return;
    }

    document.title = (p.seo && p.seo.title) || (p.title + ' — GIREX');
    var meta = document.querySelector('meta[name="description"]');
    if (meta && p.seo && p.seo.description) meta.content = p.seo.description;
    document.getElementById('pr-crumb').textContent = p.title;

    var note = demoNote([p]);
    if (note) host.appendChild(note);

    /* первый экран */
    var hero = el('div', 'pr-hero');
    var left = el('div', 'pr-hero-left');
    left.appendChild(el('span', 'pr-label', 'РЕАЛИЗОВАННЫЙ ПРОЕКТ'));
    var h1 = el('h1', 'pr-h1');
    if (p.titleAccent && p.title.indexOf(p.titleAccent) >= 0) {
      var parts = p.title.split(p.titleAccent);
      h1.appendChild(document.createTextNode(parts[0]));
      h1.appendChild(el('span', 'accent', p.titleAccent));
      h1.appendChild(document.createTextNode(parts[1] || ''));
    } else {
      h1.textContent = p.title;
    }
    left.appendChild(h1);
    if (p.lead) left.appendChild(el('p', 'pr-lead', p.lead));
    var cta = el('div', 'pr-cta');
    var c1 = el('a', 'btn-primary', 'Получить похожее решение');
    c1.href = requestLink(p);
    var c2 = el('a', 'btn-doc', 'Обсудить проект');
    c2.href = requestLink(p);
    cta.append(c1, c2);
    left.appendChild(cta);
    hero.appendChild(left);

    var right = el('div', 'pr-hero-right');
    right.appendChild(img(p.cover, p.title, 'pr-hero-img'));
    hero.appendChild(right);
    host.appendChild(hero);

    /* ключевые характеристики */
    if (p.specs && p.specs.length) {
      var sp = el('div', 'pr-specs');
      p.specs.forEach(function (s) {
        var c = el('div', 'pr-spec');
        c.appendChild(el('span', null, s.name));
        c.appendChild(el('b', null, s.value));
        sp.appendChild(c);
      });
      host.appendChild(sp);
    }

    /* задача и решение */
    if (p.task || p.solution) {
      var two = el('div', 'pr-two');
      if (p.task) two.appendChild(block('Задача заказчика', p.task, ''));
      if (p.solution) two.appendChild(block('Решение GIREX', p.solution, 'green'));
      host.appendChild(two);
    }

    /* состав оборудования */
    if (p.equipment && p.equipment.length) {
      host.appendChild(section('Состав оборудования'));
      var eq = el('div', 'pr-eq');
      p.equipment.forEach(function (e) {
        var c = el('div', 'pr-eq-card');
        c.appendChild(img(e.image, e.name, 'pr-eq-img'));
        c.appendChild(el('b', null, e.name));
        if (e.text) c.appendChild(el('span', null, e.text));
        if (e.link) {
          var l = el('a', 'pr-eq-link', 'Смотреть в каталоге →');
          l.href = e.link;
          c.appendChild(l);
        }
        eq.appendChild(c);
      });
      host.appendChild(eq);
    }

    /* процесс */
    if (p.steps && p.steps.length) {
      host.appendChild(section('Процесс реализации'));
      var steps = el('div', 'pr-steps');
      p.steps.forEach(function (s, i) {
        var c = el('div', 'pr-step');
        c.appendChild(el('span', 'pr-step-num', String(i + 1)));
        c.appendChild(el('b', null, s.name));
        if (s.text) c.appendChild(el('span', 'pr-step-text', s.text));
        steps.appendChild(c);
      });
      host.appendChild(steps);
    }

    /* галерея */
    if (p.gallery && p.gallery.length) {
      host.appendChild(section('Фотографии проекта'));
      var g = el('div', 'pr-gallery');
      p.gallery.forEach(function (ph) {
        var fig = el('figure', 'pr-photo');
        var im = img(ph.src, ph.alt || p.title, '');
        im.addEventListener('click', function () { lightbox(ph.src, ph.alt || p.title); });
        fig.appendChild(im);
        if (ph.caption) fig.appendChild(el('figcaption', null, ph.caption));
        g.appendChild(fig);
      });
      host.appendChild(g);
    }

    /* результат */
    if (p.result && p.result.length) {
      var res = el('div', 'pr-result');
      res.appendChild(el('b', 'pr-result-title', 'Результат'));
      var ul = el('ul', 'pr-result-list');
      p.result.forEach(function (r) {
        var li = el('li', null, r);
        ul.appendChild(li);
      });
      res.appendChild(ul);
      host.appendChild(res);
    }

    /* документы */
    if (p.documents && p.documents.length) {
      host.appendChild(section('Документы'));
      var docs = el('div', 'pr-docs');
      p.documents.filter(function (d) { return d.public !== false; }).forEach(function (d) {
        var a = el('a', 'pr-doc');
        a.href = d.file;
        a.appendChild(el('b', null, d.name));
        a.appendChild(el('span', null, [d.type, d.size].filter(Boolean).join(' · ')));
        docs.appendChild(a);
      });
      host.appendChild(docs);
    }

    /* финальный CTA */
    var fin = el('div', 'pr-final');
    fin.appendChild(el('b', null, 'Нужно похожее решение?'));
    fin.appendChild(el('span', null, 'Опишите задачу — инженер предложит вариант исполнения и посчитает стоимость.'));
    var f1 = el('a', 'btn-primary', 'Получить похожее решение');
    f1.href = requestLink(p);
    var f2 = el('a', 'pr-final-link', 'Обсудить проект с инженером');
    f2.href = requestLink(p);
    fin.append(f1, f2);
    host.appendChild(fin);
  }

  function requestLink(p) {
    return 'index.html?project=' + encodeURIComponent(p.slug) + '#zayavka';
  }

  function section(title) {
    return el('h2', 'pr-section', title);
  }

  function block(title, text, mod) {
    var b = el('div', 'pr-block ' + (mod || ''));
    b.appendChild(el('b', null, title));
    b.appendChild(el('p', null, text));
    return b;
  }

  function lightbox(src, alt) {
    var ov = el('div', 'pr-lightbox');
    var i = el('img');
    i.src = src;
    i.alt = alt;
    ov.appendChild(i);
    ov.addEventListener('click', function () { ov.remove(); });
    document.body.appendChild(ov);
  }

  fetch('projects.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DATA = d;
      renderList();
      renderDetail();
    })
    .catch(function () {
      var host = document.getElementById('pr-list') || document.getElementById('pr-detail');
      if (host) host.appendChild(el('div', 'pr-empty', 'Не удалось загрузить данные проектов.'));
    });
})();
