"use client";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { pct, FONTE_LABEL, MODALIDADE_LABEL, type Avaliacao } from "@/lib/motor";
import { brl, brlCurto, matriculaCurta, dataBR } from "@/lib/fmt";
import { urgencia, tituloLimpo } from "@/lib/util";
import Regua from "./Regua";
import { IArea, ICama, ICarro, IEstrela, IChave } from "./Icones";

export default function Card({ i, a, fav, toggle }: { i: Imovel; a: Avaliacao | null; fav: boolean; toggle: (id: string) => void }) {
  const veto = i.direitos_fiduciante || i.fracao_ideal;
  const u = urgencia(i.data_leilao);
  const href = `/app/imovel/${encodeURIComponent(i.id)}`;
  const preco = (v: number) => (v >= 1e6 ? brlCurto(v) : brl(v));
  return (
    <article className="ficha">
      <Link href={href} className="foto" aria-label={tituloLimpo(i)}>
        {(i.fotos?.[0] ?? i.foto) ? <img src={i.fotos?.[0] ?? i.foto} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="semfoto">{i.tipo} · sem foto</div>}
        <span className="fonte-tag">{FONTE_LABEL[i.fonte] ?? i.fonte} · {MODALIDADE_LABEL[i.modalidade]}</span>
        {u && <span className={`urg ${u.nivel}`}>{u.txt}</span>}
        {a && <span className={`selo ${a.classe}`}>{a.score}<small>{a.classe === "go" ? "GO" : a.classe === "atencao" ? "ATENÇÃO" : "NO-GO"}</small></span>}
      </Link>
      <button className={`fav ${fav ? "on" : ""}`} aria-label={fav ? "Tirar dos favoritos" : "Guardar nos favoritos"} aria-pressed={fav} onClick={() => toggle(i.id)}><IEstrela cheia={fav} /></button>

      <div className="ficha-corpo">
        <div className="preco-linha">
          <div className="preco">
            <b title={brl(i.lance_minimo)}>{preco(i.lance_minimo)}</b>
            {i.avaliacao > i.lance_minimo && <s title={`Avaliação ${brl(i.avaliacao)}`}>{preco(i.avaliacao)}</s>}
          </div>
          {!veto && (
            <div className="preco-tags">
              <span className="tag-desc">-{pct(i.desagio_pct)}</span>
              {a && <span className={`tag-marg ${a.res.margem >= 0.25 ? "ok" : "ruim"}`}>{pct(a.res.margem)} líq.</span>}
            </div>)}
        </div>

        <Link href={href}><h2 className="ficha-tit">{tituloLimpo(i)}</h2></Link>

        <p className="ficha-sub"><b>{i.cidade}/{i.uf}</b>{i.bairro ? `, ${i.bairro}` : ""}{i.endereco ? ` · ${i.endereco}` : ""}{a && a.regiao !== "Outra" && <span className="regiao-tag">{a.regiao}</span>}</p>

        <ul className="fatos">
          {i.area_privativa_m2 ? <li><IArea />{i.area_privativa_m2} m²</li> : i.area_terreno_m2 ? <li><IArea />{i.area_terreno_m2} m² terr.</li> : null}
          {i.quartos ? <li><ICama />{i.quartos} dorm.</li> : null}
          {i.vagas ? <li><ICarro />{i.vagas} vaga{i.vagas > 1 ? "s" : ""}</li> : null}
          {i.ocupado !== null && i.ocupado !== undefined ? <li><IChave />{i.ocupado ? "ocupado" : "desocupado"}</li> : null}
          {i.matricula ? <li className="mono" title={i.matricula}>matr. {matriculaCurta(i.matricula)}</li> : null}
        </ul>

        <div className="ficha-regua">
          {veto
            ? <div className="veto-faixa">VETO · {i.direitos_fiduciante ? "direitos de fiduciante" : "fração ideal"}</div>
            : a ? <Regua minimo={i.lance_minimo} avaliacao={i.avaliacao} max25={a.res.lanceMax25} max30={a.res.lanceMax30} max35={a.res.lanceMax35} />
            : <div className="sem-regua">Margem, score e lance máximo aparecem com o seu padrão.</div>}
        </div>

        <div className="ficha-pe">
          <span>{i.data_leilao ? `${i.praca ? i.praca + "ª praça · " : ""}${dataBR(i.data_leilao)}` : "sem data na fonte"}</span>
          <Link href={href} className="ver">Ver análise</Link>
        </div>
      </div>
    </article>
  );
}
