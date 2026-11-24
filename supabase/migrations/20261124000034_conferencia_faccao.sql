-- Integração Produção → Chegada da facção: ficha de corte na OP, "pronta p/ entregar", conferência e pendências.
alter table public.producao_ops
  add column if not exists data_corte date,
  add column if not exists cortador text,
  add column if not exists composicao text,
  add column if not exists matriz text,
  add column if not exists tamanhos text[] not null default array['PP','P','M','G'],
  add column if not exists grade jsonb not null default '[]'::jsonb,      -- cortado: [{cor, q:{PP:8,...}}]
  add column if not exists entrega jsonb,                                 -- o que a Leide disse que está pronto
  add column if not exists pronta_em timestamptz,
  add column if not exists conferida_em timestamptz,
  add column if not exists recebimento_id uuid references public.recebimentos(id) on delete set null;

create table if not exists public.producao_pendencias (
  id uuid primary key default gen_random_uuid(),
  op_id uuid references public.producao_ops(id) on delete set null,
  recebimento_id uuid references public.recebimentos(id) on delete set null,
  produto_id uuid references public.produtos(id) on delete set null,
  variante_id uuid references public.variantes(id) on delete set null,
  modelo text not null,
  cor text not null,
  tamanho text not null,
  quantidade int not null check (quantidade > 0),
  criado_em timestamptz not null default now(),
  criado_por uuid default public.pessoa_atual_id(),
  resolvido_em timestamptz,
  resolucao text check (resolucao in ('chegou', 'cancelada')),
  resolvido_por uuid
);
create index if not exists producao_pendencias_abertas on public.producao_pendencias (criado_em) where resolvido_em is null;
alter table public.producao_pendencias enable row level security;
create policy ver on public.producao_pendencias for select to authenticated using (public.tem_permissao('producao', 'ver') or public.tem_permissao('faccao', 'ver'));
create policy criar on public.producao_pendencias for insert to authenticated with check (public.tem_permissao('faccao', 'criar'));
create policy editar on public.producao_pendencias for update to authenticated using (public.tem_permissao('faccao', 'editar')) with check (public.tem_permissao('faccao', 'editar'));

-- Quem confere a facção precisa ler e atualizar a OP que puxou.
create policy ver_faccao on public.producao_ops for select to authenticated using (public.tem_permissao('faccao', 'ver'));
create policy conferir_faccao on public.producao_ops for update to authenticated using (public.tem_permissao('faccao', 'criar')) with check (public.tem_permissao('faccao', 'criar'));
create policy ver_faccao on public.producao_colunas for select to authenticated using (public.tem_permissao('faccao', 'ver'));
create policy criar_faccao on public.producao_historico for insert to authenticated with check (public.tem_permissao('faccao', 'criar'));

-- Conferir a chegada de uma OP: registra a chegada, guarda o que faltou e manda a OP para "Entrada de estoque".
create or replace function public.conferir_op(p_op uuid, p_produto uuid, p_data date, p_observacao text, p_itens jsonb, p_faltas jsonb, p_segurar boolean)
returns uuid language plpgsql set search_path = public as $$
declare
  op public.producao_ops;
  parceiro uuid;
  rec uuid;
  falta jsonb;
  texto text := '';
  modelo text;
begin
  if not public.tem_permissao('faccao', 'criar') then raise exception 'Seu perfil não pode conferir a chegada da facção.'; end if;
  select * into op from public.producao_ops where id = p_op for update;
  if not found then raise exception 'OP não encontrada.'; end if;
  if op.conferida_em is not null then raise exception 'Esta OP já foi conferida.'; end if;
  select nome into modelo from public.produtos where id = p_produto;
  if modelo is null then raise exception 'Escolha o modelo do catálogo.'; end if;

  if nullif(trim(op.faccao), '') is not null then
    select id into parceiro from public.parceiros where tipo = 'faccao' and lower(nome) = lower(trim(op.faccao)) and arquivado_em is null limit 1;
    if parceiro is null then
      insert into public.parceiros (tipo, nome) values ('faccao', trim(op.faccao)) returning id into parceiro;
    end if;
  end if;

  rec := public.registrar_recebimento(null, p_produto, parceiro, p_data,
    concat_ws(' · ', case when op.numero is not null then 'OP ' || op.numero end, nullif(trim(p_observacao), '')), p_itens);

  for falta in select * from jsonb_array_elements(coalesce(p_faltas, '[]'::jsonb)) loop
    continue when coalesce((falta ->> 'quantidade')::int, 0) <= 0;
    insert into public.producao_pendencias (op_id, recebimento_id, produto_id, variante_id, modelo, cor, tamanho, quantidade)
    values (p_op, rec, p_produto, nullif(falta ->> 'variante_id', '')::uuid, modelo, falta ->> 'cor', falta ->> 'tamanho', (falta ->> 'quantidade')::int);
    texto := texto || case when texto = '' then '' else ', ' end || (falta ->> 'quantidade') || ' ' || (falta ->> 'cor') || ' ' || (falta ->> 'tamanho');
  end loop;

  if texto <> '' then
    update public.recebimentos set pendente = coalesce(p_segurar, false), pendencia = 'Faltou da OP: ' || texto where id = rec;
  end if;

  update public.producao_ops set conferida_em = now(), recebimento_id = rec, produto_id = p_produto,
    coluna_id = 'estoque', movido_em = now(), atualizado_em = now() where id = p_op;
  if op.coluna_id <> 'estoque' then insert into public.producao_historico (op_id, de, para) values (p_op, op.coluna_id, 'estoque'); end if;
  return rec;
end $$;
revoke all on function public.conferir_op(uuid, uuid, date, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.conferir_op(uuid, uuid, date, text, jsonb, jsonb, boolean) to authenticated;

-- Dar baixa numa pendência: chegou (parte ou tudo) ou não vem mais.
create or replace function public.resolver_pendencia(p_id uuid, p_chegou int, p_cancelar boolean)
returns void language plpgsql set search_path = public as $$
declare
  p public.producao_pendencias;
begin
  if not public.tem_permissao('faccao', 'editar') then raise exception 'Seu perfil não pode dar baixa em pendências.'; end if;
  select * into p from public.producao_pendencias where id = p_id for update;
  if not found or p.resolvido_em is not null then raise exception 'Pendência não encontrada ou já resolvida.'; end if;
  if coalesce(p_cancelar, false) then
    update public.producao_pendencias set resolvido_em = now(), resolucao = 'cancelada', resolvido_por = public.pessoa_atual_id() where id = p_id;
  else
    if coalesce(p_chegou, 0) <= 0 then raise exception 'Informe quantas peças chegaram.'; end if;
    if p_chegou > p.quantidade then raise exception 'Chegaram mais peças do que estavam faltando.'; end if;
    if p.variante_id is null or p.recebimento_id is null then raise exception 'Esta pendência não tem a cor/tamanho do catálogo. Registre a chegada pela tela normal.'; end if;
    perform public.registrar_recebimento(p.recebimento_id, null, null, public.hoje_sp(), null,
      jsonb_build_array(jsonb_build_object('variante_id', p.variante_id, 'quantidade', p_chegou)));
    if p_chegou = p.quantidade then
      update public.producao_pendencias set resolvido_em = now(), resolucao = 'chegou', resolvido_por = public.pessoa_atual_id() where id = p_id;
    else
      update public.producao_pendencias set quantidade = quantidade - p_chegou where id = p_id;
    end if;
  end if;
  if p.recebimento_id is not null and not exists (select 1 from public.producao_pendencias where recebimento_id = p.recebimento_id and resolvido_em is null) then
    update public.recebimentos set pendente = false, pendencia = null where id = p.recebimento_id and pendencia like 'Faltou da OP:%';
  end if;
end $$;
revoke all on function public.resolver_pendencia(uuid, int, boolean) from public, anon;
grant execute on function public.resolver_pendencia(uuid, int, boolean) to authenticated;
