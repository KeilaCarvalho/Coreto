import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { preCadastrarAcesso, salvarAcesso } from "../acoes";

export const metadata = { title: "Acessos" };

type Pessoa = { id: string; nome: string; email: string | null; perfil_id: string | null; acesso_ativo: boolean; usuario_id: string | null; ultimo_acesso: string | null };
type AcessoDia = { dia: string; primeiro: string; ultimo: string; vezes: number; pessoas: { nome: string } | null };

const horaSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const diaSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
function quando(iso: string | null) {
  if (!iso) return "Nunca entrou";
  const d = new Date(iso);
  if (Date.now() - d.getTime() < 5 * 60e3) return "Agora há pouco";
  const hoje = diaSP(new Date()), ontem = diaSP(new Date(Date.now() - 864e5)), dia = diaSP(d);
  if (dia === hoje) return `Hoje às ${horaSP(iso)}`;
  if (dia === ontem) return `Ontem às ${horaSP(iso)}`;
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${horaSP(iso)}`;
}
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ACOES = ["ver", "criar", "editar", "aprovar"] as const;

function resumo(acoes: Set<string>) {
  if (!acoes.size) return "";
  if (ACOES.every((a) => acoes.has(a))) return "Total";
  if (acoes.has("editar")) return "Ver e editar";
  if (acoes.has("criar")) return "Ver e lançar";
  return "Ver";
}

export default async function Acessos() {
  const sessao = await exigir("configuracoes");
  const supabase = await supabaseServidor();
  const desde = new Date(Date.now() - 13 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [{ data: pessoas }, { data: perfis }, { data: modulos }, { data: permissoes }, { data: acessos }] = await Promise.all([
    supabase.from("pessoas").select("id, nome, email, perfil_id, acesso_ativo, usuario_id, ultimo_acesso").is("arquivado_em", null).or("usuario_id.not.is.null,email.not.is.null").order("acesso_ativo").order("nome"),
    supabase.from("perfis").select("id, nome, descricao").order("nome"),
    supabase.from("modulos").select("id, nome").order("ordem"),
    supabase.from("perfil_permissoes").select("perfil_id, modulo_id, acao"),
    supabase.from("acessos_dia").select("dia, primeiro, ultimo, vezes, pessoas(nome)").gte("dia", desde).order("dia", { ascending: false }).order("primeiro"),
  ]);
  const porDia = new Map<string, AcessoDia[]>();
  for (const a of (acessos ?? []) as unknown as AcessoDia[]) porDia.set(a.dia, [...(porDia.get(a.dia) ?? []), a]);
  const lista = (pessoas ?? []) as Pessoa[];
  const podeEditar = sessao.pode("configuracoes", "editar");
  const acoesDe = (perfil: string, modulo: string) => new Set((permissoes ?? []).filter((p) => p.perfil_id === perfil && p.modulo_id === modulo).map((p) => p.acao as string));

  return (
    <>
      <Cabecalho titulo="Acessos" descricao="Quem entra no sistema e o que cada perfil pode fazer. Logins novos chegam bloqueados até a liberação aqui." />
      <div className="grade-lateral">
        <section className="painel">
          <div className="painel-topo"><div><h2>Pessoas com login</h2></div></div>
          <div className="tabela-rolagem">
            <table className="tabela cartoes-sempre">
              <thead><tr><th>Pessoa</th><th>Situação</th><th>Último acesso</th><th>Perfil e acesso</th></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.nome}</strong><div className="mini">{p.email}</div></td>
                    <td>
                      {!p.usuario_id ? <span className="etiqueta neutra">Ainda não criou o login</span>
                        : p.acesso_ativo ? <span className="etiqueta ok">Liberado</span>
                        : <span className="etiqueta alerta">Aguardando liberação</span>}
                    </td>
                    <td className={p.ultimo_acesso && Date.now() - new Date(p.ultimo_acesso).getTime() < 15 * 60e3 ? "acesso-agora" : "acesso-quando"}>{p.usuario_id ? quando(p.ultimo_acesso) : "—"}</td>
                    <td>
                      {podeEditar ? (
                        <FormAcao acao={salvarAcesso}>
                          <input type="hidden" name="id" value={p.id} />
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <select name="perfil_id" className="entrada" defaultValue={p.perfil_id ?? ""} aria-label={`Perfil de ${p.nome}`} style={{ width: 170, minHeight: 36 }}>
                              <option value="">Sem perfil</option>
                              {(perfis ?? []).map((pf) => <option key={pf.id} value={pf.id}>{pf.nome}</option>)}
                            </select>
                            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}>
                              <input type="checkbox" name="acesso_ativo" defaultChecked={p.acesso_ativo} />Liberado
                            </label>
                            <BotaoEnviar className="botao secundario pequeno">Salvar</BotaoEnviar>
                          </div>
                        </FormAcao>
                      ) : (perfis ?? []).find((pf) => pf.id === p.perfil_id)?.nome ?? "Sem perfil"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {podeEditar && (
          <section className="painel">
            <div className="painel-topo"><div><h2>Cadastrar acesso</h2><p>A pessoa cria o login com este e-mail e já entra com o perfil definido.</p></div></div>
            <div className="painel-corpo">
              <FormAcao acao={preCadastrarAcesso} className="campos" limparAoSalvar>
                <div className="campo"><label htmlFor="nome">Nome</label><input id="nome" name="nome" required /></div>
                <div className="campo"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required /></div>
                <div className="campo">
                  <label htmlFor="perfil_id">Perfil</label>
                  <select id="perfil_id" name="perfil_id" required defaultValue="">
                    <option value="" disabled>Escolha</option>
                    {(perfis ?? []).map((pf) => <option key={pf.id} value={pf.id}>{pf.nome}</option>)}
                  </select>
                </div>
                <BotaoEnviar>Cadastrar acesso</BotaoEnviar>
              </FormAcao>
            </div>
          </section>
        )}
      </div>

      {podeEditar && (
        <section className="painel" style={{ marginTop: 20 }}>
          <div className="painel-topo"><div><h2>Quem usou o sistema</h2><p>Últimos 14 dias · primeiro e último horário em que cada pessoa mexeu no sistema</p></div></div>
          {porDia.size ? (
            <div className="acessos-dias">
              {[...porDia].map(([dia, lista]) => {
                const [a, m, d] = dia.split("-").map(Number);
                return (
                  <div key={dia} className="acessos-dia">
                    <h3>{SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, {String(d).padStart(2, "0")}/{String(m).padStart(2, "0")}</h3>
                    <ul>
                      {lista.map((x, i) => (
                        <li key={i}>
                          <span className="avatar-mini">{(x.pessoas?.nome ?? "?").charAt(0).toUpperCase()}</span>
                          <b>{x.pessoas?.nome ?? "—"}</b>
                          <span>{horaSP(x.primeiro)}{x.ultimo !== x.primeiro && horaSP(x.ultimo) !== horaSP(x.primeiro) ? ` até ${horaSP(x.ultimo)}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : <p className="sinal-vazio">A partir de agora, cada vez que alguém usar o sistema aparece aqui.</p>}
        </section>
      )}

      <section className="painel" style={{ marginTop: 20 }}>
        <div className="painel-topo"><div><h2>O que cada perfil pode fazer</h2><p>As permissões são checadas no banco de dados, em toda leitura e gravação.</p></div></div>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Perfil</th>{(modulos ?? []).map((m) => <th key={m.id}>{m.nome}</th>)}</tr></thead>
            <tbody>
              {(perfis ?? []).map((pf) => (
                <tr key={pf.id}>
                  <td><strong>{pf.nome}</strong><div className="mini">{pf.descricao}</div></td>
                  {(modulos ?? []).map((m) => {
                    const texto = resumo(acoesDe(pf.id, m.id));
                    return <td key={m.id} className="mini">{texto ? <span className={`etiqueta ${texto === "Total" ? "ok" : "neutra"}`}>{texto}</span> : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
