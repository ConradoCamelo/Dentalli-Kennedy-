"use strict";
/* ==========================================================
   DENTALLI — implantes-ads.js
   Landing page de Google Ads (implantes + prótese protocolo).
   Os links de WhatsApp e telefone são montados por /js/whatsapp.js.
   ========================================================== */

// Endpoint que recebe o formulário (Formspree, Google Apps Script, CRM...).
// Vazio = o lead segue para a página /obrigado e é enviado pelo WhatsApp.
const FORM_ENDPOINT = "";

const TRACK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"];
const TRACK_STORAGE = "dentalli_ads_tracking";
const LEAD_STORAGE = "dentalli_ads_lead";

window.dataLayer = window.dataLayer || [];

function safeGet(storage, key) {
  try { return storage.getItem(key); } catch (e) { return null; }
}
function safeSet(storage, key, value) {
  try { storage.setItem(key, value); } catch (e) { /* armazenamento bloqueado */ }
}

// ---------- UTM + GCLID: lê da URL e guarda para a sessão ----------
function getTracking() {
  const params = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(safeGet(sessionStorage, TRACK_STORAGE) || "{}"); } catch (e) { saved = {}; }

  TRACK_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) saved[key] = value;
  });

  safeSet(sessionStorage, TRACK_STORAGE, JSON.stringify(saved));
  return saved;
}

function fillHiddenFields(form, tracking) {
  TRACK_KEYS.forEach((key) => {
    const field = form.elements[key];
    if (field && tracking[key]) field.value = tracking[key];
  });
}

// ---------- Eventos de conversão (GTM) ----------
function setupTracking() {
  document.addEventListener("click", (e) => {
    const wa = e.target.closest("[data-whatsapp]");
    if (wa) {
      window.dataLayer.push({
        event: "click_whatsapp",
        wa_section: wa.dataset.section || wa.dataset.waContext || "desconhecida"
      });
      return;
    }
    if (e.target.closest("[data-tel-link]")) {
      window.dataLayer.push({ event: "click_phone" });
    }
  });
}

// ---------- Formulário ----------
function formatPhone(value) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function setupForm(tracking) {
  const form = document.getElementById("leadForm");
  if (!form) return;

  const errorBox = document.getElementById("formError");
  const phone = form.elements.whatsapp;
  fillHiddenFields(form, tracking);

  phone.addEventListener("input", () => { phone.value = formatPhone(phone.value); });

  const showError = (msg, field) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    if (field) field.focus();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const nome = form.elements.nome.value.trim();
    const digits = phone.value.replace(/\D/g, "");
    const interesse = form.querySelector('input[name="interesse"]:checked');

    if (nome.length < 2) return showError("Informe seu nome.", form.elements.nome);
    if (digits.length < 10) return showError("Informe um WhatsApp válido, com DDD.", phone);
    if (!interesse) return showError("Escolha o que você procura.", form.querySelector('input[name="interesse"]'));
    if (!form.elements.consentimento.checked) return showError("Para entrarmos em contato, marque a autorização.", form.elements.consentimento);

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Enviando...";

    const lead = { nome, whatsapp: phone.value, interesse: interesse.value };
    TRACK_KEYS.forEach((key) => { lead[key] = form.elements[key].value; });

    window.dataLayer.push({ event: "form_submit", lead_interesse: lead.interesse });

    if (FORM_ENDPOINT) {
      try {
        await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(lead)
        });
      } catch (err) { /* segue para a página de obrigado mesmo assim */ }
    }

    // Só nome e interesse vão para a página de obrigado (para a mensagem do WhatsApp)
    safeSet(sessionStorage, LEAD_STORAGE, JSON.stringify({ nome: lead.nome, interesse: lead.interesse }));
    location.href = "./obrigado/index.html";
  });
}

// ---------- Lightbox (casos e vídeo) ----------
function setupLightbox() {
  const box = document.querySelector(".lightbox");
  const body = document.querySelector(".lightboxBody");
  const close = document.querySelector(".lightboxClose");
  if (!box) return;
  let lastFocus = null;

  const open = (node) => {
    lastFocus = document.activeElement;
    body.replaceChildren(node);
    box.classList.add("is-open");
    box.setAttribute("aria-hidden", "false");
    close.focus();
  };
  const shut = () => {
    box.classList.remove("is-open");
    box.setAttribute("aria-hidden", "true");
    body.replaceChildren();
    if (lastFocus) lastFocus.focus();
  };

  document.querySelectorAll("[data-img]").forEach((card) => {
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const show = () => {
      const wrap = document.createElement("div");
      const img = document.createElement("img");
      img.src = card.dataset.img;
      img.alt = card.querySelector("img")?.alt || "";
      const cap = document.createElement("p");
      cap.textContent = card.dataset.title || "";
      wrap.append(img, cap);
      open(wrap);
    };
    card.addEventListener("click", show);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); }
    });
  });

  close.addEventListener("click", shut);
  box.addEventListener("click", (e) => { if (e.target === box) shut(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box.classList.contains("is-open")) shut(); });
}

// ---------- Vídeo em destaque: toca na própria página ----------
function setupFeaturedVideo() {
  const video = document.getElementById("featuredVideo");
  const play = document.getElementById("videoPlay");
  if (!video || !play) return;
  let completed = false;

  play.addEventListener("click", () => {
    play.hidden = true;
    video.controls = true;
    video.play().catch(() => { /* o usuário pode usar os controles nativos */ });
    window.dataLayer.push({ event: "video_play", video_name: "protocolo" });
  });

  video.addEventListener("ended", () => {
    if (completed) return;
    completed = true;
    window.dataLayer.push({ event: "video_complete", video_name: "protocolo" });
  });
}

// ---------- Mapa: carrega o iframe só quando chega perto da tela ----------
function setupMap() {
  const box = document.getElementById("mapBox");
  if (!box || !("IntersectionObserver" in window)) return;

  const obs = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    const iframe = document.createElement("iframe");
    iframe.src = box.dataset.mapSrc;
    iframe.title = "Mapa da Dentalli Presidente Kennedy";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    box.appendChild(iframe);
    obs.disconnect();
  }, { rootMargin: "300px" });
  obs.observe(box);
}

// ---------- Efeitos de rolagem ----------
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Marca os blocos que entram com animação; irmãos ganham atraso em cascata (--i)
const REVEAL_GROUPS = [
  [".sectionHead", ""],
  [".painCard", ""],
  [".caseFeatured", "revealZoom"],
  [".caseGrid .caseCard", "revealZoom"],
  [".offerCopy", "revealLeft"],
  [".priceCard", "revealZoom"],
  [".treatCard", ""],
  [".ratingCard", "revealZoom"],
  [".review", ""],
  [".doctorPhotoWrap", "revealLeft"],
  [".doctorGrid > div:last-child", ""],
  [".steps li", ""],
  [".diffItem", ""],
  [".faq details", ""],
  [".finalCopy", "revealLeft"],
  [".leadForm", ""],
  [".phoneFrame", "revealZoom"],
  [".centerCta", ""],
  [".legal", ""]
];

function setupReveal() {
  if (!("IntersectionObserver" in window) || REDUCED_MOTION) return;

  REVEAL_GROUPS.forEach(([selector, variant]) => {
    document.querySelectorAll(selector).forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.matches(selector));
      el.classList.add("reveal");
      if (variant) el.classList.add(variant);
      el.style.setProperty("--i", Math.min(siblings.indexOf(el), 5));
    });
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
    });
  }, { threshold: .15, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
}

// Números sobem de 0 até o valor quando aparecem na tela
function setupCounters() {
  const items = document.querySelectorAll("[data-count]");
  if (!items.length || REDUCED_MOTION || !("IntersectionObserver" in window)) return;

  const format = (value, decimals) =>
    value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const run = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    const start = performance.now();
    const duration = 1600;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (el.dataset.prefix || "") + format(target * eased, decimals);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      run(entry.target);
      obs.unobserve(entry.target);
    });
  }, { threshold: .6 });
  items.forEach((el) => obs.observe(el));
}

// Cabeçalho com vidro, barra de progresso, barra do celular e parallax da foto
function setupScrollChrome() {
  const topbar = document.getElementById("topbar");
  const progress = document.getElementById("scrollProgress");
  const mobileBar = document.querySelector(".mobileBar");
  const heroCta = document.querySelector(".hero .btnWa");
  const photo = document.querySelector("#doctorFrame img");
  const parallax = photo && !REDUCED_MOTION && window.matchMedia("(min-width: 900px)").matches;
  let ticking = false;

  const update = () => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (topbar) topbar.classList.toggle("is-scrolled", y > 40);
    if (progress) progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    // Mostra quando o botão do hero some atrás do cabeçalho fixo
    const headerH = topbar ? topbar.offsetHeight : 0;
    if (mobileBar && heroCta) mobileBar.classList.toggle("is-shown", heroCta.getBoundingClientRect().bottom < headerH);
    if (parallax && y < 900) photo.style.transform = `translateY(${y * 0.08}px) scale(1.06)`;
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

document.addEventListener("DOMContentLoaded", () => {
  const tracking = getTracking();
  setupTracking();
  setupForm(tracking);
  setupLightbox();
  setupFeaturedVideo();
  setupMap();
  setupReveal();
  setupCounters();
  setupScrollChrome();
  const ano = document.getElementById("ano");
  if (ano) ano.textContent = new Date().getFullYear();
});
