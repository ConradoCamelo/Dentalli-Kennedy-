/* Dentalli Presidente Kennedy — página de facetas de resina
   Comportamento visual (reveal no scroll, cabeçalho, ano do rodapé)
   Os links de WhatsApp e telefone são montados por ../js/whatsapp.js. */
(function () {
  'use strict';

  // Vídeos: só baixa o arquivo quando a pessoa toca na capa
  function setupVideos() {
    document.querySelectorAll(".vid[data-src]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var gate = btn.closest("[data-gate]");
        if (gate && !gate.classList.contains("is-open")) return;
        if (btn.classList.contains("is-playing")) return;
        var video = document.createElement("video");
        video.src = btn.getAttribute("data-src");
        video.controls = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.poster = btn.querySelector("img").src;
        btn.classList.add("is-playing");
        btn.replaceChildren(video);
        video.play().catch(function () {});
      });
    });
  }

  // Casos reais: imagens desfocadas até a pessoa escolher ver
  function setupGate() {
    document.querySelectorAll("[data-gate]").forEach(function (gate) {
      var open = function () { gate.classList.add("is-open"); };
      var btn = gate.querySelector("[data-gate-open]");
      if (btn) btn.addEventListener("click", open);
      gate.querySelectorAll(".gallery .photo, .gallery .vid").forEach(function (el) {
        el.addEventListener("click", function (e) {
          if (gate.classList.contains("is-open")) return;
          e.stopImmediatePropagation();
          open();
        }, true);
      });
    });
  }

  function setupReveal() {
    var items = document.querySelectorAll('.reveal');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { obs.observe(el); });
  }

  function setupHeader() {
    var header = document.querySelector('.header');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 10); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Barra fixa do celular: aparece só depois que os botões do topo saem da tela
  function setupMobileBar() {
    var bar = document.querySelector('.mbar');
    var heroActions = document.querySelector('.hero__actions');
    if (!bar || !heroActions) return;
    if (!('IntersectionObserver' in window)) { bar.classList.add('is-visible'); return; }
    new IntersectionObserver(function (entries) {
      var entry = entries[0];
      bar.classList.toggle('is-visible', !entry.isIntersecting && entry.boundingClientRect.top < 0);
    }).observe(heroActions);
  }

  function setupYear() {
    var y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupVideos();
    setupGate();
    setupReveal();
    setupHeader();
    setupMobileBar();
    setupYear();
  });
})();
