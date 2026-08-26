import Link from "next/link";
import { notFound } from "next/navigation";
import { IMOVEIS, byId } from "@/lib/data";
import Analise from "@/components/Analise";
import { FONTE_LABEL, MODALIDADE_LABEL } from "@/lib/motor";

export const dynamic = "force-dynamic";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = byId(decodeURIComponent(id));
  if (!i) notFound();
  return (
    <div className="wrap">
      <header className="top">
        <div>
          <p className="eyebrow"><Link href="/" style={{ textDecoration: "none" }}>← Garimpo</Link> · {FONTE_LABEL[i.fonte] ?? i.fonte} · {MODALIDADE_LABEL[i.modalidade]}</p>
          <h1>{i.titulo}</h1>
          <p className="lede">{[i.endereco, i.bairro, i.cidade + "/" + i.uf].filter(Boolean).join(", ")}
            {i.matricula ? ` · Matrícula ${i.matricula}${i.cartorio ? " (" + i.cartorio + ")" : ""}` : ""}</p>
        </div>
        <div className="meta">
          <a className="btn" href={i.url} target="_blank" rel="noreferrer">Abrir na fonte ↗</a>
          {i.edital_url && <> <a className="btn sec" href={i.edital_url} target="_blank" rel="noreferrer">Edital</a></>}
          {i.matricula_url && <> <a className="btn sec" href={i.matricula_url} target="_blank" rel="noreferrer">Matrícula</a></>}
        </div>
      </header>
      <Analise imovel={i} />
    </div>
  );
}
