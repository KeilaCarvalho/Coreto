"use client";

import { useState } from "react";
import { LANCAMENTOS_MANUAIS } from "@/lib/estoque";
import { BotaoEnviar, FormAcao, type EstadoAcao } from "@/components/form-acao";

type Local = { id: string; nome: string };

export function FormMovimentacao({ acao, locais }: { acao: (e: EstadoAcao, d: FormData) => Promise<EstadoAcao>; locais: Local[] }) {
  const [tipo, setTipo] = useState<string>(LANCAMENTOS_MANUAIS[0].tipo);
  const regra = LANCAMENTOS_MANUAIS.find((l) => l.tipo === tipo)!;
  const loja = locais.find((l) => l.nome === "Loja")?.id ?? "";
  return (
    <FormAcao acao={acao} className="campos">
      <div className="campo">
        <label htmlFor="tipo">Tipo</label>
        <select id="tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {LANCAMENTOS_MANUAIS.map((l) => <option key={l.tipo} value={l.tipo}>{l.rotulo}</option>)}
        </select>
        <span className="ajuda">{regra.ajuda}</span>
      </div>
      <div className="campo">
        <label htmlFor="codigo">SKU ou código de barras</label>
        <input id="codigo" name="codigo" autoComplete="off" placeholder="VL001-VAG-M" required style={{ textTransform: "uppercase" }} />
        <span className="ajuda">O leitor de código de barras funciona direto neste campo.</span>
      </div>
      <div className="campo">
        <label htmlFor="quantidade">Quantidade</label>
        <input id="quantidade" name="quantidade" type="number" min={1} step={1} defaultValue={1} required />
      </div>
      {regra.origem && (
        <div className="campo">
          <label htmlFor="local_origem_id">Sai de</label>
          <select id="local_origem_id" name="local_origem_id" defaultValue={loja} required>
            {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
      )}
      {regra.destino && (
        <div className="campo">
          <label htmlFor="local_destino_id">Vai para</label>
          <select id="local_destino_id" name="local_destino_id" defaultValue={regra.origem ? "" : loja} required>
            {regra.origem && <option value="" disabled>Escolha</option>}
            {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
      )}
      <div className="campo">
        <label htmlFor="observacao">Observação</label>
        <textarea id="observacao" name="observacao" placeholder={tipo.startsWith("ajuste") || tipo === "perda" ? "Obrigatório: motivo do ajuste ou da perda" : "Opcional"} />
      </div>
      <BotaoEnviar enviando="Registrando…">Registrar</BotaoEnviar>
    </FormAcao>
  );
}
