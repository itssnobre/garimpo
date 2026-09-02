"use client";
import Lista from "@/components/Lista";
import SeletorUF, { useUFs } from "@/components/SeletorUF";
import { useIndice } from "@/lib/indice";
import { usePadroes } from "@/lib/usePadroes";
import { useConta } from "@/lib/conta";
export default function Buscar() {
  const { ativo } = usePadroes(); const { user, pronto: contaPronta, nuvem } = useConta();
  const visitante = nuvem && contaPronta && !user;
  const { ufs, pronto, definir } = useUFs(ativo?.ufs);
  const { imoveis, carregando } = useIndice(ufs);
  return <>
    <div className="app-cab"><div><h1>Buscar</h1><p>{visitante ? "Amostra do catálogo. Com conta, cada lote é recalculado com os seus custos e filtrado pelo seu padrão." : ativo ? `Todos os lotes coletados, recalculados com os seus custos e filtrados pelo padrão "${ativo.nome}".` : "Todos os lotes coletados. Crie o seu padrão para ver margem, score e lance máximo."}</p></div>{pronto && <SeletorUF ufs={ufs} onChange={definir} />}</div>
    {pronto && carregando && imoveis.length === 0 ? <div className="vazio"><b>Carregando lotes…</b></div> : <Lista imoveis={imoveis} />}
  </>;
}
