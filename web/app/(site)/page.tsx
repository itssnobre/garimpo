import Link from "next/link";
import { IMOVEIS, META } from "@/lib/data";
import { avaliar, brl, pct, CRITERIOS_PADRAO } from "@/lib/motor";
import { MARCA, PLANOS } from "@/lib/marca";
import Destaques from "@/components/Destaques";
import Contato from "@/components/Contato";
import Reveal from "@/components/Reveal";
export const dynamic = "force-static";

export default function Landing() {
  const av = IMOVEIS.map((i) => ({ i, a: avaliar(i, CRITERIOS_PADRAO) }));
  const go = av.filter((x) => x.a.classe === "go");
  const top = go.filter((x) => x.i.fotos?.length || x.i.foto).sort((x, y) => y.a.score - x.a.score).slice(0, 4);
  const ex = top[0];
  const fontes = Object.keys(META.fontes).length;
  return (
    <>
      <Reveal />
      <section className="land-hero">
        <div className="land-hero-in">
          <div>
            <p className="eyebrow">Leilão de imóveis · Brasil</p>
            <h1>Todo leilão do país, <em>com a conta feita</em> antes do lance.</h1>
            <p className="sub">A {MARCA} junta as fontes de leilão num só catálogo, refaz a conta de cada lote com leiloeiro, ITBI, registro, carrego e imposto, e filtra pelo padrão que você define: faixa, deságio, margem, região. Você só vê o que vale a pena.</p>
            <div className="ctas"><Link href="/app/buscar" className="btn ouro">Abrir a plataforma</Link><Link href="/app/sage" className="btn sec">Conhecer o Sage, nossa IA</Link></div>
            <div className="prova"><div><b>{IMOVEIS.length.toLocaleString("pt-BR")}</b><span>lotes monitorados</span></div><div><b>{fontes}</b><span>fontes oficiais</span></div><div><b>{go.length}</b><span>passam no padrão</span></div><div><b>{Object.keys(META.fontes).length}</b><span>coletas por dia</span></div></div>
          </div>
          {ex && (
            <div className="hero-ficha" aria-hidden>
              <div className="cab"><span>Exemplo real · score {ex.a.score}</span><span>{ex.i.cidade}</span></div>
              <div><span className="n">{brl(ex.i.lance_minimo)}</span><s>{brl(ex.i.avaliacao)}</s></div>
              <div className="lin"><span>Deságio no lance</span><b>{pct(ex.i.desagio_pct)}</b></div>
              <div className="lin"><span>Custos totais de arremate</span><b>{brl(ex.a.res.total - ex.i.lance_minimo)}</b></div>
              <div className="lin"><span>Lucro líquido estimado</span><b style={{ color: "var(--ok)" }}>{brl(ex.a.res.lucro)}</b></div>
              <div className="lin"><span>Margem sobre capital</span><b>{pct(ex.a.res.margem)}</b></div>
              <div className="lin" style={{ border: 0 }}><span>Lance máximo para 30%</span><b style={{ color: "var(--accent-ink)" }}>{brl(ex.a.res.lanceMax30)}</b></div>
            </div>)}
        </div>
      </section>

      <section className="land-sec" id="como-funciona">
        <div className="sec-cab"><p className="eyebrow">Como funciona</p><h2>Três passos entre o catálogo e a escritura.</h2><p>O leilão premia quem chega com a conta pronta e a matrícula lida. Fazemos as duas coisas antes de você levantar a mão.</p></div>
        <div className="passos">
          <div className="passo"><div className="num">1</div><h3>Garimpo</h3><p>Coletamos todo dia os lotes de Caixa, bancos e leiloeiros judiciais e extrajudiciais de SP. Cada um recebe um score que combina deságio, margem líquida real, região e sinais de risco. Vetos automáticos tiram da frente o que não se compra: direitos de fiduciante, fração ideal.</p></div>
          <div className="passo"><div className="num">2</div><h3>Diligência</h3><p>Lemos matrícula e edital averbação por averbação, com analista e IA: ônus, penhoras, execução condominial, intimação por edital, origem do imóvel. Levantamos débitos reais com síndico e prefeitura e conferimos o valor de venda no entorno.</p></div>
          <div className="passo"><div className="num">3</div><h3>Arremate</h3><p>Definimos juntos o lance máximo que respeita sua margem, cuidamos do cadastro no leiloeiro e acompanhamos o pregão. Depois, orientamos ITBI, registro e desocupação até o imóvel estar no seu nome.</p></div>
        </div>
      </section>

      <section className="land-sec">
        <div className="sec-cab"><p className="eyebrow">Por que a {MARCA}</p><h2>O que os portais de leilão não mostram.</h2></div>
        <div className="difs">
          <div className="dif"><h3>Margem líquida, não deságio</h3><p>"50% de desconto" vira 20% depois de leiloeiro, ITBI, registro, carrego e imposto. Mostramos o número que sobra.</p></div>
          <div className="dif"><h3>Régua de lance</h3><p>Em cada lote, até onde dá pra ir mantendo 35, 30 ou 25% de margem. Você entra no pregão sabendo o teto.</p></div>
          <div className="dif"><h3>Todas as fontes, uma tela</h3><p>{fontes} plataformas num catálogo só, com o mesmo lote identificado em mais de uma fonte e o menor lance apontado.</p></div>
          <div className="dif"><h3>Matrícula lida por IA</h3><p>Suba o PDF e receba ônus, alertas, custos previstos e as perguntas a fazer antes do lance.</p></div>
          <div className="dif"><h3>Vetos que protegem o caixa</h3><p>Direitos de fiduciante, fração ideal, doação com retrocessão: o que já quebrou investidor não passa do filtro.</p></div>
          <div className="dif"><h3>Seu padrão, não o nosso</h3><p>Faixa de valor, deságio, margem mínima, regiões, tipos e custos são seus. O score é calculado sobre as suas regras.</p></div>
        </div>
      </section>

      <section className="land-sec">
        <div className="sec-cab"><p className="eyebrow">Passam no padrão hoje</p><h2>Os melhores lotes da coleta.</h2><p>Exemplo com um padrão conservador: deságio de 40% ou mais e margem líquida acima de 25% depois de todos os custos.</p></div>
        <Destaques itens={top} />
        <p style={{ marginTop: 18 }}><Link href="/app/buscar" className="btn">Ver o catálogo completo →</Link></p>
      </section>

      <section className="land-sec" id="assessoria">
        <div className="sec-cab"><p className="eyebrow">Assessoria e comissão</p><h2>Só ganhamos quando você arremata bem.</h2><p>Sem mensalidade, sem taxa de cadastro. A comissão está na mesa antes do primeiro lance.</p></div>
        <div className="planos">{PLANOS.map((p) => (
          <div key={p.nome} className={`plano ${p.destaque ? "destaque" : ""}`}>
            <h3>{p.nome}</h3><div className="preco">{p.preco}</div><div className="sub">{p.sub}</div>
            <ul>{p.itens.map((x) => <li key={x}>{x}</li>)}</ul>
            <Link href={p.href} className={`btn ${p.destaque ? "" : "sec"}`}>{p.cta}</Link>
          </div>))}</div>
        <div className="regras-caixa"><b>Regras claras.</b> A comissão da assessoria incide sobre o valor arrematado e é paga na homologação do arremate. A comissão do leiloeiro (em geral 5%) é cobrada por ele, por fora, em qualquer modalidade. Não cobramos por lote analisado que não for arrematado. Na parceria "Sócio no lucro", o lucro líquido é apurado depois de todos os custos de arremate, carrego e venda, com prestação de contas por escrito.</div>
      </section>

      <section className="land-sec" id="contato">
        <div className="contato">
          <div><h2>Tem um lote na mira ou quer que a gente garimpe pra você?</h2><p>Manda a região, a faixa de valor e o objetivo (revenda ou renda). Respondemos com os lotes que passam no padrão e o lance máximo de cada um.</p></div>
          <Contato />
        </div>
      </section>
    </>
  );
}
