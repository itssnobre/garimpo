"use client";
import Lista from "@/components/Lista";
import SeletorUF, { useUFs } from "@/components/SeletorUF";
import { useIndice } from "@/lib/indice";
import { usePadroes } from "@/lib/usePadroes";
export default function Buscar() {
  const { ativo } = usePadroes();
  const { ufs, pronto, definir } = useUFs(ativo?.ufs);
  const { imoveis, carregando } = useIndice(ufs);
  return <>
    <div className="app-cab"><div><h1>Buscar</h1><p>Todos os lotes coletados, recalculados com os seus custos. Filtre pelo seu padrão.</p></div>{pronto && <SeletorUF ufs={ufs} onChange={definir} />}</div>
    {pronto && carregando && imoveis.length === 0 ? <div className="vazio"><b>Carregando lotes…</b></div> : <Lista imoveis={imoveis} />}
  </>;
}
