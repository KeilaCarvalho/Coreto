import Link from "next/link";
import { lerSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { BarrasSemana, Kpi, Medidor } from "@/components/painel";
import { hojeExtenso, horaSP, numero, reais } from "@/lib/formatos";

export const metadata = { title: "Início" };

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const diaSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const MARCADORES = ["", "areia", "rosa", "ceu"];

type Saldo = { saldo: number; local_id: string };
type Local = { id: string; tipo: string };
type Mov = { quantidade: number; ocorrido_em: string; tipo: string };
type Pessoa = { id: string; nome: string; email: string | null; acesso_ativo: boolean; usuario_id: string | null; criado_em: string; perfis: { nome: string } | null };
type Produto = { id: string; referencia: string; nome: string; preco_venda: number | null; variantes: { id: string }[] };

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const sessao = (await lerSessao())!;
  const { aviso } = await searchParams;
  const supabase = await supabaseServidor();
  const veEstoque = sessao.pode("estoque");
  const vePessoas = sessao.pode("pessoas") || sessao.pode("configuracoes");
  const administra = sessao.pode("configuracoes", "editar");

  const agora = new Date();
  const seteDias = new Date(agora.getTime() - 6 * 864e5);
  const inicioJanela = `${diaSP(seteDias)}T00:00:00-03:00`;

  const vazio = { data: null } as const;
  const [produtosR, variantesR, saldosR, locaisR, movR, pessoasR] = await Promise.all([
    supabase.from("produtos").select("id, referencia, nome, preco_venda, variantes(id)", { count: "exact" }).is("arquivado_em", null).order("criado_em", { ascending: false }).limit(5),
    supabase.from("variantes").select("id", { count: "exact", head: true }).eq("ativa", true),
    veEstoque ? supabase.from("saldos_estoque").select("saldo, local_id") : vazio,
    supabase.from("locais_estoque").select("id, tipo"),
    veEstoque ? supabase.from("movimentacoes_estoque").select("quantidade, ocorrido_em, tipo").gte("ocorrido_em", inicioJanela).neq("tipo", "estorno") : vazio,
    vePessoas ? supabase.from("pessoas").select("id, nome, email, acesso_ativo, usuario_id, criado_em, perfis(nome)").is("arquivado_em", null).not("usuario_id", "is", null).order("acesso_ativo").order("nome").limit(6) : vazio,
  ]);

  const produtos = (produtosR.data ?? []) as unknown as Produto[];
  const saldos = (saldosR.data ?? []) as Saldo[];
  const tipoLocal = new Map(((locaisR.data ?? []) as Local[]).map((l) => [l.id, l.tipo]));
  const porTipo = (tipos: string[]) => saldos.filter((s) => tipos.includes(tipoLocal.get(s.local_id) ?? "")).reduce((t, s) => t + s.saldo, 0);
  const pecas = saldos.reduce((t, s) => t + s.saldo, 0);
  const naLoja = porTipo(["loja"]), noDeposito = porTipo(["deposito"]), nasFaccoes = porTipo(["faccao"]), outros = pecas - naLoja - noDeposito - nasFaccoes;

  const hoje = diaSP(agora);
  const movimentos = (movR.data ?? []) as Mov[];
  const semana = Array.from({ length: 7 }, (_, i) => {
    const data = new Date(seteDias.getTime() + i * 864e5);
    const chave = diaSP(data);
    const valor = movimentos.filter((m) => diaSP(new Date(m.ocorrido_em)) === chave).reduce((t, m) => t + m.quantidade, 0);
    const semanaDia = new Date(`${chave}T12:00:00-03:00`).getDay();
    return { rotulo: DIAS[semanaDia], valor, hoje: chave === hoje };
  });
  const entradasHoje = movimentos.filter((m) => diaSP(new Date(m.ocorrido_em)) === hoje && ["entrada_producao", "ajuste_entrada", "retorno_faccao"].includes(m.tipo)).reduce((t, m) => t + m.quantidade, 0);

  const pessoas = (pessoasR.data ?? []) as unknown as Pessoa[];
  const pendente = administra ? pessoas.find((p) => !p.acesso_ativo) : undefined;
  const hora = horaSP();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = sessao.pessoa!.nome.split(" ")[0];
  const podeCriar = sessao.pode("produto", "criar");

  return (
    <>
      {aviso === "sem-permissao" && <p className="aviso alerta" role="alert"><Icone nome="alerta" />Seu perfil não tem acesso àquela área. Fale com a administração se precisar.</p>}
      <Cabecalho
        titulo={`${saudacao}, ${primeiroNome}`}
        descricao={`${hojeExtenso(agora)}. Acompanhe o estoque, a equipe e o que entra nas próximas fases.`}
        acoes={<>
          {podeCriar && <Link className="botao" href="/produto/catalogo/novo"><Icone nome="mais" />Novo produto</Link>}
          {sessao.pode("estoque", "criar") && <Link className="botao secundario" href="/estoque/movimentacoes"><Icone nome="entrada" />Registrar entrada</Link>}
        </>}
      />

      <div className="kpis">
        <Kpi destaque titulo="Peças em estoque" valor={veEstoque ? numero(pecas) : "—"} nota="somando todos os locais" chip={entradasHoje ? `+${entradasHoje} hoje` : undefined} href={veEstoque ? "/estoque/saldos" : undefined} />
        <Kpi titulo="Produtos no catálogo" valor={numero(produtosR.count ?? 0)} nota="modelos ativos" href="/produto/catalogo" />
        <Kpi titulo="Variantes ativas" valor={numero(variantesR.count ?? 0)} nota="cores e tamanhos com SKU" href="/produto/catalogo" />
        <Kpi titulo="Com as facções" valor={veEstoque ? numero(nasFaccoes) : "—"} nota="peças em produção fora da loja" href={veEstoque ? "/estoque/saldos" : undefined} />
      </div>

      <div className="painel-inicio">
        {veEstoque && (
          <section className="painel col-5">
            <div className="painel-topo">
              <div><h2>Movimento da semana</h2><p>Peças que entraram ou saíram do estoque por dia</p></div>
              <div className="legenda"><span><i style={{ background: "var(--verde-700)" }} />Maior dia</span><span><i style={{ background: "var(--marca)" }} />Hoje</span></div>
            </div>
            <BarrasSemana dias={semana} />
          </section>
        )}

        <section className="painel col-3">
          <div className="painel-topo"><div><h2>Pendência</h2></div>{pendente && <span className="etiqueta alerta">Acesso</span>}</div>
          {pendente ? (
            <div className="lembrete">
              <h3>{pendente.nome} pediu acesso ao sistema</h3>
              <p>{pendente.email}. Escolha o perfil e libere em Acessos.</p>
              <Link className="botao" href="/configuracoes/acessos"><Icone nome="acessos" />Revisar acesso</Link>
            </div>
          ) : produtos.length === 0 && podeCriar ? (
            <div className="lembrete">
              <h3>Cadastre o primeiro produto</h3>
              <p>Comece pelas cores em Cadastros e depois crie o modelo com a grade.</p>
              <Link className="botao" href="/produto/catalogo/novo"><Icone nome="mais" />Novo produto</Link>
            </div>
          ) : (
            <div className="lembrete">
              <h3>Nada pendente por aqui</h3>
              <p>Pedidos de acesso e avisos do sistema aparecem neste cartão.</p>
            </div>
          )}
        </section>

        <section className="painel col-4">
          <div className="painel-topo"><div><h2>Produtos</h2><p>Os mais recentes do catálogo</p></div>{podeCriar && <Link className="botao secundario pequeno" href="/produto/catalogo/novo"><Icone nome="mais" />Novo</Link>}</div>
          {produtos.length ? (
            <ul className="lista-simples">
              {produtos.map((p, i) => (
                <li key={p.id}>
                  <Link href={`/produto/catalogo/${p.id}`} className="item" style={{ color: "inherit" }}>
                    <span className={`marcador ${MARCADORES[i % 4]}`}><Icone nome="catalogo" /></span>
                    <div><strong>{p.nome}</strong><span>{p.referencia}, {p.variantes.length} variantes</span></div>
                  </Link>
                  <span className="mini preco" style={{ color: "var(--suave)" }}>{reais(p.preco_venda)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="painel-corpo" style={{ color: "var(--suave)" }}>Nenhum produto ainda.</p>}
        </section>

        {vePessoas && (
          <section className="painel col-5">
            <div className="painel-topo"><div><h2>Equipe</h2><p>Quem tem login e com qual perfil</p></div><Link className="botao secundario pequeno" href="/pessoas/equipe"><Icone nome="mais" />Adicionar</Link></div>
            <ul className="lista-simples">
              {pessoas.map((p, i) => (
                <li key={p.id}>
                  <div className="item">
                    <span className={`marcador ${MARCADORES[i % 4]}`}>{p.nome.split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase()}</span>
                    <div><strong>{p.nome}</strong><span>{p.email}</span></div>
                  </div>
                  {p.acesso_ativo ? <span className="etiqueta ok">{p.perfis?.nome}</span> : <span className="etiqueta alerta">Aguardando liberação</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {veEstoque && (
          <section className="painel col-4">
            <div className="painel-topo"><div><h2>Estoque por local</h2></div></div>
            <Medidor
              destaque={pecas ? `${Math.round((naLoja / pecas) * 100)}%` : "0"}
              legenda={pecas ? "das peças estão na loja" : "nenhuma peça ainda"}
              partes={[
                { nome: "Loja", valor: naLoja, cor: "#2f322d" },
                { nome: "Depósito", valor: noDeposito, cor: "#00a7aa" },
                { nome: "Facções", valor: nasFaccoes, cor: "url(#listra)" },
                ...(outros ? [{ nome: "Outros", valor: outros, cor: "#8fe3e4" }] : []),
              ]}
            />
          </section>
        )}

        <section className="roteiro col-3">
          <h2>Roteiro do sistema</h2>
          <p className="grande">Fase 1</p>
          <p>Fundação: cadastros, estoque e acessos. Próxima: quadro de produção, facções e corte.</p>
          <div className="trilho" aria-hidden="true"><i className="feito" /><i className="agora" /><i /><i /><i /><i /></div>
          <div className="fases" aria-hidden="true"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
        </section>
      </div>
    </>
  );
}
