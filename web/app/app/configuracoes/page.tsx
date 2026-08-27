"use client";
import { useTema } from "@/lib/tema";
export default function Config() {
  const { tema, aplicar } = useTema();
  return (<>
    <div className="app-cab"><div><h1>Configurações</h1><p>Preferências deste navegador. Conta e sincronização entre aparelhos chegam com o login.</p></div></div>
    <div className="doisdois">
      <div className="painel"><h2>Aparência</h2><label className="campo" style={{ maxWidth: 240 }}><span>Tema</span><select value={tema} onChange={(e) => aplicar(e.target.value as "light" | "dark" | "system")}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
        <h2 style={{ marginTop: 18 }}>Dados locais</h2><p style={{ fontSize: 14, color: "var(--mute)" }}>Favoritos, pipeline, custos editados e análises de IA ficam salvos neste navegador.</p><button className="btn sec" onClick={() => { if (confirm("Apagar favoritos, pipeline e análises salvas neste navegador?")) { Object.keys(localStorage).filter((k) => k.startsWith("garimpo:")).forEach((k) => localStorage.removeItem(k)); location.reload(); } }}>Apagar dados locais</button></div>
      <div className="painel"><h2>Meu padrão</h2><p style={{ fontSize: 14, color: "var(--mute)" }}>Faixa, deságio, margem, região, tipos, vetos e custos são definidos por você em <a href="/app/padrao" style={{ textDecoration: "underline", color: "var(--ink)" }}>Meu padrão</a>. Pode ter vários e trocar o ativo na Busca.</p></div>
    </div>
  </>);
}
