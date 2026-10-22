"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import type { EstadoAcao } from "@/components/form-acao";
import { carteiraDoCsv } from "@/lib/clientes";
import { NOMES } from "@/lib/relatorios-nomes";

type Lido = { id: number; arquivo: string; tipo: string; mes: string; linhas: Record<string, unknown>[]; erro?: string; status: "lendo" | "pronto" | "importando" | "feito" | "erro"; resultado?: string };

// Ordem certa para importar vários de uma vez: clientes antes das vendas delas.
const ORDEM = ["carteira", "primeira_compra", "aniversariantes", "vendas_vendedora", "evolucao", "comissao", "curva_abc", "vendas_dia"];
const mesBR = (m: string) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "");

export function ImportarRelatorios({ importar }: { importar: (e: EstadoAcao, d: FormData) => Promise<EstadoAcao> }) {
  const [lidos, setLidos] = useState<Lido[]>([]);
  const [rodando, setRodando] = useState(false);
  const router = useRouter();
  const mudar = (id: number, campos: Partial<Lido>) => setLidos((ls) => ls.map((l) => (l.id === id ? { ...l, ...campos } : l)));

  async function escolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(evento.target.files ?? [])];
    evento.target.value = "";
    for (const arquivo of arquivos) {
      const id = Date.now() + Math.random();
      setLidos((ls) => [...ls, { id, arquivo: arquivo.name, tipo: "", mes: "", linhas: [], status: "lendo" }]);
      try {
        if (/\.(csv|txt)$/i.test(arquivo.name)) {
          const { linhas, colunas } = carteiraDoCsv(await arquivo.text());
          if (!linhas.length || !colunas.includes("nome")) mudar(id, { status: "erro", erro: "Não achei clientes na planilha. A primeira linha precisa ter os nomes das colunas (nome, telefone…)." });
          else mudar(id, { status: "pronto", tipo: "carteira", linhas: linhas as unknown as Record<string, unknown>[] });
          continue;
        }
        if (!/\.pdf$/i.test(arquivo.name)) { mudar(id, { status: "erro", erro: "Use o PDF do sistema de vendas ou uma planilha CSV." }); continue; }
        const corpo = new FormData();
        corpo.append("arquivo", arquivo);
        const resposta = await fetch("/api/relatorios/ler", { method: "POST", body: corpo });
        const json = await resposta.json();
        if (!resposta.ok) mudar(id, { status: "erro", erro: json.erro ?? "Não consegui ler o PDF." });
        else mudar(id, { status: "pronto", tipo: json.tipo, mes: json.mes, linhas: json.linhas });
      } catch {
        mudar(id, { status: "erro", erro: "Não consegui enviar o arquivo. Confira a internet e tente de novo." });
      }
    }
  }

  async function importarUm(l: Lido) {
    mudar(l.id, { status: "importando" });
    const dados = new FormData();
    dados.append("tipo", l.tipo);
    dados.append("mes", l.mes);
    dados.append("arquivo", l.arquivo);
    dados.append("linhas", JSON.stringify(l.linhas));
    const r = await importar(null, dados);
    if (r?.erro) mudar(l.id, { status: "erro", erro: r.erro });
    else mudar(l.id, { status: "feito", resultado: r?.ok });
  }

  async function importarTodos() {
    setRodando(true);
    const prontos = lidos.filter((l) => l.status === "pronto").sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));
    for (const l of prontos) await importarUm(l);
    setRodando(false);
    router.refresh();
  }

  const prontos = lidos.filter((l) => l.status === "pronto").length;
  return (
    <div>
      <label className="arquivo-escolha">
        <Icone nome="arquivo" tamanho={22} />
        <span><strong>Escolher relatórios</strong><small>Pode escolher vários PDFs de uma vez. O sistema reconhece cada um sozinho.</small></span>
        <input type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" multiple onChange={escolher} />
      </label>

      {lidos.length > 0 && (
        <ul className="lidos">
          {[...lidos].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo)).map((l) => (
            <li key={l.id} className={`lido ${l.status}`}>
              <span className="marcador">{l.status === "feito" ? <Icone nome="certo" /> : l.status === "erro" ? <Icone nome="alerta" /> : <Icone nome="arquivo" />}</span>
              <div>
                <b>{l.tipo ? NOMES[l.tipo]?.nome : l.arquivo}</b>
                <small>
                  {l.status === "lendo" && "Lendo o PDF…"}
                  {l.status === "erro" && l.erro}
                  {(l.status === "pronto" || l.status === "importando") && `${l.arquivo} · ${l.linhas.length} ${l.linhas.length === 1 ? "linha" : "linhas"}${l.mes ? ` · ${mesBR(l.mes)}` : ""} · vai para: ${NOMES[l.tipo]?.vai}`}
                  {l.status === "feito" && l.resultado}
                </small>
              </div>
              {l.status === "pronto" && <button type="button" className="botao leve pequeno" disabled={rodando} onClick={() => importarUm(l).then(() => router.refresh())}>Importar</button>}
              {l.status === "importando" && <span className="mini">Importando…</span>}
              {(l.status === "feito" || l.status === "erro") && <button type="button" className="icone-botao" aria-label="Tirar da lista" onClick={() => setLidos((ls) => ls.filter((x) => x.id !== l.id))}><Icone nome="fechar" tamanho={16} /></button>}
            </li>
          ))}
        </ul>
      )}
      {prontos > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="botao" disabled={rodando} onClick={importarTodos}><Icone nome="certo" />{rodando ? "Importando…" : `Importar os ${prontos}`}</button>
        </div>
      )}
    </div>
  );
}
