"use strict";
/* ==========================================================
   DENTALLI — whatsapp.js
   Arquivo ÚNICO para todas as páginas do site.
   Editar aqui: número de WhatsApp, número de telefone (Ligar)
   e o texto de cada mensagem, organizado por página.

   Este arquivo expõe window.buildWhatsAppUrl globalmente,
   usado tanto pelos botões estáticos [data-whatsapp] quanto
   pelas funções revealCode() de cada página (popups de cupom).
   ========================================================== */

// ---------- CONFIGURAÇÕES GERAIS (editar só aqui) ----------
const WHATSAPP_NUMBER = "5585992604260"; // usado nos links wa.me
const PHONE_NUMBER    = "5585992604260"; // usado nos links "Ligar" (tel:)

// ---------- MENSAGENS POR PÁGINA / BOTÃO ----------
const WA_MESSAGES = {

  // ================= HOME (/) =================
  wppMenuMobileHome: "Olá! Vim pelo do site da Dentalli.",
  wppHeroHome: "Olá! Vim pelo site da Dentalli e preciso de atendimento odontológico.",
  wppCardAtendimentoHome: "Olá! Vim pelo site da Dentalli e preciso de atendimento odontológico.",
  wppCardCirurgiasHome: "Olá! Vim pelo site da Dentalli e preciso de atendimento odontológico.",
  wppEspecialidadeImplanteHome: "Olá! Quero informações sobre implante dentário.",
  wppEspecialidadeCanalHome: "Olá! Estou com dor e quero informações sobre tratamento de canal.",
  wppEspecialidadeExtracaoHome: "Olá! Quero informações sobre Extração de Dente.",
  wppEspecialidadePediatriaHome: "Olá! Quero informações sobre atendimento pra Criança.",
  wppEspecialidadeFacetasHome: "Olá! Quero informações sobre facetas de resina.",
  wppEspecialidadeProteseHome: "Olá! Quero informações sobre prótese dentária.",
  wppEspecialidadeProteseParafusadaHome: "Olá! Quero informações sobre Prótese Fixa Parafusada sobre Implantes.",
  wppEspecialidadeRestauracaoHome: "Olá! Quero informações sobre Restauração dentária.",
  wppEspecialidadeConsertoProteseHome: "Olá! Quero informações sobre Conserto de Prótese dentária.",
  wppEspecialidadeGengivoplastiaHome: "Olá! Quero informações sobre procedimento de Gengivoplastia.",
  wppEspecialidadeAparelhoHome: "Olá! Quero informações sobre tratamento com Aparelho Odontológico.",
  wppEspecialidadeDenteQuebradoHome: "Olá! Preciso de atendimento odontológico imediato e de urgência.",
  wppUrgenciaHome: "Olá! Preciso de atendimento odontológico de urgência.",
  wppContatoHome: "Olá! Vim pelo site da Dentalli e preciso de atendimento odontológico.",
  wppFlutuanteHome: "Olá! Gostaria de informações referente ao atendimento com Dentista.",
  popupHome: "Olá! Recebi uma Condição Exclusiva Dentalli no site.\n\nMeu código é: {{codigo}}\n\nGostaria de validar minha condição.",

  // ================= URGÊNCIA (/urgencia/) =================
  wppHeroUrgencia: "Olá! Preciso de atendimento odontológico de urgência.",
  wppIndicacaoDorUrgencia: "Olá! Estou com dor de dente e preciso de atendimento com urgência.",
  wppIndicacaoDenteQuebradoUrgencia: "Olá! Quebrei um dente e preciso de atendimento imediato.",
  wppIndicacaoCanalUrgencia: "Olá! Estou com dor e acho que preciso de tratamento de canal com urgência.",
  wppIndicacaoProteseQuebradaUrgencia: "Olá! Minha prótese quebrou e preciso de conserto com urgência.",
  wppIndicacaoProteseUrgenciaUrgencia: "Olá! Minha prótese está machucando e preciso de um ajuste com urgência.",
  wppIndicacaoImplanteUrgencia: "Olá! Estou com dor ou desconforto no meu implante e preciso de avaliação.",
  wppIndicacaoLimpezaImplanteUrgencia: "Olá! Quero agendar a limpeza e manutenção do meu implante.",
  wppIndicacaoMauHalitoUrgencia: "Olá! Estou com mau hálito persistente e quero uma avaliação.",
  wppIndicacaoCtaUrgencia: "Olá! Preciso de atendimento odontológico de urgência.",
  wppBeneficiosUrgencia: "Olá! Preciso de atendimento odontológico de urgência.",
  wppShowcaseDenteQuebradoUrgencia: "Olá! Quebrei um dente e preciso de atendimento imediato.",
  wppShowcaseCanalUrgencia: "Olá! Estou com dor e acho que preciso de tratamento de canal com urgência.",
  wppShowcaseImplanteUrgencia: "Olá! Estou com dor ou desconforto no meu implante e preciso de avaliação.",
  wppShowcaseProteseQuebradaUrgencia: "Olá! Minha prótese quebrou e preciso de conserto com urgência.",
  wppShowcaseProteseUrgenciaUrgencia: "Olá! Quero informações sobre Prótese Fixa Parafusada sobre Implantes.",
  wppShowcaseProteseUrgencia: "Olá! Quero informações sobre prótese dentária.",
  wppShowcaseExtracaoUrgencia: "Olá! Quero informações sobre Extração de Dente.",
  wppShowcaseRestauracaoUrgencia: "Olá! Quero informações sobre Restauração dentária.",
  wppShowcaseFacetasUrgencia: "Olá! Quero informações sobre facetas de resina.",
  wppShowcaseGengivoplastiaUrgencia: "Olá! Quero informações sobre procedimento de Gengivoplastia.",
  wppShowcaseAparelhoUrgencia: "Olá! Quero informações sobre tratamento com Aparelho Odontológico.",
  wppShowcasePediatriaUrgencia: "Olá! Quero informações sobre atendimento pra Criança.",
  wppFinalUrgencia: "Olá! Preciso de atendimento odontológico de urgência.",
  wppFlutuanteUrgencia: "Olá! Vim pela página de Urgência da Dentalli e preciso de atendimento.",
  popupUrgencia: "Olá! Vi que tem atendimento de urgência disponível agora e quero falar com a equipe.",

  // ================= IMPLANTES (/implantes/) =================
  wppHeroImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  wppIndicacaoCtaImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  wppPrecoImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  wppResultadosImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  wppCtaMeioImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  wppDiferenciaisImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  wppFinalImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  wppFlutuanteImplantes: "Olá! Vim pela página de Implantes da Dentalli e quero agendar uma avaliação.",
  popupImplantes: "Olá! Recebi uma promoção exclusiva de Implantes no site da Dentalli.\n\nMeu cupom é: {{codigo}}\n\nGostaria de agendar e resgatar minha condição.",

  // ================= IMPLANTES GOOGLE ADS (/implantes-ads/) =================
  wppHeroImplantesAds: "Olá! Vi o site da Dentalli e quero agendar uma avaliação para implante dentário.",
  wppVideoImplantesAds: "Olá! Vi o vídeo da prótese protocolo no site e quero um sorriso assim. Quero agendar uma avaliação.",
  wppOfertaImplantesAds: "Olá! Vi a condição de implante a partir de 10x de R$ 119,90 no site e quero agendar minha avaliação.",
  wppDorImplantesAds:"Olá! Vi o site da Dentalli e quero saber se o implante é indicado para o meu caso.",
  wppUnitarioImplantesAds: "Olá! Vi o site e quero agendar uma avaliação para implante de 1 ou poucos dentes.",
  wppProtocoloImplantesAds: "Olá! Vi o site e quero agendar uma avaliação para prótese protocolo (dentadura fixa).",
  wppProcessoImplantesAds: "Olá! Vi como funciona o tratamento e quero agendar minha avaliação.",
  wppCasosImplantesAds: "Olá! Vi os casos de implante no site da Dentalli e quero avaliar o meu caso.",
  wppDoutorImplantesAds: "Olá! Quero agendar uma avaliação de implante com o Dr. Carlos Martins.",
  wppFaqImplantesAds: "Olá! Tenho algumas dúvidas sobre implante dentário e quero agendar uma avaliação.",
  wppFinalImplantesAds: "Olá! Quero dar o primeiro passo e agendar uma avaliação de implante.",
  wppFlutuanteImplantesAds: "Olá! Vi o site da Dentalli e quero agendar uma avaliação para implante dentário.",
  wppBarraImplantesAds: "Olá! Vi o site da Dentalli e quero agendar uma avaliação para implante dentário.",
  wppObrigadoImplantesAds: "Olá! Meu nome é {{nome}}. Acabei de preencher o formulário no site.\n\nInteresse: {{interesse}}\n\nQuero agendar minha avaliação.",

  // ================= PRÓTESE (/protese/) =================
  wppHeroProtese: "Olá! Vim pela página de Prótese Dentária da Dentalli e quero agendar uma avaliação.",
  wppIndicacaoCtaProtese: "Olá! Vim pela página de Prótese Dentária da Dentalli e quero agendar uma avaliação.",
  wppOfertaProtese: "Olá! Vim pela página de Prótese Dentária da Dentalli e quero agendar uma avaliação.",
  wppResultadosProtese: "Olá! Vim pela página de Prótese Dentária da Dentalli e quero avaliar meu caso.",
  wppFinalProtese: "Olá! Quero fazer prótese dentária e agendar uma avaliação.",
  wppFlutuanteProtese: "Olá! Vim pela página de Prótese Dentária da Dentalli e quero atendimento.",
  popupProtese: "Olá! Recebi uma promoção exclusiva de Prótese Dentária no site da Dentalli.\n\nMeu cupom é: {{codigo}}\n\nGostaria de agendar e resgatar minha condição.",

  // ================= CANAL (/canal/) =================
  wppHeroCanal: "Olá! Estou com dor de dente e preciso de atendimento com urgência.",
  wppCtaMeioCanal: "Olá! Estou com dor de dente e preciso de atendimento com urgência.",
  wppOfertaCanal: "Olá! Estou com dor de dente e preciso de atendimento com urgência.",
  wppFinalCanal: "Olá! Vim pela página de Tratamento de Canal da Dentalli e quero agendar avaliação.",
  wppFlutuanteCanal: "Olá! Vim pela página de Tratamento de Canal da Dentalli e quero atendimento.",
  popupCanal: "Olá! Recebi uma promoção exclusiva de Tratamento de Canal no site da Dentalli.\n\nMeu cupom é: {{codigo}}\n\nGostaria de agendar e resgatar minha condição.",

  // ================= CLAREAMENTO (/clareamento/) =================
  wppHeroClareamento: "Olá! Vim pela página de Clareamento da Dentalli e quero agendar uma avaliação.",
  wppResultadosClareamento: "Olá! Vi os resultados de clareamento da Dentalli e quero avaliar meu sorriso.",
  wppVideoClareamento: "Olá! Vi o vídeo de clareamento da Dentalli e quero saber como funciona para meu caso.",
  wppOfertaClareamento: "Olá! Quero agendar uma avaliação de clareamento dental na Dentalli.",
  wppFinalClareamento: "Olá! Quero fazer clareamento dental e agendar uma avaliação.",
  wppFlutuanteClareamento: "Olá! Vim pela página de Clareamento da Dentalli e quero atendimento.",
  popupClareamento: "Olá! Recebi uma promoção exclusiva de Clareamento + Limpeza grátis no site da Dentalli.\n\nMeu cupom é: {{codigo}}\n\nGostaria de agendar e resgatar minha condição.",

  wppTopoClareamento: "Olá! Vim pela página de clareamento da Dentalli e quero agendar uma avaliação.",
  wppMeioClareamento: "Olá! Vim pela página de clareamento da Dentalli e quero agendar uma avaliação.",
  wppBarraClareamento: "Olá! Vim pela página de clareamento da Dentalli e quero agendar uma avaliação.",

  // ================= ODONTOPEDIATRIA (/pediatria/) =================
  wppHeroPediatria: "Olá! Vim pela página de Odontopediatria da Dentalli e quero agendar uma consulta para meu filho(a).",
  wppIndicacaoCtaPediatria: "Olá! Vim pela página de Odontopediatria da Dentalli e quero agendar uma consulta para meu filho(a).",
  wppOfertaPediatria: "Olá! Vim pela página de Odontopediatria da Dentalli e quero agendar uma consulta para meu filho(a).",
  wppFinalPediatria: "Olá! Quero agendar uma consulta de odontopediatria.",
  wppFlutuantePediatria: "Olá! Vim pela página de Odontopediatria da Dentalli e quero atendimento.",
  popupPediatria: "Olá! Recebi uma promoção exclusiva de Odontopediatria no site da Dentalli.\n\nMeu cupom é: {{codigo}}\n\nGostaria de agendar e resgatar minha condição.",
  wppTopoPediatria: "Olá! Vim pela página de odontopediatria da Dentalli e quero agendar uma consulta para meu filho(a).",
  wppMeioPediatria: "Olá! Vim pela página de odontopediatria da Dentalli e quero agendar uma consulta para meu filho(a).",
  wppBarraPediatria: "Olá! Vim pela página de odontopediatria da Dentalli e quero agendar uma consulta para meu filho(a).",

  // ================= FACETAS (/facetas/) =================
  wppTopoFacetas: "Olá! Vim pela página de facetas da Dentalli e quero agendar uma avaliação.",
  wppHeroFacetas: "Olá! Vim pela página de facetas da Dentalli e quero agendar uma avaliação.",
  wppMeioFacetas: "Olá! Vim pela página de facetas da Dentalli e quero agendar uma avaliação.",
  wppFinalFacetas: "Olá! Vim pela página de facetas da Dentalli e quero agendar uma avaliação.",
  wppFlutuanteFacetas: "Olá! Vim pela página de facetas da Dentalli e quero agendar uma avaliação.",
  wppBarraFacetas: "Olá! Vim pela página de facetas da Dentalli e quero agendar uma avaliação.",

  default: "Olá! Vim pelo site da Dentalli e quero atendimento."
};

// ---------- MONTA A URL DO WHATSAPP (com suporte a {{variaveis}}) ----------
window.buildWhatsAppUrl = function buildWhatsAppUrl(context, variables) {
  context = context || "default";
  variables = variables || {};

  let message = WA_MESSAGES[context] || WA_MESSAGES.default;

  Object.keys(variables).forEach((key) => {
    message = message.replaceAll(`{{${key}}}`, variables[key]);
  });

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
};

// ---------- APLICA OS LINKS EM TODOS OS BOTÕES ESTÁTICOS [data-whatsapp] ----------
function enhanceWhatsAppLinks() {
  document.querySelectorAll("[data-whatsapp]").forEach((link) => {
    const context = link.dataset.waContext || "default";
    link.href = window.buildWhatsAppUrl(context);
    link.target = "_blank";
    link.rel = "noopener";
  });
}

// ---------- APLICA O TELEFONE EM TODOS OS BOTÕES [data-tel-link] ----------
function enhancePhoneLinks() {
  document.querySelectorAll("[data-tel-link]").forEach((link) => {
    link.href = `tel:+${PHONE_NUMBER}`;
  });
}

// ---------- INICIALIZAÇÃO ----------
document.addEventListener("DOMContentLoaded", () => {
  enhanceWhatsAppLinks();
  enhancePhoneLinks();
});
