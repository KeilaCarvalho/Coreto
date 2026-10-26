import Link from "next/link";
import { Suspense } from "react";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho, Vazio } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { LinhaClicavel } from "@/components/linha-clicavel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { CamposCliente } from "@/components/campos-cliente";
import { criarCliente } from "../acoes";
import { etapa, linkWhats, primeiroNome, telefoneBonito, ETAPAS } from "@/lib/clientes";
import { dataCurta, numero, reais } from "@/lib/formatos";

export const metadata = { title: "Clientes" };

type Cliente = {
  id: string; nome: string; telefone: string | null; cidade: string | null; nascimento: string | null; ultima_compra: string | null;
  total_gasto: number; qtd_compras: number; etapa: string; proximo_contato: string | null; vendedora_nome: string | null;
  vendedora: { nome: string; apelido: string | null } | null;
};

const VISOES = [
  { valor: "retornos", rotulo: "Retornos de hoje" },
  { valor: "aniversariantes", rotulo: "Aniversariantes do mês" },
  { valor: "nao_contatadas", rotulo: "Não contatadas" },
  { valor: "sumidas", rotulo: "Sem comprar há 90 dias" },
  { valor: "todas", rotulo: "Todas" },
];

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default async function Clientes({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string; vendedora?: string }> }) {
  const sessao = await exigir("comercial");
  const { ver = "retornos", q = "", vendedora = "" } = await searchParams;
  const supabase = await supabaseServidor();
  const gestao = sessao.pode("comercial", "aprovar");
  const hoje = hojeSP();
  const mes = hoje.slice(5, 7);
  const noventa = new Date(Date.now() - 90 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  // A carteira inteira (cada vendedora só recebe a dela, pelo banco) — os contadores saem daqui.
  const termo = q.trim().replace(/[%,()]/g, "");
  const pagina = (de: number) => {
    let consulta = supabase.from("clientes")
      .select("id, nome, telefone, cidade, nascimento, ultima_compra, total_gasto, qtd_compras, etapa, proximo_contato, vendedora_nome, vendedora:pessoas!vendedora_id(nome, apelido)")
      .is("arquivado_em", null).order("nome").order("id").range(de, de + 999);
    if (gestao && vendedora === "sem") consulta = consulta.is("vendedora_id", null);
    else if (gestao && /^[0-9a-f-]{36}$/i.test(vendedora)) consulta = consulta.eq("vendedora_id", vendedora);
    if (termo) consulta = consulta.or(`nome.ilike.%${termo}%,telefone.ilike.%${termo.replace(/\D/g, "") || termo}%,codigo_externo.eq.${termo}`);
    return consulta;
  };
  const todas: Cliente[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data: lote } = await pagina(de);
    todas.push(...((lote ?? []) as unknown as Cliente[]));
    if (!lote || lote.length < 1000) break;
  }
  const { data: vendedorasR } = gestao
    ? await supabase.from("pessoas").select("id, nome, apelido").eq("e_vendedora", true).is("arquivado_em", null).order("nome")
    : { data: [] };
  const aniversario = (c: Cliente) => c.nascimento?.slice(5, 7) === mes;
  const filtros: Record<string, (c: Cliente) => boolean> = {
    retornos: (c) => !!c.proximo_contato && c.proximo_contato <= hoje,
    aniversariantes: aniversario,
    nao_contatadas: (c) => c.etapa === "nao_contatada",
    sumidas: (c) => !!c.ultima_compra && c.ultima_compra < noventa,
    todas: () => true,
  };
  const visao = filtros[ver] ? ver : "retornos";
  let lista = todas.filter(filtros[visao]);
  if (visao === "retornos") lista = lista.sort((a, b) => (a.proximo_contato ?? "").localeCompare(b.proximo_contato ?? ""));
  if (visao === "aniversariantes") lista = lista.sort((a, b) => (a.nascimento ?? "").slice(8).localeCompare((b.nascimento ?? "").slice(8)));
  const exibidas = lista.slice(0, 300);
  const conta = (v: string) => todas.filter(filtros[v]).length;
  const nomeVendedora = sessao.pessoa!.nome.split(" ")[0];
  const filtroUrl = (v: string) => `/comercial/clientes?ver=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}${vendedora ? `&vendedora=${vendedora}` : ""}`;

  return (
    <>
      <Cabecalho
        titulo={gestao ? "Clientes" : "Minhas clientes"}
        descricao={gestao ? "A carteira de cada vendedora, com retornos, aniversariantes e histórico de contatos." : "Sua carteira: quem chamar hoje, aniversariantes e o histórico de cada cliente."}
        acoes={<>
          {gestao && <Link className="botao secundario" href="/comercial/relatorios"><Icone nome="arquivo" />Importar relatórios</Link>}
          {sessao.pode("comercial", "criar") && <Link className="botao" href={`${filtroUrl(visao)}&nova=1`} scroll={false}><Icone nome="mais" />Nova cliente</Link>}
        </>}
      />
      <Suspense><AvisoDaUrl /></Suspense>
      <div className="kpis">
        <Kpi destaque titulo="Retornos para hoje" valor={numero(conta("retornos"))} nota="incluindo atrasados" href={filtroUrl("retornos")} />
        <Kpi titulo="Aniversariantes do mês" valor={numero(conta("aniversariantes"))} nota="uma mensagem faz diferença" href={filtroUrl("aniversariantes")} />
        <Kpi titulo="Não contatadas" valor={numero(conta("nao_contatadas"))} nota="ainda sem nenhum contato" href={filtroUrl("nao_contatadas")} />
        <Kpi titulo="Na carteira" valor={numero(todas.length)} nota={`${numero(conta("sumidas"))} sem comprar há 90 dias`} href={filtroUrl("todas")} />
      </div>

      <section className="painel">
        <div className="painel-topo">
          <nav className="abas" aria-label="Filtrar clientes">
            {VISOES.map((v) => (
              <Link key={v.valor} href={filtroUrl(v.valor)} className={visao === v.valor ? "ativa" : undefined} aria-current={visao === v.valor ? "page" : undefined}>
                {v.rotulo}<span className="contador">{conta(v.valor)}</span>
              </Link>
            ))}
          </nav>
          <form role="search" className="filtros">
            <input type="hidden" name="ver" value={visao} />
            {gestao && (
              <select className="entrada" name="vendedora" defaultValue={vendedora} aria-label="Vendedora" style={{ minWidth: 160 }}>
                <option value="">Todas as vendedoras</option>
                {((vendedorasR ?? []) as { id: string; nome: string; apelido: string | null }[]).map((v) => <option key={v.id} value={v.id}>{v.apelido || v.nome}</option>)}
                <option value="sem">Sem vendedora</option>
              </select>
            )}
            <input className="entrada" name="q" defaultValue={q} placeholder="Nome, telefone ou código" aria-label="Buscar cliente" />
            <button className="botao leve pequeno" type="submit"><Icone nome="busca" />Buscar</button>
          </form>
        </div>
        {exibidas.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Cliente</th><th>Contato</th>{gestao && <th>Vendedora</th>}<th>Última compra</th><th className="num">Total comprado</th><th>Etapa</th><th>Próximo contato</th></tr></thead>
              <tbody>
                {exibidas.map((c) => {
                  const e = etapa(c.etapa);
                  const msg = aniversario(c)
                    ? `Oi, ${primeiroNome(c.nome)}! Aqui é a ${nomeVendedora}, da Coreto. Feliz aniversário! 🎉`
                    : `Oi, ${primeiroNome(c.nome)}! Aqui é a ${nomeVendedora}, da Coreto. Tudo bem?`;
                  const whats = linkWhats(c.telefone, msg);
                  return (
                    <LinhaClicavel key={c.id} href={`/comercial/clientes/${c.id}`}>
                      <td>
                        <Link className="linha-link" href={`/comercial/clientes/${c.id}`}>{c.nome}</Link>
                        <div className="mini">{[c.cidade, aniversario(c) && c.nascimento ? `aniversário ${dataCurta(c.nascimento).slice(0, 5)}` : null].filter(Boolean).join(" · ") || " "}</div>
                      </td>
                      <td>
                        <div className="contatos-rapidos">
                          <span className="mini" style={{ alignSelf: "center" }}>{telefoneBonito(c.telefone)}</span>
                          {whats && <a className="botao whatsapp pequeno" href={whats} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${c.nome}`}><Icone nome="whatsapp" /></a>}
                        </div>
                      </td>
                      {gestao && <td className="mini">{c.vendedora ? (c.vendedora.apelido || c.vendedora.nome) : c.vendedora_nome ? <span title="Nome do relatório ainda não ligado a ninguém da equipe">{c.vendedora_nome} ?</span> : "—"}</td>}
                      <td className="mini">{dataCurta(c.ultima_compra)}</td>
                      <td className="num">{reais(c.total_gasto)}<div className="mini">{numero(c.qtd_compras)} {c.qtd_compras === 1 ? "compra" : "compras"}</div></td>
                      <td><span className={`etiqueta ${e.classe}`}>{e.rotulo}</span></td>
                      <td className={c.proximo_contato && c.proximo_contato < hoje ? "atrasado" : c.proximo_contato === hoje ? undefined : "mini"}>
                        {c.proximo_contato ? (c.proximo_contato === hoje ? <strong>Hoje</strong> : dataCurta(c.proximo_contato)) : "—"}
                      </td>
                    </LinhaClicavel>
                  );
                })}
              </tbody>
            </table>
            {lista.length > exibidas.length && <p className="painel-corpo mini">Mostrando 300 de {numero(lista.length)}. Use a busca para achar uma cliente.</p>}
          </div>
        ) : (
          <Vazio
            titulo={todas.length ? "Ninguém nesta lista" : "A carteira está vazia"}
            texto={todas.length ? (visao === "retornos" ? "Nenhum retorno marcado para hoje. Quando registrar um contato, escolha a data do próximo." : "Nenhuma cliente neste filtro.")
              : gestao ? "Importe os relatórios do sistema de vendas ou a carteira do sistema antigo." : "Suas clientes aparecem aqui quando a gestão importar os relatórios. Você também pode cadastrar uma cliente."}>
            {!todas.length && gestao && <Link className="botao" href="/comercial/relatorios"><Icone nome="arquivo" />Importar relatórios</Link>}
          </Vazio>
        )}
      </section>
      {sessao.pode("comercial", "criar") && (
        <Suspense>
          <JanelaLateral param="nova" titulo="Nova cliente"
            subtitulo={gestao ? "Para quem ainda não aparece nos relatórios do sistema de vendas." : "A cliente entra direto na sua carteira."}>
            <FormAcao acao={criarCliente}>
              <div className="bloco-janela">
                <CamposCliente valores={{ uf: "GO", cidade: "Goiânia" }}
                  vendedoras={gestao ? ((vendedorasR ?? []) as { id: string; nome: string; apelido: string | null }[]).map((v) => ({ id: v.id, nome: v.apelido || v.nome })) : undefined} />
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar enviando="Cadastrando…">Cadastrar cliente</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
      {gestao && (
        <p className="mini" style={{ marginTop: 12 }}>Etapas: {ETAPAS.map((e) => e.rotulo).join(" → ")}. Para cada vendedora ver a própria carteira, informe em Equipe o nome dela como aparece nos relatórios.</p>
      )}
    </>
  );
}
