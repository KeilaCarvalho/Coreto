"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";
import { ETAPAS } from "@/lib/clientes";
import type { EstadoAcao } from "@/components/form-acao";

const uuid = /^[0-9a-f-]{36}$/i;
const texto = (dados: FormData, campo: string) => String(dados.get(campo) ?? "").trim();
const ouNulo = (v: string) => v || null;
const data = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function mensagemBanco(mensagem: string) {
  if (mensagem.includes("row-level security")) return "Seu perfil não pode fazer essa operação.";
  if (mensagem.includes("clientes_codigo_externo_key")) return "Já existe uma cliente com esse código.";
  return mensagem;
}

function atualizar(id?: string) {
  revalidatePath("/comercial/clientes");
  if (id) revalidatePath(`/comercial/clientes/${id}`);
}

function lerCliente(dados: FormData) {
  return {
    nome: texto(dados, "nome"),
    telefone: ouNulo(texto(dados, "telefone")),
    telefone_2: ouNulo(texto(dados, "telefone_2")),
    email: ouNulo(texto(dados, "email").toLowerCase()),
    cpf: ouNulo(texto(dados, "cpf")),
    nascimento: data(texto(dados, "nascimento")),
    cidade: ouNulo(texto(dados, "cidade")),
    uf: ouNulo(texto(dados, "uf").toUpperCase().slice(0, 2)),
    codigo_externo: ouNulo(texto(dados, "codigo_externo")),
    observacao: ouNulo(texto(dados, "observacao")),
  };
}

export async function criarCliente(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const cliente = lerCliente(dados);
  if (cliente.nome.length < 2) return { erro: "Informe o nome da cliente." };
  if (!cliente.telefone && !cliente.email) return { erro: "Informe pelo menos um telefone ou e-mail para o contato." };
  const vendedora = texto(dados, "vendedora_id");
  const supabase = await supabaseServidor();
  const { data: criada, error } = await supabase.from("clientes")
    .insert({ ...cliente, vendedora_id: uuid.test(vendedora) ? vendedora : null }).select("id").single();
  if (error) return { erro: mensagemBanco(error.message) };
  atualizar();
  redirect(`/comercial/clientes/${criada.id}`);
}

export async function editarCliente(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = texto(dados, "id");
  const cliente = lerCliente(dados);
  if (cliente.nome.length < 2) return { erro: "Informe o nome da cliente." };
  const mudancas: Record<string, unknown> = { ...cliente };
  if (dados.has("vendedora_id")) {
    const v = texto(dados, "vendedora_id");
    mudancas.vendedora_id = uuid.test(v) ? v : null;
  }
  const supabase = await supabaseServidor();
  const { data: linhas, error } = await supabase.from("clientes").update(mudancas).eq("id", id).select("id");
  if (error) return { erro: mensagemBanco(error.message) };
  if (!linhas?.length) return { erro: "Seu perfil não pode editar esta cliente." };
  atualizar(id);
  return { ok: "Dados da cliente salvos." };
}

const Contato = z.object({
  cliente_id: z.string().regex(uuid),
  etapa: z.enum(ETAPAS.map((e) => e.valor) as [string, ...string[]]),
  nota: z.string().trim().min(2, "Escreva o que aconteceu no contato."),
  contatado_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do contato."),
  proximo_contato: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function registrarContato(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const lido = Contato.safeParse({
    cliente_id: texto(dados, "cliente_id"), etapa: texto(dados, "etapa"), nota: texto(dados, "nota"),
    contatado_em: texto(dados, "contatado_em"), proximo_contato: data(texto(dados, "proximo_contato")),
  });
  if (!lido.success) return { erro: lido.error.issues[0].message };
  if (lido.data.proximo_contato && lido.data.proximo_contato < lido.data.contatado_em) return { erro: "O próximo contato precisa ser depois do contato de hoje." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("cliente_contatos").insert(lido.data);
  if (error) return { erro: mensagemBanco(error.message) };
  atualizar(lido.data.cliente_id);
  return { ok: lido.data.proximo_contato ? "Contato registrado. O lembrete de retorno ficou marcado." : "Contato registrado." };
}

const TIPOS = ["primeira_compra", "aniversariantes", "vendas_vendedora", "carteira"] as const;

export async function importarClientes(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const tipo = texto(dados, "tipo");
  if (!(TIPOS as readonly string[]).includes(tipo)) return { erro: "Tipo de relatório inválido." };
  let linhas: unknown;
  try { linhas = JSON.parse(String(dados.get("linhas") ?? "[]")); } catch { return { erro: "Não consegui ler as linhas do relatório." }; }
  if (!Array.isArray(linhas) || !linhas.length) return { erro: "O relatório não tem linhas para importar." };
  if (linhas.length > 20000) return { erro: "Arquivo grande demais: divida em partes de até 20 mil linhas." };
  const supabase = await supabaseServidor();
  const { data: resultado, error } = await supabase.rpc("importar_clientes", {
    p_tipo: tipo, p_linhas: linhas, p_arquivo: texto(dados, "arquivo"), p_mes: texto(dados, "mes") || null,
  });
  if (error) return { erro: mensagemBanco(error.message) };
  const r = resultado as { importados: number; ignorados: number };
  atualizar();
  revalidatePath("/comercial/relatorios");
  return { ok: `${r.importados} ${r.importados === 1 ? "linha importada" : "linhas importadas"}${r.ignorados ? `, ${r.ignorados} ignoradas (sem nome, código ou data)` : ""}.` };
}

export async function desfazerImportacao(dados: FormData) {
  const id = texto(dados, "id");
  if (!uuid.test(id)) return;
  const supabase = await supabaseServidor();
  await supabase.rpc("desfazer_importacao_clientes", { p_id: id });
  atualizar();
  revalidatePath("/comercial/relatorios");
}

export async function salvarNomeVendas(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const id = texto(dados, "id");
  const nome = texto(dados, "nome_vendas") || null;
  const supabase = await supabaseServidor();
  const { data: linhas, error } = await supabase.from("pessoas").update({ nome_vendas: nome }).eq("id", id).select("id");
  if (error) return { erro: error.message.includes("pessoas_nome_vendas_unico") ? "Outra pessoa já usa esse nome nos relatórios." : mensagemBanco(error.message) };
  if (!linhas?.length) return { erro: "Seu perfil não pode alterar a equipe." };
  revalidatePath("/pessoas/equipe");
  atualizar();
  return { ok: nome ? `Carteira ligada a “${nome}”.` : "Nome nos relatórios removido." };
}

const TIPOS_VENDAS = ["evolucao", "comissao", "curva_abc", "vendas_dia"];

/** Importa qualquer relatório lido: os de clientes vão para a carteira; os de vendas, para a tela de Vendas. */
export async function importarRelatorio(estado: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const tipo = texto(dados, "tipo");
  if ((TIPOS as readonly string[]).includes(tipo)) return importarClientes(estado, dados);
  if (!TIPOS_VENDAS.includes(tipo)) return { erro: "Tipo de relatório inválido." };
  let linhas: unknown;
  try { linhas = JSON.parse(String(dados.get("linhas") ?? "[]")); } catch { return { erro: "Não consegui ler as linhas do relatório." }; }
  if (!Array.isArray(linhas) || !linhas.length) return { erro: "O relatório não tem linhas para importar." };
  const supabase = await supabaseServidor();
  const { data: n, error } = await supabase.rpc("importar_vendas", {
    p_tipo: tipo, p_mes: texto(dados, "mes") || null, p_linhas: linhas, p_arquivo: texto(dados, "arquivo"),
  });
  if (error) return { erro: mensagemBanco(error.message) };
  revalidatePath("/comercial/vendas");
  revalidatePath("/comercial/relatorios");
  return { ok: `${n} ${n === 1 ? "linha importada" : "linhas importadas"}. Se já tinha esse mês, os dados foram substituídos.` };
}

const tituloNome = (nome: string) => nome.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, e, l) => e + l.toUpperCase()).replace(/\s(De|Da|Do|Dos|Das|E)\s/g, (m) => m.toLowerCase());

/** Liga um nome que aparece nos relatórios a uma pessoa da equipe (ou cria a vendedora). As clientes desse nome passam para a carteira dela. */
export async function ligarVendedoraDoRelatorio(_: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const nomeRelatorio = texto(dados, "nome_relatorio");
  const escolha = texto(dados, "pessoa");
  if (!nomeRelatorio) return { erro: "Nome do relatório faltando." };
  if (!escolha) return { erro: `Escolha quem é “${nomeRelatorio}”.` };
  const supabase = await supabaseServidor();
  let id = escolha;
  if (escolha === "nova") {
    const { data: criada, error } = await supabase.from("pessoas").insert({ nome: tituloNome(nomeRelatorio), e_vendedora: true, e_funcionaria: !/shop|site|online|loja/i.test(nomeRelatorio) }).select("id").single();
    if (error) return { erro: mensagemBanco(error.message) };
    id = criada.id as string;
  } else if (!uuid.test(escolha)) return { erro: "Escolha inválida." };
  const { data: linhas, error } = await supabase.from("pessoas").update({ nome_vendas: nomeRelatorio, e_vendedora: true }).eq("id", id).select("id, nome");
  if (error) return { erro: error.message.includes("pessoas_nome_vendas_unico") ? "Outra pessoa já usa esse nome nos relatórios." : mensagemBanco(error.message) };
  if (!linhas?.length) return { erro: "Seu perfil não pode alterar a equipe." };
  revalidatePath("/pessoas/equipe");
  revalidatePath("/comercial/relatorios");
  atualizar();
  return { ok: `“${nomeRelatorio}” ligada a ${linhas[0].nome}. As clientes dela já estão na carteira.` };
}
