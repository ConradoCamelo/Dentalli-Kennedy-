function setupReveal(){const obs=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');obs.unobserve(e.target)}})},{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));}
function setupHeroBg(){const imgs=[...document.querySelectorAll('.heroBg img')];let i=0;if(!imgs.length)return;setInterval(()=>{imgs[i].classList.remove('is-active');i=(i+1)%imgs.length;imgs[i].classList.add('is-active')},3400);}
function setupLightbox(){const box=document.querySelector('.lightbox');const body=document.querySelector('.lightboxBody');const close=document.querySelector('.lightboxClose');function open(html){body.innerHTML=html;box.classList.add('is-open');box.setAttribute('aria-hidden','false');}function shut(){box.classList.remove('is-open');box.setAttribute('aria-hidden','true');body.innerHTML='';}document.querySelectorAll('[data-img]').forEach(card=>card.addEventListener('click',()=>open(`<img src="${card.dataset.img}" alt="${card.dataset.title||'Caso real'}"><p style="color:white;font:700 20px Inter,Arial;margin:16px 0 0">${card.dataset.title||'Caso real Dentalli'}</p>`)));document.querySelectorAll('[data-open-video]').forEach(card=>card.addEventListener('click',()=>open(`<video src="${card.dataset.openVideo}" controls autoplay playsinline></video>`)));close?.addEventListener('click',shut);box?.addEventListener('click',e=>{if(e.target===box)shut()});document.addEventListener('keydown',e=>{if(e.key==='Escape')shut()});}
setupReveal();setupHeroBg();setupLightbox();

function setupGiftPopup(){
  const popup = document.getElementById('giftPopup');
  const close = document.getElementById('giftClose');
  const prize = document.getElementById('giftPrize');

  if(!popup || !close || !prize) return;

  const prizes = [
    'Limpeza de cortesia',
    '10% OFF no planejamento',
    '50% OFF no clareamento',
    'Avaliação com prioridade'
  ];
const alreadyShown = sessionStorage.getItem('dentalliGiftShown');
if(alreadyShown) return;


  setTimeout(() => {
    const selectedPrize = prizes[Math.floor(Math.random() * prizes.length)];

    prize.textContent = selectedPrize;
    popup.classList.add('is-open');
    popup.setAttribute('aria-hidden', 'false');
   // sessionStorage.setItem('dentalliGiftShown', 'true');
  }, 5000);

  close.addEventListener('click', () => {
    popup.classList.remove('is-open');
    popup.setAttribute('aria-hidden', 'true');
  });

  popup.addEventListener('click', (e) => {
    if(e.target === popup){
      popup.classList.remove('is-open');
      popup.setAttribute('aria-hidden', 'true');
    }
  });
}

function setupPromoPopup(){
  const overlay = document.getElementById('promoOverlay');
  const closeBtn = document.getElementById('promoClose');
  const noBtn = document.getElementById('promoNo');
  const gift = document.getElementById('promoGift');
  const reveal = document.getElementById('promoReveal');
  const codeEl = document.getElementById('promoCode');
  const timerEl = document.getElementById('promoTimer');
  const whatsapp = document.getElementById('popupImplantes');

  if (!overlay || !gift || !reveal || !codeEl || !timerEl || !whatsapp) return;

  const KEY_CLOSED = 'dentalli_implantes_promo_closed_until';
  const KEY_REDEEMED = 'dentalli_implantes_promo_redeemed_until';
  const KEY_CODE = 'dentalli_implantes_promo_code';
  const KEY_END = 'dentalli_implantes_promo_timer_end';

  const now = Date.now();
  const blockedUntil = Math.max(
    Number(localStorage.getItem(KEY_CLOSED) || 0),
    Number(localStorage.getItem(KEY_REDEEMED) || 0)
  );

  if (blockedUntil > now) return;

  let opened = false;

  let code = localStorage.getItem(KEY_CODE);
  if (!code) {
    code = 'IMPL-' + Math.floor(10000 + Math.random() * 89999);
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

document.addEventListener('DOMContentLoaded', () => {
  // setupGiftPopup(); // Popup desativado a pedido da clínica
  // setupPromoPopup(); // Popup desativado a pedido da clínica
});