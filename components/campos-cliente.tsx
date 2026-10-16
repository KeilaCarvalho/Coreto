type Valores = {
  nome?: string; telefone?: string | null; telefone_2?: string | null; email?: string | null; cpf?: string | null; nascimento?: string | null;
  cidade?: string | null; uf?: string | null; codigo_externo?: string | null; observacao?: string | null; vendedora_id?: string | null;
};

/** Campos do cadastro da cliente (servem para criar e para editar). */
export function CamposCliente({ valores = {}, vendedoras }: { valores?: Valores; vendedoras?: { id: string; nome: string }[] }) {
  return (
    <div className="campos duas">
      <div className="campo inteiro"><label htmlFor="nome">Nome</label><input id="nome" name="nome" defaultValue={valores.nome ?? ""} required /></div>
      <div className="campo"><label htmlFor="telefone">WhatsApp</label><input id="telefone" name="telefone" inputMode="tel" defaultValue={valores.telefone ?? ""} placeholder="(62) 99999-0000" /></div>
      <div className="campo"><label htmlFor="telefone_2">Outro telefone</label><input id="telefone_2" name="telefone_2" inputMode="tel" defaultValue={valores.telefone_2 ?? ""} /></div>
      <div className="campo"><label htmlFor="nascimento">Aniversário</label><input id="nascimento" name="nascimento" type="date" defaultValue={valores.nascimento ?? ""} /></div>
      <div className="campo"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" defaultValue={valores.email ?? ""} /></div>
      <div className="campo"><label htmlFor="cidade">Cidade</label><input id="cidade" name="cidade" defaultValue={valores.cidade ?? ""} placeholder="Goiânia" /></div>
      <div className="campo"><label htmlFor="uf">UF</label><input id="uf" name="uf" maxLength={2} defaultValue={valores.uf ?? ""} placeholder="GO" style={{ textTransform: "uppercase" }} /></div>
      <div className="campo"><label htmlFor="cpf">CPF</label><input id="cpf" name="cpf" inputMode="numeric" defaultValue={valores.cpf ?? ""} /></div>
      <div className="campo"><label htmlFor="codigo_externo">Código no sistema de vendas</label><input id="codigo_externo" name="codigo_externo" defaultValue={valores.codigo_externo ?? ""} /><span className="ajuda">Liga a cliente aos relatórios importados.</span></div>
      {vendedoras && (
        <div className="campo">
          <label htmlFor="vendedora_id">Vendedora responsável</label>
          <select id="vendedora_id" name="vendedora_id" defaultValue={valores.vendedora_id ?? ""}>
            <option value="">Sem vendedora</option>
            {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </div>
      )}
      <div className="campo inteiro"><label htmlFor="observacao">Observações</label><textarea id="observacao" name="observacao" defaultValue={valores.observacao ?? ""} placeholder="Tamanho que usa, estilo, peças que gostou…" /></div>
    </div>
  );
}
