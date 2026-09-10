"use client";
import Lista from "@/components/Lista";
import SeletorUF, { useUFs } from "@/components/SeletorUF";
import { useIndice } from "@/lib/indice";
import { usePadroes } from "@/lib/usePadroes";
import { useConta } from "@/lib/conta";
import { useT } from "@/lib/i18n/client";
export default function Buscar() {
  const { t } = useT();
  const { ativo } = usePadroes(); const { user, pronto: contaPronta, nuvem } = useConta();
  const visitante = nuvem && contaPronta && !user;
  const { ufs, pronto, definir } = useUFs(ativo?.ufs);
  const { imoveis, carregando } = useIndice(ufs);
  return <>
    <div className="app-cab"><div><h1>{t("Buscar")}</h1><p>{visitante ? t("Amostra do catálogo. Com conta, cada lote é recalculado com os seus custos e filtrado pelo seu padrão.") : ativo ? t("Todos os lotes coletados, recalculados com os seus custos e filtrados pelo padrão \"{nome}\".", { nome: ativo.nome }) : t("Todos os lotes coletados. Crie o seu padrão para ver margem, score e lance máximo.")}</p></div>{pronto && <SeletorUF ufs={ufs} onChange={definir} />}</div>
    {pronto && carregando && imoveis.length === 0 ? <div className="vazio"><b>{t("Carregando lotes…")}</b></div> : <Lista imoveis={imoveis} />}
  </>;
}
