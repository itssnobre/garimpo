"use client";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { pct, FONTE_LABEL, MODALIDADE_LABEL, type Avaliacao } from "@/lib/motor";
import { brl, brlCurto, matriculaCurta, dataBR } from "@/lib/fmt";
import { urgencia, tituloLimpo } from "@/lib/util";
import { useT } from "@/lib/i18n/client";
import Regua from "./Regua";
import { IArea, ICama, ICarro, IEstrela, IChave, IDoc } from "./Icones";

export default function Card({ i, a, fav, toggle }: { i: Imovel; a: Avaliacao | null; fav: boolean; toggle: (id: string) => void }) {
  const { t } = useT();
  const veto = i.direitos_fiduciante || i.fracao_ideal;
  const u = urgencia(i.data_leilao, t);
  const href = `/app/imovel/${encodeURIComponent(i.id)}`;
  const preco = (v: number) => (v >= 1e6 ? brlCurto(v) : brl(v));
  return (
    <article className="ficha">
      <Link href={href} className="foto" aria-label={tituloLimpo(i, t)}>
        {(i.fotos?.[0] ?? i.foto) ? <img src={i.fotos?.[0] ?? i.foto} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="semfoto">{t(i.tipo)} · {t("sem foto")}</div>}
        <span className="foto-rodape">
          <span className="fonte-tag" title={FONTE_LABEL[i.fonte] ?? i.fonte}>{FONTE_LABEL[i.fonte] ?? i.fonte}</span>
          {u && <span className={`urg ${u.nivel}`}>{u.txt}</span>}
        </span>
        {a && <span className={`selo ${a.classe}`}>{a.score}<small>{a.classe === "go" ? "GO" : a.classe === "atencao" ? t("ATENÇÃO") : "NO-GO"}</small></span>}
      </Link>
      <button className={`fav ${fav ? "on" : ""}`} aria-label={fav ? t("Tirar dos favoritos") : t("Guardar nos favoritos")} aria-pressed={fav} onClick={() => toggle(i.id)}><IEstrela cheia={fav} /></button>

      <div className="ficha-corpo">
        <div className="preco-linha">
          <div className="preco">
            <b title={brl(i.lance_minimo)}>{preco(i.lance_minimo)}</b>
            {i.avaliacao > i.lance_minimo && <s title={t("Avaliação {v}", { v: brl(i.avaliacao) })}>{preco(i.avaliacao)}</s>}
          </div>
          {!veto && (
            <div className="preco-tags">
              {i.valor_suspeito || i.desagio_pct >= 0.85 ? <span className="tag-desc suspeito" title={t("Deságio fora do normal: confira avaliação e lance na fonte antes de qualquer conta")}>{t("valor a conferir")}</span> : <span className="tag-desc">-{pct(i.desagio_pct)}</span>}
              {a && <span className={`tag-marg ${a.res.margem >= 0.25 ? "ok" : "ruim"}`}>{t("{pct} líq.", { pct: pct(a.res.margem) })}</span>}
            </div>)}
        </div>

        <Link href={href}><h2 className="ficha-tit">{tituloLimpo(i, t)}</h2></Link>

        <p className="ficha-sub"><b>{i.cidade}/{i.uf}</b>{i.bairro ? `, ${i.bairro}` : ""}{i.endereco ? ` · ${i.endereco}` : ""}</p>

        <ul className="fatos">
          {i.area_privativa_m2 ? <li><IArea />{t("{v} m²", { v: i.area_privativa_m2 })}</li> : i.area_terreno_m2 ? <li><IArea />{t("{v} m² terr.", { v: i.area_terreno_m2 })}</li> : null}
          {i.quartos ? <li><ICama />{t("{n} dorm.", { n: i.quartos })}</li> : null}
          {i.vagas ? <li><ICarro />{t(i.vagas > 1 ? "{n} vagas" : "{n} vaga", { n: i.vagas })}</li> : null}
          {i.ocupado !== null && i.ocupado !== undefined ? <li><IChave />{t(i.ocupado ? "ocupado" : "desocupado")}</li> : null}
          {i.matricula ? <li title={t("Matrícula {v}", { v: i.matricula })}><IDoc />{t("matr. {v}", { v: matriculaCurta(i.matricula) ?? "" })}</li> : null}
        </ul>

        <div className="ficha-regua">
          {veto
            ? <div className="veto-faixa">VETO · {t(i.direitos_fiduciante ? "direitos de fiduciante" : "fração ideal")}</div>
            : a ? <Regua minimo={i.lance_minimo} avaliacao={i.avaliacao} max25={a.res.lanceMax25} max30={a.res.lanceMax30} max35={a.res.lanceMax35} t={t} />
            : <div className="sem-regua">{t("Margem, score e lance máximo aparecem com o seu padrão.")}</div>}
        </div>

        <div className="ficha-pe">
          <span>{t(MODALIDADE_LABEL[i.modalidade])}{i.praca ? ` · ${t("{n}ª praça", { n: i.praca })}` : ""} · {i.data_leilao ? dataBR(i.data_leilao) : t("sem data")}</span>
          <Link href={href} className="ver">{t("Ver análise")}</Link>
        </div>
      </div>
    </article>
  );
}
