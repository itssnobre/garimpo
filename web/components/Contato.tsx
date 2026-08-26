"use client";
import { useState } from "react";
import { contato, MARCA, WHATSAPP } from "@/lib/marca";
export default function Contato({ assunto }: { assunto?: string }) {
  const [msg, setMsg] = useState(assunto ? `Olá, quero assessoria da ${MARCA} para este lote: ${assunto}` : `Olá, quero conversar sobre a assessoria de arremate da ${MARCA}.`);
  return (
    <form onSubmit={(e) => { e.preventDefault(); window.open(contato(msg), "_blank"); }}>
      <label className="campo"><span>Sua mensagem</span><textarea value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
      <button className="btn ouro" type="submit">{WHATSAPP ? "Enviar no WhatsApp" : "Enviar por e-mail"}</button>
    </form>
  );
}
