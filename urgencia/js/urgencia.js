function setupReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((i) => i.classList.add("is-visible"));
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: .12 }
  );
  items.forEach((item) => obs.observe(item));
}

function setupLiveClock() {
  const el = document.getElementById("liveClock");
  if (!el) return;
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Fortaleza"
  });
  const update = () => {
    el.textContent = fmt.format(new Date());
  };
  update();
  setInterval(update, 1000);
}

function setupMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  let loaded = false;

  const loadLeafletAsset = (tagName, attrs) => new Promise((resolve, reject) => {
    const el = document.createElement(tagName);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    el.onload = resolve;
    el.onerror = reject;
    document.head.appendChild(el);
  });

  const loadMap = async () => {
    if (loaded) return;
    loaded = true;

    if (!document.querySelector('link[data-leaflet-css]')) {
      await loadLeafletAsset("link", {
        rel: "stylesheet",
        href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
        "data-leaflet-css": "true"
      });
    }

    if (!window.L) {
      await loadLeafletAsset("script", {
        src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
        "data-leaflet-js": "true"
      });
    }

    const map = L.map(mapEl, {
      scrollWheelZoom: false
    }).setView([-3.741, -38.526], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap"
    }).addTo(map);

    const units = [
      { name: "Dentalli Fortaleza", coords: [-3.73186, -38.52667], bairro: "Fortaleza/CE" },
      { name: "Dentalli Aldeota", coords: [-3.73855, -38.49042], bairro: "Aldeota" },
      { name: "Dentalli Presidente Kennedy", coords: [-3.72780, -38.57060], bairro: "Presidente Kennedy" },
      { name: "Dentalli Dionísio Torres", coords: [-3.75210, -38.49760], bairro: "Dionísio Torres" },
      { name: "Dentalli Parangaba", coords: [-3.77687, -38.56704], bairro: "Parangaba" },
      { name: "Dentalli Montese", coords: [-3.76081, -38.55392], bairro: "Montese" },
      { name: "Dentalli Quintino Cunha", coords: [-3.75894, -38.60291], bairro: "Quintino Cunha" },
      { name: "Dentalli Cidade dos Funcionários", coords: [-3.79815, -38.49745], bairro: "Cidade dos Funcionários" },
      { name: "Dentalli Maraponga", coords: [-3.79918, -38.56847], bairro: "Maraponga" },
      { name: "Dentalli Messejana", coords: [-3.83353, -38.49483], bairro: "Messejana" },
      { name: "Dentalli Cajazeiras", coords: [-3.82483, -38.51562], bairro: "Cajazeiras" }
    ];

    units.forEach((unit) => {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${unit.coords[0]},${unit.coords[1]}`;

      L.marker(unit.coords)
        .addTo(map)
        .bindPopup(`<strong>${unit.name}</strong><br>${unit.bairro}<br><a href="${mapsUrl}" target="_blank" rel="noopener">Traçar rota</a>`)
        .bindTooltip(unit.bairro);
    });
  };

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      observer.disconnect();
      loadMap().catch(() => {
        mapEl.innerHTML = "<p style='color:#7a1210;padding:20px;text-align:center'>Não foi possível carregar o mapa agora.</p>";
      });
    }
  }, {
    rootMargin: "300px"
  });

  observer.observe(mapEl);
}

function setupShowcaseCarousel() {
  const grid = document.querySelector(".showcaseGrid");
  if (!grid) return;

  const isCarouselActive = () => window.matchMedia("(max-width: 768px)").matches;

  const originalCards = Array.from(grid.children);
  originalCards.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("tabindex", "-1");
    clone.classList.add("is-visible");
    grid.appendChild(clone);
  });

  let loopWidth = 0;
  let timer = null;

  const computeLoopWidth = () => {
    loopWidth = grid.scrollWidth / 2;
  };

  const tick = () => {
    grid.scrollLeft += 1;
    if (grid.scrollLeft >= loopWidth) {
      grid.scrollLeft -= loopWidth;
    }
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const start = () => {
    if (!isCarouselActive()) return;
    stop();
    computeLoopWidth();
    timer = setInterval(tick, 16);
  };

  grid.addEventListener("touchstart", stop, { passive: true });
  grid.addEventListener("mouseenter", stop);
  grid.addEventListener("touchend", () => setTimeout(start, 2500));
  grid.addEventListener("mouseleave", () => setTimeout(start, 1000));

  window.addEventListener("resize", () => {
    if (isCarouselActive()) {
      computeLoopWidth();
    } else {
      stop();
    }
  });

  start();
}

function setupExitPopup() {
  const overlay = document.getElementById("urgentOverlay");
  const closeBtn = document.getElementById("urgentClose");
  const noBtn = document.getElementById("urgentNo");
  const whatsapp = document.getElementById("popupUrgencia");

  if (!overlay || !whatsapp) return;

  const KEY_CLOSED = "dentalli_urgencia_popup_closed_until";
  const now = Date.now();
  const blockedUntil = Number(localStorage.getItem(KEY_CLOSED) || 0);

  if (blockedUntil > now) return;

  let opened = false;

  const openPopup = () => {
    if (opened) return;
    opened = true;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "popup_view" });
  };

  const closePopup = (days = 7) => {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    localStorage.setItem(KEY_CLOSED, String(Date.now() + days * 24 * 60 * 60 * 1000));
  };

  closeBtn?.addEventListener("click", () => closePopup(7));
  noBtn?.addEventListener("click", () => closePopup(14));

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePopup(7);
  });

  whatsapp.addEventListener("click", () => {
    localStorage.setItem(KEY_CLOSED, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
  });

  // Exit intent mobile - botão voltar
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    const lockBackButton = () => {
      history.pushState({ urgentPopup: true }, "", location.href);
    };

    setTimeout(lockBackButton, 800);

    window.addEventListener("popstate", () => {
      if (!overlay.classList.contains("is-open")) {
        openPopup();
        setTimeout(lockBackButton, 100);
      }
    });
  }

  // Exit intent desktop - mouse saindo pelo topo da janela
  document.addEventListener("mouseleave", (e) => {
    if (e.clientY <= 0) openPopup();
  });

  document.addEventListener("scroll", () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable > 0 && window.scrollY / scrollable >= 0.6) openPopup();
  }, { passive: true });
}

document.addEventListener("DOMContentLoaded", () => {
  setupReveal();
  setupLiveClock();
  setupShowcaseCarousel();
  setupMap();
  // setupExitPopup(); // Popup desativado a pedido da clínica

  document.querySelectorAll(".doctorMiniCard").forEach((doctorCard) => {
    setTimeout(() => doctorCard.classList.add("is-visible"), 450);
  });
});
