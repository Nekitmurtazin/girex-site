/* Корзина GIREX: хранится в браузере посетителя, уходит письмом на почту. */
(function () {
  var KEY = 'girex-cart-v1';

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {}
    paintBadge();
    document.dispatchEvent(new CustomEvent('cart:change'));
  }

  function keyOf(item) {
    return [item.id, item.model || '', item.size || ''].join('|');
  }

  var Cart = {
    items: read,
    count: function () {
      return read().reduce(function (n, i) { return n + i.qty; }, 0);
    },
    add: function (item) {
      var list = read();
      var found = list.filter(function (i) { return keyOf(i) === keyOf(item); })[0];
      if (found) found.qty += item.qty || 1;
      else list.push({ id: item.id, name: item.name, model: item.model || '', size: item.size || '', qty: item.qty || 1 });
      write(list);
    },
    setQty: function (k, qty) {
      var list = read().map(function (i) {
        if (keyOf(i) === k) i.qty = Math.max(1, qty);
        return i;
      });
      write(list);
    },
    remove: function (k) {
      write(read().filter(function (i) { return keyOf(i) !== k; }));
    },
    clear: function () { write([]); },
    key: keyOf
  };
  window.Cart = Cart;

  /* ——— значок корзины в шапке ——— */
  function paintBadge() {
    var n = Cart.count();
    [].forEach.call(document.querySelectorAll('[data-cart-count]'), function (el) {
      el.textContent = n;
      el.style.display = n ? 'flex' : 'none';
    });
  }

  /* ——— всплывающее уведомление ——— */
  function toast(text) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  window.cartToast = toast;

  /* ——— кнопки «В корзину» в каталоге ——— */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add-to-cart]');
    if (!b) return;
    e.preventDefault();
    Cart.add({
      id: b.getAttribute('data-id'),
      name: b.getAttribute('data-name'),
      model: b.getAttribute('data-model') || '',
      qty: 1
    });
    toast('Добавлено в корзину: ' + (b.getAttribute('data-model') || b.getAttribute('data-name')).slice(0, 48));
  });


/* ——— рекламные метки и сайт, с которого пришёл посетитель: запоминаем на первой странице визита ——— */
(function () {
  try {
    var q = new URLSearchParams(location.search);
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
      if (q.get(k)) utm[k] = q.get(k);
    });
    if (Object.keys(utm).length) sessionStorage.setItem('girex-utm', JSON.stringify(utm));
    if (!sessionStorage.getItem('girex-ref')) {
      var ref = document.referrer;
      sessionStorage.setItem('girex-ref', ref && ref.indexOf(location.host) < 0 ? ref : '-');
    }
  } catch (e) {}
})();

/* ——— отправка заявки ———
   На хостинге — в lead.php: он создаёт лид в Битрикс24 и дублирует заявку на почту.
   На GitHub Pages PHP нет, там заявка уходит через FormSubmit.
   Если отправить не получилось — открываем почтовую программу с готовым письмом. */
window.GIREX_EMAIL = 'info@girex.ru';
var pageStart = Date.now();

function readSession(key) {
  try { return sessionStorage.getItem(key); } catch (e) { return null; }
}

function sendLead(fields, items) {
  var hp = document.querySelector('input[name="website"]');
  var utm = {};
  try { utm = JSON.parse(readSession('girex-utm') || '{}'); } catch (e) {}
  var ref = readSession('girex-ref');
  return fetch('lead.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ fields: fields, items: items || [], utm: utm, ref: ref && ref !== '-' ? ref : '', hp: hp ? hp.value : '', t: Date.now() - pageStart })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (!res.ok) throw new Error(res.error || 'send failed');
    return res;
  });
}

function sendFormSubmit(fields) {
  var payload = Object.assign({ _subject: 'Заявка с сайта GIREX', _template: 'table', _captcha: 'false' }, fields);
  return fetch('https://formsubmit.co/ajax/' + window.GIREX_EMAIL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (String(res.success) !== 'true') throw new Error(res.message || 'send failed');
    return res;
  });
}

/* items — позиции корзины [{ name, model, size, qty }], уходят строками товаров в сделку */
window.sendRequest = function (fields, mailtoBody, items) {
  var send = /\.github\.io$/.test(location.hostname) ? sendFormSubmit : sendLead;
  return send(fields, items).catch(function (err) {
    // не дошло — открываем почтовую программу с готовым письмом
    location.href = 'mailto:' + window.GIREX_EMAIL + '?subject=' + encodeURIComponent('Заявка с сайта GIREX')
      + '&body=' + encodeURIComponent(mailtoBody);
    throw err;
  });
};

  /* ——— мобильное меню ——— */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.burger');
    var menu = document.getElementById('mobile-menu');
    if (!menu) return;
    if (b) {
      var open = menu.classList.toggle('open');
      b.setAttribute('aria-expanded', String(open));
    } else if (!e.target.closest('.mobile-menu')) {
      menu.classList.remove('open');
    }
  });

  document.addEventListener('DOMContentLoaded', paintBadge);
  paintBadge();
})();
