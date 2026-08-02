/* ============================================================
   Shree Capital — site interactions
   ============================================================ */
(function () {
  'use strict';

  var C = window.SCCalc;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var WA_NUMBER = '917300099621';

  /* ---------------- mobile nav ---------------- */
  var navToggle = $('#navToggle');
  var nav = $('#primaryNav');

  function closeNav() {
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  navToggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open && window.innerWidth <= 900 ? 'hidden' : '';
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  /* ---------------- hero carousel ---------------- */
  var slides = $$('.slide', $('#heroSlides'));
  var dotsWrap = $('#heroDots');
  var current = 0;
  var timer = null;
  var DELAY = 6500;

  slides.forEach(function (_, i) {
    var dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    if (i === 0) dot.classList.add('is-active');
    dot.addEventListener('click', function () { goTo(i); restart(); });
    dotsWrap.appendChild(dot);
  });
  var dots = $$('button', dotsWrap);

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === current); });
    dots.forEach(function (d, i) {
      d.classList.toggle('is-active', i === current);
      d.setAttribute('aria-selected', String(i === current));
    });
  }

  function next() { goTo(current + 1); }
  function start() { timer = setInterval(next, DELAY); }
  function stop() { clearInterval(timer); }
  function restart() { stop(); start(); }

  $('#heroNext').addEventListener('click', function () { next(); restart(); });
  $('#heroPrev').addEventListener('click', function () { goTo(current - 1); restart(); });

  var heroEl = $('.hero');
  heroEl.addEventListener('mouseenter', stop);
  heroEl.addEventListener('mouseleave', start);
  document.addEventListener('visibilitychange', function () {
    document.hidden ? stop() : restart();
  });

  /* swipe on touch devices */
  var touchX = null;
  heroEl.addEventListener('touchstart', function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
  heroEl.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : goTo(current - 1); restart(); }
    touchX = null;
  }, { passive: true });

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) start();

  /* ---------------- tabs ----------------
     Tab groups nest (Products > Deposits > FD), so each group only
     claims the tabs and panels that belong to it directly. */
  $$('[data-tabs]').forEach(function (group) {
    var own = function (el) { return el.closest('[data-tabs]') === group; };
    var tabs = $$('.tab', group).filter(own);
    var panels = $$('.panel', group).filter(own);

    function activate(index) {
      tabs.forEach(function (t, i) {
        t.classList.toggle('is-active', i === index);
        t.setAttribute('aria-selected', String(i === index));
      });
      panels.forEach(function (p, i) {
        p.classList.toggle('is-active', i === index);
        p.hidden = i !== index;
      });
      fitActive();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activate(i); });
      tab.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var n = (i + dir + tabs.length) % tabs.length;
        tabs[n].focus();
        activate(n);
      });
    });
  });

  /* ---------------- accordion ---------------- */
  $$('.acc__item').forEach(function (item) {
    var btn = $('.acc__q', item);
    var body = $('.acc__a', item);

    btn.addEventListener('click', function () {
      var open = item.classList.contains('is-open');
      $$('.acc__item').forEach(function (other) {
        other.classList.remove('is-open');
        $('.acc__q', other).setAttribute('aria-expanded', 'false');
        $('.acc__a', other).style.maxHeight = null;
      });
      if (!open) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
      fitActive();
    });
  });

  /* ---------------- counters ---------------- */
  function countUp(el) {
    var target = parseFloat(el.dataset.target) || 0;
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var duration = 1500;
    var startedAt = null;
    var settled = prefix + target.toLocaleString('en-IN') + suffix;

    /* the animation is decoration - guarantee the real number lands
       even if rAF is throttled or the tab was backgrounded */
    setTimeout(function () { el.textContent = settled; }, duration + 120);

    if (!window.requestAnimationFrame ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = settled;
      return;
    }

    function frame(now) {
      if (startedAt === null) startedAt = now;
      var progress = Math.min((now - startedAt) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString('en-IN') + suffix;
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     View router + fit guard

     The document never scrolls. Each nav target is a full-height
     .view; an in-page link activates the view that owns it and
     opens any tabs along the way. fit() then shrinks the view
     until its content fits the screen exactly: the box is sized
     1/--fit and zoomed back by --fit, so lowering --fit hands the
     content more logical space without changing its rendered box.
     ============================================================ */
  var views = $$('.view');
  var navLinks = $$('.nav__list a.nav__link');
  var MIN_FIT = 0.55;

  function viewFor(id) {
    var el = id ? document.getElementById(id) : null;
    if (!el) return null;
    return el.classList.contains('view') ? el : el.closest('.view');
  }

  function activeView() {
    return views.filter(function (v) { return v.classList.contains('is-active'); })[0];
  }

  /* How many pixels of content are spilling out of this view? The
     inner box and the panels are height:100%, so an overrun shows
     up as scrollHeight > clientHeight on one of them rather than
     on the view itself. */
  function overflowOf(view) {
    var worst = 0;
    [$('.view__inner', view), $('.view__body', view)]
      .concat($$('.panel.is-active', view)).forEach(function (el) {
      if (!el) return;
      var over = el.scrollHeight - el.clientHeight;
      if (over > worst) worst = over;
    });
    return worst;
  }

  function fit(view) {
    view.style.setProperty('--fit', '1');
    for (var i = 0; i < 6; i++) {
      var avail = view.clientHeight;
      var over = overflowOf(view);
      if (!avail || over <= 1) break;
      var cur = Number(view.style.getPropertyValue('--fit')) || 1;
      var next = Math.max(MIN_FIT, cur * (avail / (avail + over)));
      if (next >= cur - 0.004) break;
      view.style.setProperty('--fit', String(next));
    }
  }

  function fitActive() {
    var view = activeView();
    if (!view) return;
    fit(view);
    /* re-check once the browser has settled (fonts, images, reflow) */
    if (window.requestAnimationFrame) requestAnimationFrame(function () { fit(view); });
  }

  /* open every tab between a view and a deep-linked target */
  function openTabFor(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var chain = [];
    for (var node = el; node && node !== document.body; node = node.parentNode) {
      if (node.classList && node.classList.contains('panel')) chain.push(node);
    }
    chain.reverse().forEach(function (panel) {
      var tab = document.querySelector('.tab[aria-controls="' + panel.id + '"]');
      if (tab && !tab.classList.contains('is-active')) tab.click();
    });
  }

  var counted = false;
  function showView(view, targetId) {
    if (!view) return;
    views.forEach(function (v) { v.classList.toggle('is-active', v === view); });
    /* a product screen keeps Products lit in the nav */
    var navHref = view.dataset.nav || '#' + view.id;
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === navHref);
    });
    if (targetId && targetId !== view.id) openTabFor(targetId);
    if (view.id === 'about' && !counted) {
      counted = true;
      $$('.count', view).forEach(countUp);
    }
    fit(view);
  }

  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      var view = viewFor(id);
      if (!view) return;
      e.preventDefault();
      /* push, don't replace: each screen is its own history entry so
         the browser back button walks back through them */
      if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
      showView(view, id);
      if (window.innerWidth <= 900) closeNav();
    });
  });

  function fromLocation() {
    var id = location.hash.slice(1);
    showView(viewFor(id) || views[0], id);
  }
  window.addEventListener('popstate', fromLocation);
  window.addEventListener('hashchange', fromLocation);

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitActive, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitActive);
  window.addEventListener('load', fitActive);

  /* honour a deep link on first paint, else show Home */
  showView(viewFor(location.hash.slice(1)) || views[0], location.hash.slice(1));

  /* ============================================================
     Calculators — each input is paired with a slider of the same
     id + "R"; changing either keeps the other in sync.
     ============================================================ */
  function bind(ids, render) {
    ids.forEach(function (id) {
      var input = document.getElementById(id);
      var range = document.getElementById(id + 'R');
      if (!input) return;

      input.addEventListener('input', function () {
        if (range) range.value = C.clamp(Number(input.value), Number(range.min), Number(range.max));
        render();
      });
      input.addEventListener('blur', function () {
        input.value = C.clamp(Number(input.value), Number(input.min), Number(input.max));
        render();
      });
      if (range) {
        range.addEventListener('input', function () {
          input.value = range.value;
          render();
        });
      }
    });
    render();
  }

  function val(id) {
    var el = document.getElementById(id);
    return C.clamp(Number(el.value), Number(el.min), Number(el.max));
  }

  function setBar(barId, partA, total) {
    var bar = document.getElementById(barId);
    var pct = total > 0 ? Math.max(0, Math.min(100, (partA / total) * 100)) : 50;
    bar.children[0].style.width = pct + '%';
    bar.children[1].style.width = (100 - pct) + '%';
  }

  function text(id, value) { document.getElementById(id).textContent = value; }

  /* --- EMI --- */
  function renderEmi() {
    var p = val('emiAmount'), r = val('emiRate'), n = val('emiTenure');
    var monthly = C.emi(p, r, n);
    var total = monthly * n;
    var interest = total - p;

    text('emiOut', C.money(monthly));
    text('emiPrincipal', C.money(p));
    text('emiInterest', C.money(interest));
    text('emiTotal', C.money(total));
    setBar('emiBar', p, total);
  }
  bind(['emiAmount', 'emiRate', 'emiTenure'], renderEmi);

  /* --- FD --- */
  function renderFd() {
    var p = val('fdAmount'), r = val('fdRate'), n = val('fdTenure');
    var freq = Number(document.getElementById('fdCompound').value);
    var maturity = C.fdMaturity(p, r, n, freq);
    var earned = maturity - p;

    text('fdOut', C.money(maturity));
    text('fdInvested', C.money(p));
    text('fdEarned', C.money(earned));
    text('fdGrowth', (p > 0 ? ((earned / p) * 100).toFixed(1) : '0') + '%');
    setBar('fdBar', p, maturity);
  }
  bind(['fdAmount', 'fdRate', 'fdTenure'], renderFd);
  document.getElementById('fdCompound').addEventListener('change', renderFd);

  /* --- RD --- */
  function renderRd() {
    var p = val('rdAmount'), r = val('rdRate'), n = val('rdTenure');
    var maturity = C.rdMaturity(p, r, n);
    var invested = p * n;

    text('rdOut', C.money(maturity));
    text('rdInvested', C.money(invested));
    text('rdEarned', C.money(maturity - invested));
    text('rdCount', String(n));
    setBar('rdBar', invested, maturity);
  }
  bind(['rdAmount', 'rdRate', 'rdTenure'], renderRd);

  /* --- MIS --- */
  function renderMis() {
    var p = val('misAmount'), r = val('misRate'), n = val('misTenure');
    var monthly = C.misIncome(p, r);
    var totalIncome = monthly * n;

    text('misOut', C.money(monthly));
    text('misPrincipal', C.money(p));
    text('misTotal', C.money(totalIncome));
    text('misYearly', C.money(monthly * 12));
    setBar('misBar', p, p + totalIncome);
  }
  bind(['misAmount', 'misRate', 'misTenure'], renderMis);

  /* --- Loan eligibility (50% FOIR) --- */
  function renderElig() {
    var income = val('eligIncome'), obligation = val('eligObligation');
    var r = val('eligRate'), n = val('eligTenure');
    var affordable = Math.max(0, income * 0.5 - obligation);
    var eligible = C.principalFromEmi(affordable, r, n);

    text('eligOut', C.money(eligible));
    text('eligEmi', C.money(affordable));
    text('eligLeft', C.money(Math.max(0, income - affordable - obligation)));
    setBar('eligBar', affordable, income);
  }
  bind(['eligIncome', 'eligObligation', 'eligRate', 'eligTenure'], renderElig);

  /* ---------------- enquiry form ---------------- */
  var form = $('#enquiryForm');
  var status = $('#formStatus');
  var productField = $('#fProduct');

  /* "Enquire Now" buttons preselect the product they belong to */
  $$('[data-prefill]').forEach(function (el) {
    el.addEventListener('click', function () {
      var wanted = el.dataset.prefill;
      var match = $$('option', productField).filter(function (o) {
        return o.value === wanted || o.value.indexOf(wanted) === 0;
      })[0];
      if (match) productField.value = match.value;
      else productField.value = wanted === 'Loan' ? 'Individual Loan' : productField.value;
      productField.closest('.field').classList.remove('has-error');
    });
  });

  function showError(id, message) {
    var input = document.getElementById(id);
    input.closest('.field').classList.add('has-error');
    $('[data-err="' + id + '"]').textContent = message;
  }

  function clearErrors() {
    $$('.field.has-error', form).forEach(function (f) { f.classList.remove('has-error'); });
  }

  function validate() {
    clearErrors();
    var ok = true;
    var name = $('#fName').value.trim();
    var phone = $('#fPhone').value.replace(/\D/g, '');
    var email = $('#fEmail').value.trim();

    if (name.length < 2) { showError('fName', 'Please enter your name.'); ok = false; }
    if (!/^[6-9]\d{9}$/.test(phone)) { showError('fPhone', 'Enter a valid 10-digit Indian mobile number.'); ok = false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showError('fEmail', 'Enter a valid email address.'); ok = false; }
    if (!productField.value) { showError('fProduct', 'Please choose a product.'); ok = false; }
    return ok;
  }

  function summary() {
    var amount = $('#fAmount').value;
    var lines = [
      'New enquiry from the Shree Capital website',
      '',
      'Name: ' + $('#fName').value.trim(),
      'Mobile: ' + $('#fPhone').value.trim(),
      'Email: ' + ($('#fEmail').value.trim() || '-'),
      'Interested in: ' + productField.value,
      'Amount: ' + (amount ? C.money(Number(amount)) : '-'),
      'Message: ' + ($('#fMessage').value.trim() || '-')
    ];
    return lines.join('\n');
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.add('is-visible');
    status.classList.toggle('is-error', !!isError);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) {
      setStatus('Please correct the highlighted fields.', true);
      return;
    }
    /* Static site: hand the enquiry to the member's mail client. */
    var subject = 'Website enquiry — ' + productField.value;
    window.location.href = 'mailto:info.shreecapital26@gmail.com'
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(summary());
    setStatus('Opening your email app. If nothing happens, call us on 73000 99621.');
  });

  $('#waSend').addEventListener('click', function () {
    if (!validate()) {
      setStatus('Please correct the highlighted fields.', true);
      return;
    }
    window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(summary()), '_blank', 'noopener');
    setStatus('Opening WhatsApp with your enquiry.');
  });

  /* ---------------- misc ---------------- */
  $('#year').textContent = String(new Date().getFullYear());
})();
