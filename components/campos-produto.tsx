export type Opcao = { id: string; nome: string };
export type Cor = { id: string; nome: string; hex: string | null };
type Valores = Partial<{ referencia: string; nome: string; grade_id: string; categoria_id: string | null; colecao_id: string | null; preco_venda: number | null; custo_previsto: number | null; ncm: string | null; descricao: string | null }>;

const paraCampo = (n: number | null | undefined) => (n == null ? "" : n.toFixed(2).replace(".", ","));

export function CamposProduto({ grades, categorias, colecoes, valores = {}, gradeFixa = false }: {
  grades: Opcao[]; categorias: Opcao[]; colecoes: Opcao[]; valores?: Valores; gradeFixa?: boolean;
}) {
  return (
    <div className="campos tres">
      <div className="campo">
        <label htmlFor="referencia">Referência</label>
        <input id="referencia" name="referencia" defaultValue={valores.referencia} required maxLength={30} placeholder="VL001" style={{ textTransform: "uppercase" }} />
        <span className="ajuda">Vira o começo do SKU de cada variante.</span>
      </div>
      <div className="campo" style={{ gridColumn: "span 2" }}>
        <label htmlFor="nome">Nome</label>
        <input id="nome" name="nome" defaultValue={valores.nome} required placeholder="Vestido Lírio" />
      </div>
      <div className="campo">
        <label htmlFor="grade_id">Grade de tamanhos</label>
        <select id="grade_id" name="grade_id" defaultValue={valores.grade_id ?? ""} required disabled={gradeFixa}>
          <option value="" disabled>Escolha</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
        {gradeFixa && <input type="hidden" name="grade_id" value={valores.grade_id} />}
        {gradeFixa && <span className="ajuda">A grade não muda depois que as variantes existem.</span>}
      </div>
      <div className="campo">
        <label htmlFor="categoria_id">Categoria</label>
        <select id="categoria_id" name="categoria_id" defaultValue={valores.categoria_id ?? ""}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="colecao_id">Coleção</label>
        <select id="colecao_id" name="colecao_id" defaultValue={valores.colecao_id ?? ""}>
          <option value="">Sem coleção</option>
          {colecoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="preco_venda">Preço de venda (R$)</label>
        <input id="preco_venda" name="preco_venda" inputMode="decimal" defaultValue={paraCampo(valores.preco_venda)} placeholder="289,90" />
      </div>
      <div className="campo">
        <label htmlFor="custo_previsto">Custo previsto (R$)</label>
        <input id="custo_previsto" name="custo_previsto" inputMode="decimal" defaultValue={paraCampo(valores.custo_previsto)} placeholder="96,50" />
        <span className="ajuda">Vem da ficha técnica quando ela existir.</span>
      </div>
      <div className="campo">
        <label htmlFor="ncm">NCM</label>
        <input id="ncm" name="ncm" inputMode="numeric" defaultValue={valores.ncm ?? ""} placeholder="62044200" maxLength={10} />
        <span className="ajuda">Código fiscal para a NFC-e. Defina com o contador.</span>
      </div>
      <div className="campo inteiro">
        <label htmlFor="descricao">Descrição</label>
        <textarea id="descricao" name="descricao" defaultValue={valores.descricao ?? ""} placeholder="Tecido, modelagem, detalhes que ajudam a vender." />
      </div>
    </div>
  );
}

export function EscolhaCores({ cores, marcadas = [] }: { cores: Cor[]; marcadas?: string[] }) {
  return (
    <fieldset className="campo" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="rotulo" style={{ marginBottom: 8 }}>Cores</legend>
      <div className="fichas">
        {cores.map((c) => (
          <label className="ficha" key={c.id}>
            <input type="checkbox" name="cores" value={c.id} defaultChecked={marcadas.includes(c.id)} />
            <span><i className="amostra" style={{ background: c.hex ?? "#fff" }} />{c.nome}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
