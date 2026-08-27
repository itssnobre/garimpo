"use client";
import { CUSTOS_PADRAO, REGIAO_ALVO } from "@/lib/motor";
import { useTema } from "@/lib/tema";
export default function Config() {
  const { tema, aplicar } = useTema();
  return (<>
    <div className="app-cab"><div><h1>Configurações</h1><p>Preferências deste navegador. Conta e sincronização entre aparelhos chegam com o login.</p></div></div>
    <div className="doisdois">
      <div className="painel"><h2>Aparência</h2><label className="campo" style={{ maxWidth: 240 }}><span>Tema</span><select value={tema} onChange={(e) => aplicar(e.target.value as "light" | "dark" | "system")}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
        <h2 style={{ marginTop: 18 }}>Dados locais</h2><p style={{ fontSize: 14, color: "var(--musgo)" }}>Favoritos, pipeline, custos editados e análises de IA ficam salvos neste navegador.</p><button className="btn sec" onClick={() => { if (confirm("Apagar favoritos, pipeline e análises salvas neste navegador?")) { Object.keys(localStorage).filter((k) => k.startsWith("garimpo:")).forEach((k) => localStorage.removeItem(k)); location.reload(); } }}>Apagar dados locais</button></div>
      <div className="painel"><h2>Padrão do garimpo</h2><dl className="kv"><dt>Faixa de avaliação</dt><dd>R$ 200k a 250k</dd><dt>Deságio mínimo</dt><dd>40%</dd><dt>Margem líquida mínima</dt><dd>25% (alvo 30 a 35%)</dd><dt>Leiloeiro</dt><dd>{CUSTOS_PADRAO.leiloeiro}%</dd><dt>Registro</dt><dd>{CUSTOS_PADRAO.registro}%</dd><dt>Carrego</dt><dd>{CUSTOS_PADRAO.meses} m × R$ {CUSTOS_PADRAO.mensal}</dd><dt>Corretagem / IR</dt><dd>{CUSTOS_PADRAO.corretagem}% / {CUSTOS_PADRAO.ir}%</dd></dl>
        <h2 style={{ marginTop: 18 }}>Região prioritária</h2><p style={{ fontSize: 13.5, color: "var(--musgo)" }}>{REGIAO_ALVO.join(", ")}.</p></div>
    </div>
  </>);
}
