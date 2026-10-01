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

  document.addEventListener('DOMContentLoaded', paintBadge);
  paintBadge();
})();
