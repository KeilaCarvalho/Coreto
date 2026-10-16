"use client";

import { useActionState, useState } from "react";
import { Icone } from "@/components/icone";
import type { EstadoAcao } from "@/components/form-acao";
import { carteiraDoCsv, TIPOS_RELATORIO, type LinhaImportacao } from "@/lib/clientes";

type Previa = { tipo: string; mes: string; arquivo: string; linhas: LinhaImportacao[] };

const COLUNAS_PREVIA: Record<string, [string, string][]> = {
  primeira_compra: [["codigo", "Código"], ["nome", "Cliente"], ["telefone", "Telefone"], ["vendedora", "Vendedora"], ["primeira_compra", "1ª compra"], ["total_gasto", "Total"]],
  aniversariantes: [["codigo", "Código"], ["nome", "Cliente"], ["nascimento", "Nascimento"], ["telefone", "Telefone"], ["cidade", "Cidade"]],
  vendas_vendedora: [["codigo_venda", "Venda"], ["data", "Data"], ["nome", "Cliente"], ["vendedora", "Vendedora"], ["valor", "Valor"]],
  carteira: [["codigo", "Código"], ["nome", "Cliente"], ["telefone", "Telefone"], ["vendedora", "Vendedora"], ["nascimento", "Nascimento"], ["total_gasto", "Total"]],
};

export function ImportarClientes({ importar }: { importar: (e: EstadoAcao, d: FormData) => Promise<EstadoAcao> }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [estado, enviar, importando] = useActionState(async (e: EstadoAcao, d: FormData) => {
    const r = await importar(e, d);
    if (r?.ok) setPrevia(null);
    return r;
  }, null);

  async function escolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;
    setErro(null); setPrevia(null);
    if (/\.(csv|txt)$/i.test(arquivo.name)) {
      const texto = await arquivo.text();
      const { linhas, colunas } = carteiraDoCsv(texto);
      if (!linhas.length) { setErro("Não achei clientes na planilha. A primeira linha precisa ter os nomes das colunas (nome, telefone...)."); return; }
      if (!colunas.includes("nome")) { setErro("A planilha precisa de uma coluna com o nome da cliente."); return; }
      setPrevia({ tipo: "carteira", mes: "", arquivo: arquivo.name, linhas });
      return;
    }
    if (!/\.pdf$/i.test(arquivo.name)) { setErro("Use o PDF do sistema de vendas ou uma planilha CSV."); return; }
    setLendo(true);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const resposta = await fetch("/api/clientes/ler-relatorio", { method: "POST", body: corpo });
      const json = await resposta.json();
      if (!resposta.ok) setErro(json.erro ?? "Não consegui ler o PDF.");
      else setPrevia(json as Previa);
    } catch {
      setErro("Não consegui enviar o arquivo. Confira a internet e tente de novo.");
    } finally {
      setLendo(false);
    }
  }

  const colunas = previa ? COLUNAS_PREVIA[previa.tipo] ?? [] : [];
  return (
    <div>
      <label className="arquivo-escolha">
        <Icone nome="arquivo" tamanho={22} />
        <span style={{ flex: 1, minWidth: 200 }}>
          <strong style={{ display: "block" }}>{lendo ? "Lendo o arquivo…" : "Escolher arquivo"}</strong>
          <span className="mini">PDF do sistema de vendas (primeira compra, aniversariantes ou vendas por vendedor) ou planilha CSV da carteira antiga.</span>
        </span>
        <input type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" onChange={escolher} disabled={lendo || importando} style={{ maxWidth: 240 }} />
      </label>
      {erro && <p className="aviso erro" role="alert" style={{ marginTop: 14 }}><Icone nome="alerta" />{erro}</p>}
      {estado?.erro && <p className="aviso erro" role="alert" style={{ marginTop: 14 }}><Icone nome="alerta" />{estado.erro}</p>}
      {estado?.ok && !previa && <p className="aviso ok" role="status" style={{ marginTop: 14 }}><Icone nome="certo" />{estado.ok}</p>}

      {previa && (
        <form action={enviar} style={{ marginTop: 18 }}>
          <input type="hidden" name="tipo" value={previa.tipo} />
          <input type="hidden" name="mes" value={previa.mes} />
          <input type="hidden" name="arquivo" value={previa.arquivo} />
          <input type="hidden" name="linhas" value={JSON.stringify(previa.linhas)} />
          <p style={{ marginBottom: 10 }}>
            <strong>{TIPOS_RELATORIO[previa.tipo]}</strong> · {previa.linhas.length} {previa.linhas.length === 1 ? "linha" : "linhas"}
            {previa.mes && <> · período {previa.mes.split("-").reverse().join("/")}</>} · <span className="mini">{previa.arquivo}</span>
          </p>
          <div className="previa-importacao">
            <table className="tabela">
              <thead><tr>{colunas.map(([, r]) => <th key={r}>{r}</th>)}</tr></thead>
              <tbody>
                {previa.linhas.slice(0, 50).map((l, i) => (
                  <tr key={i}>{colunas.map(([k]) => <td key={k} className={typeof l[k] === "number" ? "num" : undefined}>{typeof l[k] === "number" && /valor|total/.test(k) ? Number(l[k]).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(l[k] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {previa.linhas.length > 50 && <p className="mini" style={{ marginTop: 6 }}>Mostrando as 50 primeiras.</p>}
          <div className="formulario-rodape">
            <button type="button" className="botao secundario" onClick={() => setPrevia(null)} disabled={importando}>Cancelar</button>
            <button type="submit" className="botao" disabled={importando}>{importando ? "Importando…" : `Importar ${previa.linhas.length} linhas`}</button>
          </div>
        </form>
      )}
    </div>
  );
}
