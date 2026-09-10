"use client";
import { useState } from "react";
import { contato, MARCA, WHATSAPP } from "@/lib/marca";
import { useT } from "@/lib/i18n/client";
export default function Contato({ assunto }: { assunto?: string }) {
  const { t } = useT();
  const [msg, setMsg] = useState(assunto ? t("Olá, quero assessoria da {marca} para este lote: {assunto}", { marca: MARCA, assunto }) : t("Olá, quero conversar sobre a assessoria de arremate da {marca}.", { marca: MARCA }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); window.open(contato(msg), "_blank"); }}>
      <label className="campo"><span>{t("Sua mensagem")}</span><textarea value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
      <button className="btn ouro" type="submit">{WHATSAPP ? t("Enviar no WhatsApp") : t("Enviar por e-mail")}</button>
    </form>
  );
}
