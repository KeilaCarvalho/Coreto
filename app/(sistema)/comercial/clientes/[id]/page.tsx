import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { Kpi } from "@/components/painel";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { CamposCliente } from "@/components/campos-cliente";
import { CamposContato } from "@/components/clientes/form-contato";
import { AvisoDaUrl, CancelarJanela, JanelaLateral } from "@/components/janela-lateral";
import { etapa, linkWhats, primeiroNome, telefoneBonito } from "@/lib/clientes";
import { dataCurta, numero, reais } from "@/lib/formatos";
import { editarCliente, registrarContato } from "../../acoes";

type Cliente = {
  id: string; codigo_externo: string | null; nome: string; cpf: string | null; nascimento: string | null; telefone: string | null; telefone_2: string | null;
  email: string | null; cidade: string | null; uf: string | null; vendedora_id: string | null; vendedora_nome: string | null; primeira_compra: string | null;
  ultima_compra: string | null; qtd_compras: number; qtd_pecas: number; total_gasto: number; etapa: string; proximo_contato: string | null; observacao: string | null;
  vendedora: { nome: string; apelido: string | null } | null;
};
type Contato = { id: number; etapa: string; nota: string; contatado_em: string; proximo_contato: string | null; registrado_em: string; quem: { nome: string } | null };
type Compra = { id: number; codigo_venda: string; data: string; valor: number; valor_trocas: number; vendedora_nome: string | null };

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("clientes").select("nome").eq("id", (await params).id).maybeSingle();
  return { title: data?.nome ?? "Cliente" };
}

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigir("comercial");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await supabaseServidor();
  const gestao = sessao.pode("comercial", "aprovar");
  const [{ data }, { data: contatosR }, { data: comprasR }, { data: vendedorasR }] = await Promise.all([
    supabase.from("clientes").select("*, vendedora:pessoas!vendedora_id(nome, apelido)").eq("id", id).maybeSingle(),
    supabase.from("cliente_contatos").select("id, etapa, nota, contatado_em, proximo_contato, registrado_em, quem:pessoas!pessoa_id(nome)").eq("cliente_id", id).order("contatado_em", { ascending: false }).order("id", { ascending: false }).limit(100),
    supabase.from("cliente_compras").select("id, codigo_venda, data, valor, valor_trocas, vendedora_nome").eq("cliente_id", id).order("data", { ascending: false }).limit(100),
    gestao ? supabase.from("pessoas").select("id, nome, apelido").eq("e_vendedora", true).is("arquivado_em", null).order("nome") : Promise.resolve({ data: null }),
  ]);
  if (!data) notFound();
  const c = data as unknown as Cliente;
  const contatos = (contatosR ?? []) as unknown as Contato[];
  const compras = (comprasR ?? []) as Compra[];
  const e = etapa(c.etapa);
  const hoje = hojeSP();
  const eu = sessao.pessoa!.nome.split(" ")[0];
  const aniversarioNoMes = c.nascimento?.slice(5, 7) === hoje.slice(5, 7);
  const mensagens = [
    { rotulo: "Oi", texto: `Oi, ${primeiroNome(c.nome)}! Aqui é a ${eu}, da Coreto. Tudo bem?` },
    { rotulo: "Novidades", texto: `Oi, ${primeiroNome(c.nome)}! Aqui é a ${eu}, da Coreto. Chegaram peças novas que são a sua cara. Posso te mandar as fotos?` },
    ...(aniversarioNoMes ? [{ rotulo: "Aniversário", texto: `Oi, ${primeiroNome(c.nome)}! Aqui é a ${eu}, da Coreto. Feliz aniversário! 🎉 Passa aqui na loja esse mês que temos um mimo para você.` }] : []),
  ];
  const vendedoraNome = c.vendedora ? (c.vendedora.apelido || c.vendedora.nome) : c.vendedora_nome;
  const ticket = c.qtd_compras ? c.total_gasto / c.qtd_compras : null;
  const podeContato = sessao.pode("comercial", "criar");
  const podeEditar = gestao || podeContato;

  return (
    <>
      <Cabecalho
        trilha={[{ rotulo: "Clientes", href: "/comercial/clientes" }]}
        titulo={c.nome}
        descricao={[telefoneBonito(c.telefone), [c.cidade, c.uf].filter(Boolean).join("/") || null, vendedoraNome ? `carteira de ${vendedoraNome}` : "sem vendedora"].filter(Boolean).join(" · ")}
        acoes={<div className="cliente-acoes">
          <span className={`etiqueta ${e.classe}`} style={{ fontSize: 13, padding: "6px 14px" }}>{e.rotulo}</span>
          {podeEditar && <Link className="botao secundario" href="?acao=editar" scroll={false}><Icone nome="lapis" />Editar dados</Link>}
          {podeContato && <Link className="botao" href="?acao=contato" scroll={false}><Icone nome="mais" />Registrar contato</Link>}
        </div>}
      />
      <Suspense><AvisoDaUrl /></Suspense>
      {c.proximo_contato && c.proximo_contato <= hoje && (
        <p className="aviso alerta"><Icone nome="relogio" />Retorno marcado para {c.proximo_contato === hoje ? "hoje" : dataCurta(c.proximo_contato)}.</p>
      )}
      {aniversarioNoMes && c.nascimento && <p className="aviso ok"><Icone nome="bolo" />Aniversário em {dataCurta(c.nascimento).slice(0, 5)}.</p>}

      <div className="kpis">
        <Kpi destaque titulo="Total comprado" valor={reais(c.total_gasto)} nota={`${numero(c.qtd_compras)} ${c.qtd_compras === 1 ? "compra" : "compras"}`} />
        <Kpi titulo="Última compra" valor={dataCurta(c.ultima_compra)} nota={c.primeira_compra ? `cliente desde ${dataCurta(c.primeira_compra)}` : "primeira compra não informada"} />
        <Kpi titulo="Ticket médio" valor={reais(ticket)} nota={c.qtd_pecas ? `${numero(c.qtd_pecas)} peças na 1ª compra` : "por compra"} />
        <Kpi titulo="Próximo contato" valor={c.proximo_contato ? (c.proximo_contato === hoje ? "Hoje" : dataCurta(c.proximo_contato).slice(0, 5)) : "—"} nota={c.proximo_contato ? dataCurta(c.proximo_contato) : "nenhum retorno marcado"} />
      </div>

      <div className="grade-lateral">
        <div style={{ display: "grid", gap: 16 }}>
          <section className="painel">
            <div className="painel-topo"><div><h2>Chamar no WhatsApp</h2><p>Abre a conversa com a mensagem pronta. Depois, toque em “Registrar contato” lá em cima.</p></div></div>
            <div className="painel-corpo">
              <div className="contatos-rapidos">
                {mensagens.map((m) => {
                  const link = linkWhats(c.telefone, m.texto);
                  return link
                    ? <a key={m.rotulo} className="botao whatsapp" href={link} target="_blank" rel="noreferrer"><Icone nome="whatsapp" />{m.rotulo}</a>
                    : null;
                })}
                {!c.telefone && <p className="mini">Sem telefone cadastrado.</p>}
                {c.telefone_2 && <a className="botao leve" href={`tel:${c.telefone_2.replace(/\D/g, "")}`}><Icone nome="telefone" />{telefoneBonito(c.telefone_2)}</a>}
              </div>
            </div>
          </section>

          <section className="painel">
            <div className="painel-topo"><div><h2>Histórico de contatos</h2></div></div>
            {contatos.length ? (
              <ul className="linha-tempo">
                {contatos.map((h) => (
                  <li key={h.id}>
                    <strong>{etapa(h.etapa).rotulo}</strong>
                    <span>{dataCurta(h.contatado_em)} · {h.quem?.nome ?? "—"}{h.proximo_contato ? ` · retorno em ${dataCurta(h.proximo_contato)}` : ""}</span>
                    <p>{h.nota}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="painel-corpo mini">Nenhum contato registrado ainda.</p>}
          </section>

          <section className="painel">
            <div className="painel-topo"><div><h2>Compras</h2><p>Das vendas importadas dos relatórios.</p></div></div>
            {compras.length ? (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>Data</th><th>Venda</th><th>Vendedora</th><th className="num">Valor</th></tr></thead>
                  <tbody>
                    {compras.map((v) => (
                      <tr key={v.id}>
                        <td>{dataCurta(v.data)}</td>
                        <td className="mini">{v.codigo_venda}</td>
                        <td className="mini">{v.vendedora_nome ?? "—"}</td>
                        <td className="num"><strong>{reais(v.valor)}</strong>{v.valor_trocas ? <div className="mini">troca {reais(v.valor_trocas)}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="painel-corpo mini">Nenhuma compra importada para esta cliente.</p>}
          </section>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section className="painel">
            <div className="painel-topo"><div><h2>Dados da cliente</h2></div>{c.codigo_externo && <span className="mini">código {c.codigo_externo}</span>}</div>
            <dl className="dados-cliente">
              <div><dt>WhatsApp</dt><dd>{telefoneBonito(c.telefone)}</dd></div>
              <div><dt>Aniversário</dt><dd>{c.nascimento ? dataCurta(c.nascimento) : "—"}</dd></div>
              <div><dt>E-mail</dt><dd>{c.email ?? "—"}</dd></div>
              <div><dt>CPF</dt><dd>{c.cpf ?? "—"}</dd></div>
              {c.observacao && <div style={{ gridColumn: "1 / -1" }}><dt>Observações</dt><dd style={{ fontWeight: 500 }}>{c.observacao}</dd></div>}
            </dl>
          </section>
        </div>
      </div>

      {podeContato && (
        <Suspense>
          <JanelaLateral param="acao" valor="contato" titulo="Registrar contato" subtitulo={`${c.nome} · etapa atual: ${e.rotulo}`}>
            <FormAcao acao={registrarContato}>
              <input type="hidden" name="cliente_id" value={c.id} />
              <CamposContato etapaAtual={c.etapa} hoje={hoje} />
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar contato</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
      {podeEditar && (
        <Suspense>
          <JanelaLateral param="acao" valor="editar" titulo="Editar dados" subtitulo={c.codigo_externo ? `Código no sistema de vendas: ${c.codigo_externo}` : c.nome}>
            <FormAcao acao={editarCliente}>
              <input type="hidden" name="id" value={c.id} />
              <div className="bloco-janela">
                <CamposCliente valores={c}
                  vendedoras={gestao ? ((vendedorasR ?? []) as { id: string; nome: string; apelido: string | null }[]).map((v) => ({ id: v.id, nome: v.apelido || v.nome })) : undefined} />
              </div>
              <div className="formulario-rodape"><CancelarJanela /><BotaoEnviar>Salvar dados</BotaoEnviar></div>
            </FormAcao>
          </JanelaLateral>
        </Suspense>
      )}
    </>
  );
}
