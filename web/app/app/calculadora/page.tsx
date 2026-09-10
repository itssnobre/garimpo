"use client";
import { useState } from "react";
import { brl, pct, calcular, CUSTOS_PADRAO, ITBI_CIDADE, type Custos } from "@/lib/motor";
import Regua from "@/components/Regua";
import CampoMoeda from "@/components/CampoMoeda";
import Portao from "@/components/Portao";
import { useT } from "@/lib/i18n/client";
const CAMPOS: [keyof Custos, string][] = [["leiloeiro", "Leiloeiro %"], ["itbi", "ITBI %"], ["registro", "Registro %"], ["advogado", "Advogado R$"], ["certidoes", "Certidões R$"], ["debitos", "Débitos R$"], ["desocupacao", "Desocupação R$"], ["reforma", "Reforma R$"], ["meses", "Meses até vender"], ["mensal", "Custo mensal R$"], ["corretagem", "Corretagem %"], ["ir", "IR ganho capital %"], ["descontoVenda", "Vender abaixo da aval. %"]];
function Conteudo() {
  const { t } = useT();
  const [venda, setVenda] = useState(220000); const [lance, setLance] = useState(120000); const [c, setC] = useState<Custos>(CUSTOS_PADRAO);
  const r = calcular(venda, lance, c); const classe = r.lucro <= 0 || r.margem < 0.25 ? "nogo" : r.margem < 0.3 ? "atencao" : "go";
  return (<>
    <div className="app-cab"><div><h1>{t("Calculadora de lance")}</h1><p>{t("Qualquer lote, de qualquer fonte: valor de venda, lance e custos. Sai o lance máximo pra cada margem.")}</p></div></div>
    <div className="lote-grid">
      <div className="painel">
        <div className="par"><div className="campo"><span>{t("Valor real de venda")}</span><CampoMoeda valor={venda} onChange={setVenda} /></div><div className="campo"><span>{t("Lance")}</span><CampoMoeda valor={lance} onChange={setLance} /></div></div>
        <label className="campo" style={{ maxWidth: 260 }}><span>{t("ITBI por cidade")}</span><select onChange={(e) => setC({ ...c, itbi: ITBI_CIDADE[e.target.value] ?? c.itbi })}><option value="">{t("Manual")}</option>{Object.keys(ITBI_CIDADE).map((k) => <option key={k}>{k}</option>)}</select></label>
        <div className="custos" style={{ marginTop: 10 }}>{CAMPOS.map(([k, l]) => l.endsWith("R$")
          ? <div className="campo" key={k}><span>{t(l.replace(" R$", ""))}</span><CampoMoeda valor={c[k]} onChange={(v) => setC({ ...c, [k]: v })} /></div>
          : <label className="campo" key={k}><span>{t(l)}</span><input className="num" type="number" step="0.1" value={c[k]} onChange={(e) => setC({ ...c, [k]: +e.target.value || 0 })} /></label>)}</div>
      </div>
      <aside className="lateral">
        <div className={`veredito ${classe}`}><div className="big">{classe === "go" ? "GO" : classe === "atencao" ? t("ATENÇÃO") : "NO-GO"}</div><div className="sc">{t("margem {margem} · deságio real {desagio}", { margem: pct(r.margem), desagio: pct(Math.max(0, r.descReal)) })}</div><p>{t("Lucro líquido {lucro} sobre {total} de capital.", { lucro: brl(r.lucro), total: brl(r.total) })}</p></div>
        <div className="painel"><Regua grande minimo={lance} avaliacao={venda} lance={lance} max25={r.lanceMax25} max30={r.lanceMax30} max35={r.lanceMax35} />
          <div className="tres"><div><span>25%</span><b>{brl(r.lanceMax25)}</b></div><div className="alvo"><span>{t("30% alvo")}</span><b>{brl(r.lanceMax30)}</b></div><div><span>35%</span><b>{brl(r.lanceMax35)}</b></div></div>
          <dl className="kv"><dt>{t("Leiloeiro + ITBI + registro")}</dt><dd>{brl(r.custosSobreLance)}</dd><dt>{t("Fixos + carrego")}</dt><dd>{brl(r.fixos)}</dd><dt>{t("Capital total")}</dt><dd>{brl(r.total)}</dd><dt>{t("Venda líquida")}</dt><dd>{brl(r.receita)}</dd><dt>{t("Lucro líquido")}</dt><dd>{brl(r.lucro)}</dd></dl></div>
      </aside>
    </div>
  </>);
}
export default function Calculadora() { const { t } = useT(); return <Portao titulo={t("Calculadora")}><Conteudo /></Portao>; }
