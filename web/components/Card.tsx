"use client";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { pct, FONTE_LABEL, MODALIDADE_LABEL, type Avaliacao } from "@/lib/motor";
import { brl, brlCurto, matriculaCurta } from "@/lib/fmt";
import { urgencia } from "@/lib/util";
import Regua from "./Regua";
import { IArea, ICama, ICarro, IEstrela, IChave } from "./Icones";

export default function Card({ i, a, fav, toggle }: { i: Imovel; a: Avaliacao; fav: boolean; toggle: (id: string) => void }) {
  const veto = i.direitos_fiduciante || i.fracao_ideal; const u = urgencia(i.data_leilao);
  return (
                <article className="ficha">
                  <Link href={`/app/imovel/${encodeURIComponent(i.id)}`} className="foto" aria-label={i.titulo}>
                    {i.fotos?.[0] ? <img src={i.fotos[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="semfoto">{i.tipo} · sem foto</div>}
                    <span className="fonte-tag">{FONTE_LABEL[i.fonte] ?? i.fonte} · {MODALIDADE_LABEL[i.modalidade]}</span>
                    {u && <span className={`urg ${u.nivel}`}>{u.txt}</span>}
                    <div className={`selo ${a.classe}`}>{a.score}<small>{a.classe === "go" ? "GO" : a.classe === "atencao" ? "ATENÇÃO" : "NO-GO"}</small></div>
                  </Link>
                  <button className={`fav ${fav ? "on" : ""}`} aria-label={fav ? "Tirar dos favoritos" : "Guardar nos favoritos"} aria-pressed={fav} onClick={() => toggle(i.id)}><IEstrela cheia={fav} /></button>
                  <div className="ficha-corpo">
                    <div className="preco-linha">
                      <div className="preco"><b title={brl(i.lance_minimo)}>{i.lance_minimo >= 1e6 ? brlCurto(i.lance_minimo) : brl(i.lance_minimo)}</b>{i.avaliacao > i.lance_minimo && <s>{i.avaliacao >= 1e6 ? brlCurto(i.avaliacao) : brl(i.avaliacao)}</s>}</div>
                      {!veto && <div className="preco-tags"><span className="tag-desc">-{pct(i.desagio_pct)}</span><span className={`tag-marg ${a.res.margem >= 0.25 ? "ok" : "ruim"}`}>margem {pct(a.res.margem)}</span></div>}
                    </div>
                    <Link href={`/app/imovel/${encodeURIComponent(i.id)}`}><h2 className="ficha-tit">{i.titulo}</h2></Link>
                    <div className="ficha-sub"><b>{i.cidade}</b>{i.bairro ? `, ${i.bairro}` : ""}{i.endereco ? ` · ${i.endereco}` : ""}{a.regiao !== "Outra" && <span className="regiao-tag">{a.regiao}</span>}</div>
                    <ul className="fatos">
                      {i.area_privativa_m2 ? <li><IArea />{i.area_privativa_m2} m²</li> : i.area_terreno_m2 ? <li><IArea />{i.area_terreno_m2} m² terr.</li> : null}
                      {i.quartos ? <li><ICama />{i.quartos} dorm.</li> : null}
                      {i.vagas ? <li><ICarro />{i.vagas} vaga{i.vagas > 1 ? "s" : ""}</li> : null}
                      {i.ocupado !== null && i.ocupado !== undefined ? <li><IChave />{i.ocupado ? "ocupado" : "desocupado"}</li> : null}
                      {i.matricula ? <li className="mono" title={i.matricula}>matr. {matriculaCurta(i.matricula)}</li> : null}
                    </ul>
                    {veto ? <div className="veto-faixa">VETO · {i.direitos_fiduciante ? "direitos de fiduciante" : "fração ideal"}</div>
                      : <Regua minimo={i.lance_minimo} avaliacao={i.avaliacao} max25={a.res.lanceMax25} max30={a.res.lanceMax30} max35={a.res.lanceMax35} />}
                    <div className="ficha-pe"><span>{i.data_leilao ? `${i.praca ? i.praca + "ª praça · " : ""}${new Date(i.data_leilao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "sem data na fonte"}</span><Link href={`/app/imovel/${encodeURIComponent(i.id)}`} className="ver">Ver análise →</Link></div>
                  </div>
                </article>
  );
}
