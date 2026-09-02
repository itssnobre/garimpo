export const MARCA = "Lotwise";
export const TAGLINE = "Leilão de imóveis com a conta feita.";
export const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP ?? "";            // só dígitos, com 55
export const EMAIL = process.env.NEXT_PUBLIC_EMAIL ?? "itssnobre@gmail.com";
export function contato(msg: string) {
  return WHATSAPP ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}` : `mailto:${EMAIL}?subject=${encodeURIComponent("Assessoria " + MARCA)}&body=${encodeURIComponent(msg)}`;
}
export const PLANOS = [
  { nome: "Conta Lotwise", preco: "Grátis", sub: "catálogo do Brasil inteiro com o seu padrão", itens: ["Todas as fontes, em 27 estados", "Seu padrão: faixa, deságio, margem, região, vetos e custos", "Score, margem líquida e lance máximo em cada lote", "Favoritos, pipeline e o Sage, nossa IA"], cta: "Criar conta grátis", href: "/entrar?modo=criar", destaque: false },
  { nome: "Assessoria de arremate", preco: "3%", sub: "do valor arrematado, só se você arrematar", itens: ["Leitura da matrícula e do edital por analista + IA", "Lance máximo calculado pra sua margem", "Cadastro no leiloeiro e acompanhamento do pregão", "Pós-arremate: ITBI, registro, desocupação orientada", "Mínimo de R$ 3.500 por arremate"], cta: "Quero assessoria", href: "#contato", destaque: true },
  { nome: "Sócio no lucro", preco: "1% + 12%", sub: "1% no arremate e 12% do lucro líquido na revenda", itens: ["Tudo da assessoria de arremate", "Precificação e anúncio da revenda", "Acompanhamento até a venda", "Alinhado ao seu resultado, não ao volume"], cta: "Falar sobre parceria", href: "#contato", destaque: false },
];
