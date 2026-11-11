function setupReveal(){
  const items = document.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){ items.forEach(i=>i.classList.add('is-visible')); return; }
  const obs = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){ entry.target.classList.add('is-visible'); obs.unobserve(entry.target); }
    });
  },{threshold:.12});
  items.forEach(item=>obs.observe(item));
}

function setupLightbox(){
  const box = document.querySelector('.lightbox');
  const body = document.querySelector('.lightboxBody');
  const close = document.querySelector('.lightboxClose');
  if(!box || !body) return;
  const open = html => { body.innerHTML = html; box.classList.add('is-open'); box.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; };
  const shut = () => { box.classList.remove('is-open'); box.setAttribute('aria-hidden','true'); body.innerHTML=''; document.body.style.overflow=''; };
  document.querySelectorAll('[data-img]').forEach(card=>{
    card.addEventListener('click',()=>open(`<img src="${card.dataset.img}" alt="${card.dataset.title || 'Prótese dentária Dentalli'}"><p style="font-weight:900;font-size:20px;margin-top:14px">${card.dataset.title || 'Prótese Dentalli'}</p>`));
  });
  close?.addEventListener('click',shut);
  box.addEventListener('click',e=>{ if(e.target===box) shut(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') shut(); });
}

function setupPromoPopup(){
  const overlay = document.getElementById('promoOverlay');
  const closeBtn = document.getElementById('promoClose');
  const noBtn = document.getElementById('promoNo');
  const gift = document.getElementById('promoGift');
  const reveal = document.getElementById('promoReveal');
  const codeEl = document.getElementById('promoCode');
  const timerEl = document.getElementById('promoTimer');
  const whatsapp = document.getElementById('popupProtese');

  if (!overlay || !gift || !reveal || !codeEl || !timerEl || !whatsapp) return;

  const KEY_CLOSED = 'dentalli_protese_promo_closed_until';
  const KEY_REDEEMED = 'dentalli_protese_promo_redeemed_until';
  const KEY_CODE = 'dentalli_protese_promo_code';
  const KEY_END = 'dentalli_protese_promo_timer_end';

  const now = Date.now();
  const blockedUntil = Math.max(
    Number(localStorage.getItem(KEY_CLOSED) || 0),
    Number(localStorage.getItem(KEY_REDEEMED) || 0)
  );

  if (blockedUntil > now) return;

  let opened = false;

  let code = localStorage.getItem(KEY_CODE);
  if (!code) {
    code = 'PROT-' + Math.floor(10000 + Math.random() * 89999);
    localStorage.setItem(KEY_CODE, code);
  }
  codeEl.textContent = code;

  let timerEnd = Number(localStorage.getItem(KEY_END) || 0);
  if (!timerEnd || timerEnd < now) {
    timerEnd = now + 5 * 60 * 1000;
    localStorage.setItem(KEY_END, String(timerEnd));
  }

  const updateTimer = () => {
    const diff = Math.max(0, timerEnd - Date.now());
    const min = String(Math.floor(diff / 60000)).padStart(2, '0');
    const sec = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    timerEl.textContent = `${min}:${sec}`;
  };
  updateTimer();
  setInterval(updateTimer, 1000);

  const openPopup = () => {
    if (opened) return;
    opened = true;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "popup_view" });
  };

  const closePopup = (days = 7) => {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    localStorage.setItem(KEY_CLOSED, String(Date.now() + days * 24 * 60 * 60 * 1000));
  };

  const revealCode = () => {
    gift.style.display = 'none';
    reveal.hidden = false;
    reveal.removeAttribute('hidden');
    reveal.style.display = 'block';

    whatsapp.dataset.codigo = code;
    whatsapp.href = window.buildWhatsAppUrl(whatsapp.dataset.waContext, { codigo: code });
  };

  gift.addEventListener('click', (e) => {
    e.preventDefault();
    revealCode();
  });

  closeBtn?.addEventListener('click', () => closePopup(7));
  noBtn?.addEventListener('click', () => closePopup(7));

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup(7);
  });

  whatsapp.addEventListener('click', () => {
    localStorage.setItem(KEY_REDEEMED, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  });

  // Exit intent mobile - botão voltar
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    const lockBackButton = () => {
      history.pushState({ promoPopup: true }, '', location.href);
    };
    setTimeout(lockBackButton, 800);
    window.addEventListener('popstate', () => {
      if (!overlay.classList.contains('is-open')) {
        openPopup();
        setTimeout(lockBackButton, 100);
      }
    });
  }

  // Exit intent desktop - mouse saindo pelo topo da janela
  document.addEventListener('mouseleave', (e) => {
    if (e.clientY <= 0) openPopup();
  });

  document.addEventListener('scroll', () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable > 0 && window.scrollY / scrollable >= 0.6) openPopup();
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded',()=>{
  setupReveal();
  setupLightbox();
  // setupPromoPopup(); // Popup desativado a pedido da clínica
});
