"use strict";
/* Facetas: carrossel de casos, galeria com ampliação e vídeos em loop */
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Carrossel do topo ---------- */
  document.querySelectorAll("[data-case-slider]").forEach(function (root) {
    var slides = root.querySelectorAll(".caseSlide");
    var dots = root.querySelectorAll(".caseSlider__dots button");
    if (slides.length < 2) return;
    var i = 0, timer = null, paused = false, startX = null;

    function load(n) {
      var img = slides[n].querySelector("img[data-src]");
      if (img) { img.src = img.getAttribute("data-src"); img.removeAttribute("data-src"); }
    }
    function go(n) {
      i = (n + slides.length) % slides.length;
      load(i); load((i + 1) % slides.length);
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === i); s.setAttribute("aria-hidden", k === i ? "false" : "true"); });
      dots.forEach(function (d, k) { d.classList.toggle("is-active", k === i); });
    }
    function start() { if (reduceMotion) return; clearInterval(timer); timer = setInterval(function () { if (!paused) go(i + 1); }, 3800); }

    dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k); start(); }); });
    root.addEventListener("mouseenter", function () { paused = true; });
    root.addEventListener("mouseleave", function () { paused = false; });
    root.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    root.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX; startX = null;
      if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); start(); }
    });
    go(0);
    start();
  });

  /* ---------- "Ver mais casos" no celular ---------- */
  var moreBtn = document.querySelector("[data-cases-more]");
  if (moreBtn) moreBtn.addEventListener("click", function () {
    var g = document.querySelector("[data-case-grid]");
    if (g) g.classList.add("is-expanded");
    moreBtn.parentNode.style.display = "none";
  });

  /* ---------- Galeria + ampliação ---------- */
  var grid = document.querySelector("[data-case-grid]");
  if (grid) {
    var items = Array.prototype.slice.call(grid.querySelectorAll("[data-full]"));
    var lb = document.createElement("div");
    lb.className = "caseLb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Caso ampliado");
    lb.innerHTML =
      '<span class="caseLb__count"></span>' +
      '<button class="caseLb__close" type="button" aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<button class="caseLb__prev" type="button" aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>' +
      '<img alt="" />' +
      '<button class="caseLb__next" type="button" aria-label="Próximo"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>';
    document.body.appendChild(lb);
    var img = lb.querySelector("img"), count = lb.querySelector(".caseLb__count"), cur = 0, lastFocus = null;

    function show(n) {
      cur = (n + items.length) % items.length;
      img.src = items[cur].getAttribute("data-full");
      img.alt = items[cur].querySelector("img").alt;
      count.textContent = (cur + 1) + " de " + items.length;
    }
    function open(n) { lastFocus = document.activeElement; show(n); lb.classList.add("is-open"); document.body.classList.add("caseLb-open"); lb.querySelector(".caseLb__close").focus(); }
    function close() { lb.classList.remove("is-open"); document.body.classList.remove("caseLb-open"); if (lastFocus) lastFocus.focus(); }

    items.forEach(function (b, k) { b.addEventListener("click", function () { open(k); }); });
    lb.querySelector(".caseLb__close").addEventListener("click", close);
    lb.querySelector(".caseLb__prev").addEventListener("click", function () { show(cur - 1); });
    lb.querySelector(".caseLb__next").addEventListener("click", function () { show(cur + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(cur - 1);
      if (e.key === "ArrowRight") show(cur + 1);
    });
    var sx = null;
    lb.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------- Vídeos: carregam perto da tela e tocam quando visíveis ---------- */
  var cards = document.querySelectorAll("[data-reel-video]");
  function playState(card, play) {
    var v = card.querySelector("video");
    if (play) { var p = v.play(); if (p && p.catch) p.catch(function () {}); card.classList.add("is-playing"); }
    else { v.pause(); card.classList.remove("is-playing"); }
  }
  cards.forEach(function (card) {
    var v = card.querySelector("video");
    card.addEventListener("click", function () {
      if (v.hasAttribute("data-src")) { v.src = v.getAttribute("data-src"); v.removeAttribute("data-src"); }
      card.dataset.userPaused = v.paused ? "" : "1";
      playState(card, v.paused);
    });
  });
  if ("IntersectionObserver" in window && cards.length) {
    var loader = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var v = en.target.querySelector("video[data-src]");
        if (v) { v.src = v.getAttribute("data-src"); v.removeAttribute("data-src"); v.load(); }
        loader.unobserve(en.target);
      });
    }, { rootMargin: "300px" });
    var player = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var card = en.target;
        if (reduceMotion || card.dataset.userPaused) return;
        playState(card, en.intersectionRatio >= 0.6);
      });
    }, { threshold: [0, 0.6] });
    cards.forEach(function (c) { loader.observe(c); player.observe(c); });
  } else {
    cards.forEach(function (c) { var v = c.querySelector("video[data-src]"); if (v) v.src = v.getAttribute("data-src"); });
  }
})();
