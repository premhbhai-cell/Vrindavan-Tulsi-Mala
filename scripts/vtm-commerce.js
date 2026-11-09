/* Vrindavan Tulsi Mala – cart, checkout, UPI payment and WhatsApp order flow */
(function () {
  'use strict';

  var CFG = {
    brand: 'Vrindavan Tulsi Mala',
    phone: '9610746508',
    wa: '919610746508',
    email: 'nayakkamal068@gmail.com',
    address: 'Vrindavan, Mathura, Uttar Pradesh - 281121',
    upi: '9610746508-6@axl',
    upiName: 'Kammu Nayak',
    insta: 'https://www.instagram.com/invites/contact/?utm_content=fwhfrr5&exln=lr6c14c6yhx1'
  };

  /* ---------- helpers ---------- */
  var script = document.currentScript || document.querySelector('script[src*="vtm-commerce.js"]');
  var BASE = script ? script.src.replace(/scripts\/vtm-commerce\.js.*$/, '') : './';
  var K_CART = 'vtm_cart_v1', K_COUPON = 'vtm_coupon', K_DRAFT = 'vtm_order_draft',
      K_ORDERS = 'vtm_orders', K_LAST = 'vtm_last_order', K_CUST = 'vtm_customer', K_ACTIVE = 'vtm_active_checkout_items';

  function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function num(t) { var m = String(t || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/); return m ? Math.round(parseFloat(m[1])) : 0; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function getCart() { var c = read(K_CART, []); return Array.isArray(c) ? c : []; }
  function getCheckoutCart() { var active = read(K_ACTIVE, null); return Array.isArray(active) && active.length ? active : getCart(); }
  function saveCart(c) { write(K_CART, c); updateBubble(); }
  function count(c) { return (c || getCart()).reduce(function (s, i) { return s + i.qty; }, 0); }

  /* ---------- coupons / totals ---------- */
  var COUPONS = {
    VTM10: { min: 999, calc: function (s) { return Math.round(s * 0.10); }, label: '10% off on orders ₹999+' },
    DIWALI200: { min: 1999, calc: function () { return 200; }, label: '₹200 off on orders ₹1,999+' }
  };
  function totals(cart, code) {
    var sub = cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var disc = 0, msg = '';
    if (code) {
      var c = COUPONS[code];
      if (!c) msg = 'Invalid coupon code.';
      else if (sub < c.min) msg = code + ' needs a minimum order of ' + inr(c.min) + '.';
      else disc = Math.min(c.calc(sub), sub);
    }
    return { subtotal: sub, discount: disc, shipping: 0, total: sub - disc, msg: msg, code: disc ? code : '' };
  }

  /* ---------- toast + cart bubble ---------- */
  function toast(msg, link) {
    var t = $('#vtm-toast');
    if (!t) { t = document.createElement('div'); t.id = 'vtm-toast'; document.body.appendChild(t); }
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (link ? ' <a href="' + link.href + '">' + esc(link.text) + '</a>' : '');
    t.className = 'show';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = ''; }, 3200);
  }
  function updateBubble() {
    var n = count(), a = $('#cart-icon-bubble');
    if (!a) return;
    $$('.cart-count-bubble', a).forEach(function (x) { x.remove(); });
    var b = $('.vtm-cart-count', a);
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'vtm-cart-count'; a.style.position = 'relative'; a.appendChild(b); }
    b.textContent = n;
  }

  /* ---------- scraping products ---------- */
  function abs(u) { try { return new URL(u, location.href).href; } catch (e) { return u || ''; } }
  function priceFrom(root) {
    var el = $('.price-item--sale', root) || $('.price__regular .price-item--regular', root) || $('.price-item--regular:not(s)', root) || $('.price-item', root);
    return num(el && el.textContent);
  }
  function fromProductPage(btn) {
    var info = btn.closest('product-info') || document;
    var h = $('h1', info) || $('h1');
    var img = $('.product__media img, media-gallery img, .product__media-item img', info) || $('.product__media img');
    var q = $('.quantity__input', info);
    return {
      id: location.pathname, title: clean(h && h.textContent) || document.title.split('|')[0].trim(),
      image: img ? abs(img.currentSrc || img.src) : '', price: priceFrom(info), url: abs(location.pathname),
      qty: Math.max(1, parseInt(q && q.value, 10) || 1)
    };
  }
  function fromCard(btn) {
    var el = btn;
    while (el && el !== document.body && !$('.card__heading', el)) el = el.parentElement;
    if (!el || el === document.body) return null;
    var a = $('.card__heading a', el) || $('a[href*="products"], a[href*="pages/"]', el);
    var img = $('.card__media img, img', el);
    var href = a ? abs(a.getAttribute('href')) : location.href;
    return {
      id: new URL(href).pathname, title: clean(a ? a.textContent : $('.card__heading', el).textContent),
      image: img ? abs(img.currentSrc || img.src) : '', price: priceFrom(el), url: href, qty: 1
    };
  }
  function addItem(p) {
    if (!p || !p.price) { toast('Sorry, could not add this item. Please try again.'); return false; }
    var c = getCart(), x = c.filter(function (i) { return i.id === p.id; })[0];
    if (x) x.qty += p.qty; else c.push(p);
    saveCart(c);
    return true;
  }
  function productFor(btn) { return btn.closest('.product-form') ? fromProductPage(btn) : fromCard(btn); }

  /* ---------- global click interception ---------- */
  /* WhatsApp links are intentionally handled by native anchor navigation (target=_blank).
     This keeps the storefront open while WhatsApp opens in a separate tab/app. */
  function goCheckout() { location.href = BASE + 'checkout.html'; }
  window.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a) {
      var h = a.getAttribute('href') || '';
      if (/^\/?(checkout|cart\/checkout)(\?|$|\/)/i.test(h) || /^https?:\/\/[^/]+\/checkout(\?|$|\/)/i.test(h)) {
        e.preventDefault(); e.stopImmediatePropagation(); del(K_ACTIVE); goCheckout(); return;
      }
    }
    var ck = e.target.closest && e.target.closest('[name="checkout"], .cart__checkout-button, #CartDrawer-Checkout, #checkout');
    if (ck) { e.preventDefault(); e.stopImmediatePropagation(); if (getCart().length) { del(K_ACTIVE); goCheckout(); } else toast('Your cart is empty – please add a product first.'); return; }
    var cartLink = e.target.closest('#cart-icon-bubble');
    if (cartLink) { e.preventDefault(); e.stopImmediatePropagation(); location.href = BASE + 'pages/cart.html'; return; }
    var b = e.target.closest('button');
    if (!b) return;
    var isBuy = b.hasAttribute('data-vtm-buy');
    var isAdd = b.hasAttribute('data-vtm-add') || b.name === 'add' || /^add to cart$/i.test(clean(b.textContent));
    if (!isBuy && !isAdd) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var p = productFor(b);
    if (!p || !p.price) { toast('Sorry, could not identify this product. Please try again.'); return; }
    if (isBuy) {
      /* Buy Now is a single-product checkout; never mix in items already saved in the cart. */
      write(K_ACTIVE, [p]);
      location.href = BASE + 'checkout.html';
    } else {
      del(K_ACTIVE);
      addItem(p);
      toast('Added to cart ✓', { href: BASE + 'pages/cart.html', text: 'View cart' });
    }
  }, true);
  window.addEventListener('submit', function (e) {
    var act = e.target.getAttribute ? e.target.getAttribute('action') : null;
    if (act == null) return;
    if (/cart\/add/.test(act)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    /* static site: Shopify cart/checkout forms must never be submitted (gives "file couldn't be accessed") */
    if (/(^|\/)(cart|checkout)(\.html)?(\?|$)/.test(act)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (getCart().length) { del(K_ACTIVE); goCheckout(); } else location.href = BASE + 'pages/cart.html';
    }
  }, true);

  /* ---------- shared renderers ---------- */
  function itemsHtml(cart, editable) {
    return cart.map(function (p, idx) {
      return '<div class="vtm-cart-item">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '') +
        '<div class="vtm-ci-info"><a class="vtm-ci-title" href="' + esc(p.url || '#') + '">' + esc(p.title) + '</a>' +
        '<div class="vtm-ci-price">' + inr(p.price) + '</div>' +
        (editable ? '<div class="vtm-qty"><button type="button" data-q="-1" data-i="' + idx + '" aria-label="Decrease">−</button><span>' + p.qty + '</span><button type="button" data-q="1" data-i="' + idx + '" aria-label="Increase">+</button>' +
          '<button type="button" class="vtm-remove" data-rm="' + idx + '">Remove</button></div>' : '<div class="vtm-ci-q">Qty: ' + p.qty + '</div>') +
        '</div><div class="vtm-ci-total">' + inr(p.price * p.qty) + '</div></div>';
    }).join('');
  }
  function totalsHtml(t) {
    return '<div class="vtm-totals"><div><span>Subtotal</span><b>' + inr(t.subtotal) + '</b></div>' +
      (t.discount ? '<div class="vtm-disc"><span>Discount (' + esc(t.code) + ')</span><b>− ' + inr(t.discount) + '</b></div>' : '') +
      '<div><span>Shipping</span><b>FREE</b></div><div class="vtm-grand"><span>Total</span><b>' + inr(t.total) + '</b></div></div>';
  }
  function couponHtml(code, t) {
    return '<div class="vtm-coupon"><input id="vtm-code" placeholder="Coupon code (e.g. VTM10)" value="' + esc(code || '') + '"><button type="button" id="vtm-apply" class="vtm-btn-sec">Apply</button></div>' +
      '<p class="vtm-couponmsg">' + (t.discount ? '✓ ' + esc(t.code) + ' applied – you save ' + inr(t.discount) : esc(t.msg)) + '</p>';
  }
  function bindCoupon(rerender) {
    var ap = $('#vtm-apply');
    if (!ap) return;
    ap.onclick = function () {
      var v = clean($('#vtm-code').value).toUpperCase();
      if (v) write(K_COUPON, v); else del(K_COUPON);
      rerender();
    };
  }
  function empty(msg) {
    return '<div class="vtm-empty"><h1>' + (msg || 'Your cart is empty') + '</h1><p>Browse our Vrindavan Tulsi Malas and add your favourites.</p><a class="vtm-btn" href="' + BASE + 'pages/all.html">Continue shopping</a></div>';
  }

  /* ---------- WhatsApp message ---------- */
  function waMessage(o) {
    var L = [];
    L.push('*✅ Order Placed – ' + CFG.brand + '*');
    L.push('Order ID: ' + o.id);
    L.push('Date: ' + o.date);
    L.push('');
    L.push('*Customer Details*');
    L.push('Name: ' + o.customer.name);
    L.push('Mobile: ' + o.customer.phone);
    if (o.customer.email) L.push('Email: ' + o.customer.email);
    L.push('Address: ' + o.customer.address);
    L.push('City: ' + o.customer.city + ', ' + o.customer.state + ' - ' + o.customer.pin);
    if (o.customer.note) L.push('Note: ' + o.customer.note);
    L.push('');
    L.push('*Items*');
    o.items.forEach(function (p, i) { L.push((i + 1) + '. ' + p.title + ' x ' + p.qty + ' = ' + inr(p.price * p.qty)); });
    L.push('');
    L.push('Subtotal: ' + inr(o.totals.subtotal));
    if (o.totals.discount) L.push('Discount (' + o.totals.code + '): -' + inr(o.totals.discount));
    L.push('Shipping: FREE');
    L.push('*Total: ' + inr(o.totals.total) + '*');
    L.push('');
    L.push('*Payment*');
    L.push('Method: UPI (' + CFG.upi + ')');
    L.push('Amount Paid: ' + inr(o.totals.total));
    L.push('Status: Paid – confirmed by customer (please verify in PhonePe)');
    L.push('UPI Txn / UTR: ' + (o.payment.utr || 'not provided'));
    return L.join('\n');
  }
  function waUrl(o) { return 'https://wa.me/' + CFG.wa + '?text=' + encodeURIComponent(waMessage(o)); }

  /* ---------- CART PAGE ---------- */
  function renderCart(root) {
    var cart = getCart();
    if (!cart.length) { root.innerHTML = empty(); return; }
    var code = read(K_COUPON, ''), t = totals(cart, code);
    root.innerHTML = '<h1>Your cart</h1><div class="vtm-grid"><section>' + itemsHtml(cart, true) + '</section>' +
      '<aside class="vtm-box"><h2>Order summary</h2>' + couponHtml(code, t) + totalsHtml(t) +
      '<a class="vtm-btn vtm-wide" href="' + BASE + 'checkout.html">Proceed to checkout</a>' +
      '<a class="vtm-link" href="' + BASE + 'pages/all.html">← Continue shopping</a>' +
      '<p class="vtm-note">🔒 Secure UPI payment • Free shipping across India</p></aside></div>';
    $$('[data-q]', root).forEach(function (b) {
      b.onclick = function () {
        var c = getCart(), i = +b.dataset.i; c[i].qty = Math.max(1, Math.min(99, c[i].qty + +b.dataset.q)); saveCart(c); renderCart(root);
      };
    });
    $$('[data-rm]', root).forEach(function (b) {
      b.onclick = function () { var c = getCart(); c.splice(+b.dataset.rm, 1); saveCart(c); renderCart(root); };
    });
    bindCoupon(function () { renderCart(root); });
  }

  /* ---------- CHECKOUT PAGE ---------- */
  var STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry', 'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu', 'Lakshadweep'];
  function newOrderId() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return 'VTM' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + Math.floor(1000 + Math.random() * 9000);
  }
  function renderCheckout(root) {
    var cart = getCheckoutCart();
    if (!cart.length) { root.innerHTML = empty(); return; }
    var code = read(K_COUPON, ''), t = totals(cart, code), c = read(K_CUST, {});
    var states = STATES.map(function (s) { return '<option' + (c.state === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
    root.innerHTML = '<h1>Checkout</h1><div class="vtm-grid">' +
      '<form id="vtm-order" class="vtm-box" novalidate><h2>Delivery details</h2>' +
      '<label>Full name *<input name="name" autocomplete="name" required value="' + esc(c.name) + '"></label>' +
      '<div class="vtm-row"><label>Mobile / WhatsApp no. *<input name="phone" inputmode="numeric" autocomplete="tel" maxlength="10" placeholder="10-digit number" required value="' + esc(c.phone) + '"></label>' +
      '<label>Email<input name="email" type="email" autocomplete="email" value="' + esc(c.email) + '"></label></div>' +
      '<label>Full address *<textarea name="address" rows="3" autocomplete="street-address" placeholder="House no., street, area, landmark" required>' + esc(c.address) + '</textarea></label>' +
      '<div class="vtm-row"><label>City *<input name="city" autocomplete="address-level2" required value="' + esc(c.city) + '"></label>' +
      '<label>PIN code *<input name="pin" inputmode="numeric" maxlength="6" autocomplete="postal-code" required value="' + esc(c.pin) + '"></label></div>' +
      '<label>State *<select name="state" required><option value="">Select state</option>' + states + '</select></label>' +
      '<label>Order note (optional)<input name="note" placeholder="Bead size, special request…" value="' + esc(c.note) + '"></label>' +
      '<h2>Payment</h2><div class="vtm-paymethod"><b>Pay with UPI</b><span>PhonePe • Google Pay • Paytm • any UPI app</span></div>' +
      '<p class="vtm-err" id="vtm-err"></p>' +
      '<button class="vtm-btn vtm-wide" type="submit">Continue to UPI payment →</button></form>' +
      '<aside class="vtm-box"><h2>Your order</h2>' + itemsHtml(cart, false) + couponHtml(code, t) + totalsHtml(t) +
      '<a class="vtm-link" href="' + BASE + 'pages/cart.html">← Edit cart</a></aside></div>';
    bindCoupon(function () { renderCheckout(root); });
    var f = $('#vtm-order');
    f.onsubmit = function (e) {
      e.preventDefault();
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = clean(v); });
      var err = '';
      if (d.name.length < 2) err = 'Please enter your full name.';
      else if (!/^[6-9]\d{9}$/.test(d.phone)) err = 'Enter a valid 10-digit mobile number.';
      else if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) err = 'Enter a valid email address.';
      else if (d.address.length < 8) err = 'Please enter your full address.';
      else if (!d.city) err = 'Please enter your city.';
      else if (!/^\d{6}$/.test(d.pin)) err = 'Enter a valid 6-digit PIN code.';
      else if (!d.state) err = 'Please select your state.';
      if (err) { $('#vtm-err').textContent = err; return; }
      write(K_CUST, d);
      var draft = read(K_DRAFT, null);
      write(K_DRAFT, { id: (draft && draft.id) || newOrderId(), customer: d });
      location.href = BASE + 'payment.html';
    };
  }

  /* ---------- PAYMENT PAGE ---------- */
  var K_PAYSTART = 'vtm_pay_started';
  function isMobile() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) || (window.matchMedia && matchMedia('(pointer:coarse)').matches && screen.width < 900); }
  function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }

  function renderPayment(root) {
    var cart = getCheckoutCart(), draft = read(K_DRAFT, null);
    if (!cart.length || !draft) { root.innerHTML = empty('No order to pay for'); return; }
    var code = read(K_COUPON, ''), t = totals(cart, code);
    var q = 'pa=' + CFG.upi + '&pn=' + encodeURIComponent(CFG.upiName) + '&am=' + t.total.toFixed(2) + '&cu=INR&tn=' + encodeURIComponent('Order ' + draft.id);
    var q2 = q;
    function intent(pkg) { return 'intent://pay?' + q2 + '#Intent;scheme=upi;' + (pkg ? 'package=' + pkg + ';' : '') + 'end'; }
    var apps = isIOS() ? [
      ['PhonePe', 'phonepe://pay?' + q, 'pp'],
      ['Google Pay', 'gpay://upi/pay?' + q, 'gp'],
      ['Paytm', 'paytmmp://pay?' + q, 'pt'],
      ['Other UPI apps', 'upi://pay?' + q, 'ot']
    ] : [
      ['PhonePe', intent('com.phonepe.app'), 'pp'],
      ['Google Pay', intent('com.google.android.apps.nbu.paisa.user'), 'gp'],
      ['Paytm', intent('net.one97.paytm'), 'pt'],
      ['Other UPI apps', intent(''), 'ot']
    ];
    var appHtml = isMobile()
      ? '<a class="vtm-btn vtm-wide vtm-payupi" data-pay href="upi://pay?' + q + '">📱 Pay ' + inr(t.total) + ' with UPI App</a><p class="vtm-or">Tap to open PhonePe / Google Pay / Paytm / any UPI app with the amount already filled. Or pick an app:</p><div class="vtm-apps">' +
        apps.map(function (a) { return '<a class="vtm-app vtm-app-' + a[2] + '" data-pay href="' + a[1] + '">' + a[0] + '</a>'; }).join('') + '</div>' +
        '<p class="vtm-note">Pay in your app, then come back to this page – we will ask you to confirm.</p><p class="vtm-or">— or scan this QR from another phone —</p>'
      : '<p class="vtm-note" style="margin:0 0 6px">On computer: scan this QR with any UPI app on your phone.</p>';
    root.innerHTML = '<h1>Pay with UPI</h1><div class="vtm-grid">' +
      '<section class="vtm-box vtm-paybox"><div class="vtm-amount">Amount to pay<b>' + inr(t.total) + '</b><small>Order ID: ' + esc(draft.id) + '</small></div>' +
      '<h2>Step 1 – Make the payment</h2>' + appHtml +
      '<img class="vtm-qr" src="' + BASE + 'images/upi-qr.jpg" alt="PhonePe UPI QR code">' +
      '<p class="vtm-note">While paying, enter exactly <b>' + inr(t.total) + '</b>.</p>' +
      '<div class="vtm-upiid"><span>UPI ID</span><code id="vtm-upiid">' + CFG.upi + '</code><button type="button" id="vtm-copy" class="vtm-btn-sec">Copy</button></div>' +
      '<p class="vtm-note">Payee: ' + CFG.upiName + ' (' + CFG.brand + ')</p></section>' +
      '<aside class="vtm-box"><h2>Step 2 – Confirm your payment</h2>' +
      '<p>After paying, tap the button below (or just come back to this page – we will ask automatically).</p>' +
      '<label>UPI Transaction ID / UTR (optional)<input id="vtm-utr" placeholder="e.g. 412345678901" autocomplete="off"></label>' +
      '<p class="vtm-err" id="vtm-err"></p>' +
      '<button class="vtm-btn vtm-wide" id="vtm-place" type="button">I have paid – Place order</button>' +
      '<p class="vtm-note">Your full order details will open in WhatsApp (+91 96107 46508) – just tap Send.</p>' +
      '<h2 class="vtm-mt">Order summary</h2>' + itemsHtml(cart, false) + totalsHtml(t) +
      '<a class="vtm-link" href="' + BASE + 'checkout.html">← Edit delivery details</a></aside></div>';

    function placeOrder(utr) {
      var d = new Date();
      var order = {
        id: draft.id,
        date: d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        customer: draft.customer, items: cart, totals: t,
        payment: { method: 'UPI', upi: CFG.upi, utr: utr || '', status: 'Paid – confirmed by customer' }
      };
      var orders = read(K_ORDERS, []); orders.push(order); write(K_ORDERS, orders); write(K_LAST, order);
      if (!read(K_ACTIVE, null)) del(K_CART);
      del(K_ACTIVE); del(K_COUPON); del(K_DRAFT); del(K_PAYSTART);
      try { window.open(waUrl(order), '_blank'); } catch (e) {}
      location.href = BASE + 'order-success.html';
    }
    function utrValue() {
      var u = clean(($('#vtm-utr') || {}).value).toUpperCase();
      if (u && !/^[A-Z0-9]{8,30}$/.test(u)) { var e = $('#vtm-err'); if (e) e.textContent = 'UTR looks invalid – clear it or enter the correct ID.'; return null; }
      return u;
    }
    $('#vtm-copy').onclick = function () {
      var b = this, done = function () { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = 'Copy'; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(CFG.upi).then(done, done); else done();
    };
    $('#vtm-place').onclick = function () { var u = utrValue(); if (u === null) return; placeOrder(u); };

    /* remember that a UPI app was opened */
    $$('[data-pay]', root).forEach(function (a) {
      a.addEventListener('click', function () { write(K_PAYSTART, { id: draft.id, ts: Date.now() }); });
    });

    /* when the customer comes back from the UPI app, ask to confirm */
    function showModal() {
      if ($('#vtm-modal')) return;
      var m = document.createElement('div'); m.id = 'vtm-modal';
      m.innerHTML = '<div class="vtm-modal-box"><h2>Payment complete?</h2><p>Did you pay <b>' + inr(t.total) + '</b> to <b>' + CFG.upiName + '</b> successfully?</p>' +
        '<label>UPI Transaction ID / UTR (optional)<input id="vtm-utr2" placeholder="12-digit ID from your app" autocomplete="off"></label>' +
        '<button class="vtm-btn vtm-wide" id="vtm-yes" type="button">Yes, payment done – Place order</button>' +
        '<button class="vtm-btn-sec vtm-wide" id="vtm-no" type="button">No, try again</button></div>';
      document.body.appendChild(m);
      $('#vtm-yes').onclick = function () {
        var u = clean($('#vtm-utr2').value).toUpperCase();
        if (u && !/^[A-Z0-9]{8,30}$/.test(u)) { $('#vtm-utr2').style.borderColor = '#c0392b'; return; }
        placeOrder(u);
      };
      $('#vtm-no').onclick = function () { del(K_PAYSTART); m.remove(); };
    }
    function checkReturn() {
      var f = read(K_PAYSTART, null);
      if (!f || f.id !== draft.id || Date.now() - f.ts < 2500) return;
      showModal();
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkReturn(); });
    window.addEventListener('pageshow', checkReturn);
    window.addEventListener('focus', checkReturn);
    checkReturn();
  }

  /* ---------- ORDER SUCCESS PAGE ---------- */
  function renderSuccess(root) {
    var o = read(K_LAST, null);
    if (!o) { root.innerHTML = empty('No recent order found'); return; }
    root.innerHTML = '<div class="vtm-success"><div class="vtm-tick">✓</div><h1>Order placed!</h1>' +
      '<p>Thank you, <b>' + esc(o.customer.name) + '</b>. Radhe Radhe 🙏</p>' +
      '<p class="vtm-oid">Order ID: <b>' + esc(o.id) + '</b></p></div>' +
      '<div class="vtm-grid"><section class="vtm-box"><h2>Order details</h2>' + itemsHtml(o.items, false) + totalsHtml(o.totals) +
      '<p class="vtm-note">Payment: UPI • Txn ID ' + esc(o.payment.utr || 'not provided') + '</p></section>' +
      '<aside class="vtm-box"><h2>Delivery address</h2><p>' + esc(o.customer.name) + '<br>' + esc(o.customer.address) + '<br>' + esc(o.customer.city) + ', ' + esc(o.customer.state) + ' - ' + esc(o.customer.pin) + '<br>📞 ' + esc(o.customer.phone) + '</p>' +
      '<h2 class="vtm-mt">Send details on WhatsApp</h2><p>If WhatsApp did not open automatically, tap below and press <b>Send</b> so we receive your order.</p>' +
      '<a class="vtm-btn vtm-wa vtm-wide" target="_blank" rel="noopener" href="' + waUrl(o) + '">Send order on WhatsApp</a>' +
      '<a class="vtm-link" href="' + BASE + 'index.html">Continue shopping</a></aside></div>';
  }

  /* ---------- boot ---------- */
  function waFloat() {
    if ($('#vtm-wa-float')) return;
    var a = document.createElement('a');
    a.id = 'vtm-wa-float'; a.href = 'https://api.whatsapp.com/send/?phone=' + CFG.wa + '&text=Radhe+Radhe&type=phone_number&app_absent=0'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'Chat on WhatsApp');
    a.innerHTML = '<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><path fill="#fff" d="M16.04 3C9.4 3 4.02 8.37 4.02 15c0 2.12.55 4.18 1.6 6L4 28l7.17-1.88A12 12 0 0 0 16.04 27C22.67 27 28.05 21.63 28.05 15S22.67 3 16.04 3zm0 21.98c-1.8 0-3.56-.49-5.1-1.4l-.37-.22-4.25 1.11 1.14-4.14-.24-.38A9.94 9.94 0 0 1 6.06 15c0-5.5 4.48-9.97 9.98-9.97S26.02 9.5 26.02 15s-4.48 9.98-9.98 9.98zm5.47-7.47c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.49-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>';
    document.body.appendChild(a);
  }
  function boot() {
    waFloat();
    updateBubble();
    var map = { '[data-vtm-cart]': renderCart, '[data-vtm-checkout]': renderCheckout, '[data-vtm-payment]': renderPayment, '[data-vtm-success]': renderSuccess };
    Object.keys(map).forEach(function (sel) { var el = $(sel); if (el) map[sel](el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('pageshow', updateBubble);
})();
