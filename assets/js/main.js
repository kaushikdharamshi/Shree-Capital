/* ============================================================
   Shree Capital — site interactions
   ============================================================ */
(function () {
  'use strict';

  var C = window.SCCalc;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var WA_NUMBER = '917300099621';

  /* ---------------- header: shadow on scroll ---------------- */
  var header = $('#header');
  var toTop = $('#toTop');

  function onScroll() {
    var y = window.pageYOffset;
    header.classList.toggle('is-stuck', y > 40);
    toTop.classList.toggle('is-visible', y > 600);
    /* near the top, Home is always the current section */
    if (y < 260) {
      $$('.nav__list a.nav__link').forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('href') === '#home');
      });
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

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

  /* ---------------- products dropdown ---------------- */
  var drop = $('.has-drop');
  var dropBtn = $('.nav__drop');

  dropBtn.addEventListener('click', function (e) {
    e.preventDefault();
    var open = drop.classList.toggle('is-open');
    dropBtn.setAttribute('aria-expanded', String(open));
  });

  drop.addEventListener('mouseenter', function () {
    if (window.innerWidth > 900) { drop.classList.add('is-open'); dropBtn.setAttribute('aria-expanded', 'true'); }
  });
  drop.addEventListener('mouseleave', function () {
    if (window.innerWidth > 900) { drop.classList.remove('is-open'); dropBtn.setAttribute('aria-expanded', 'false'); }
  });

  document.addEventListener('click', function (e) {
    if (!drop.contains(e.target) && window.innerWidth > 900) {
      drop.classList.remove('is-open');
      dropBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      drop.classList.remove('is-open');
      dropBtn.setAttribute('aria-expanded', 'false');
      closeNav();
    }
  });

  /* close the mobile drawer after tapping any in-page link */
  $$('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function () {
      drop.classList.remove('is-open');
      dropBtn.setAttribute('aria-expanded', 'false');
      if (window.innerWidth <= 900) closeNav();
    });
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

  /* ---------------- tabs ---------------- */
  $$('[data-tabs]').forEach(function (group) {
    var tabs = $$('.tab', group);
    var panels = $$('.panel', group);

    function activate(index) {
      tabs.forEach(function (t, i) {
        t.classList.toggle('is-active', i === index);
        t.setAttribute('aria-selected', String(i === index));
      });
      panels.forEach(function (p, i) {
        p.classList.toggle('is-active', i === index);
        p.hidden = i !== index;
      });
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

  /* deep links such as #mis or #group-loan open the right tab */
  function openTabFor(hash) {
    var id = (hash || '').replace('#', '');
    if (!id) return;
    var tab = document.querySelector('[aria-controls="' + id + '"]');
    if (tab && !tab.classList.contains('is-active')) tab.click();
  }
  window.addEventListener('hashchange', function () { openTabFor(location.hash); });
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () { openTabFor(a.getAttribute('href')); });
  });
  openTabFor(location.hash);

  /* ---------------- rate switcher ---------------- */
  var rateBtns = $$('.switcher__btn', $('#rateSwitch'));
  var rateTables = { deposit: $('#rateDeposit'), loan: $('#rateLoan') };

  rateBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var kind = btn.dataset.rate;
      rateBtns.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      Object.keys(rateTables).forEach(function (key) {
        rateTables[key].hidden = key !== kind;
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
    });
  });

  /* ---------------- reveal on scroll + counters ---------------- */
  var revealables = $$('.reveal');
  var counters = $$('.count');

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    revealables.forEach(function (el) { io.observe(el); });

    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        co.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { co.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
    counters.forEach(countUp);
  }

  function countUp(el) {
    var target = parseFloat(el.dataset.target) || 0;
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var duration = 1500;
    var startedAt = null;

    function frame(now) {
      if (startedAt === null) startedAt = now;
      var progress = Math.min((now - startedAt) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString('en-IN') + suffix;
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- scroll spy ---------------- */
  var navLinks = $$('.nav__list a.nav__link');
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { so.observe(s); });
  }

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
    window.location.href = 'mailto:info@shreecapital.coop'
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
