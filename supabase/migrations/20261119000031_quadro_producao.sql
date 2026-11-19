-- Quadro de produção (substitui o Trello "Produção CORETO"): colunas e cartões de ordem de produção (OP).
create table public.producao_colunas (
  id text primary key,
  nome text not null,
  ordem int not null,
  cor text,
  final boolean not null default false
);
insert into public.producao_colunas (id, nome, ordem, cor, final) values
  ('corte', 'Corte', 1, '#0ea5a4', false),
  ('costura', 'Costura', 2, '#2563eb', false),
  ('lavanderia', 'Lavanderia', 3, '#7c3aed', false),
  ('acabamento', 'Acabamento externo', 4, '#db2777', false),
  ('qualidade', 'Controle de qualidade', 5, '#d97706', false),
  ('consertos', 'Consertos', 6, '#dc2626', false),
  ('estoque', 'Entrada de estoque', 7, '#16a34a', true);

create table public.producao_ops (
  id uuid primary key default gen_random_uuid(),
  numero int,
  titulo text not null,
  tecido text,
  produto_id uuid references public.produtos(id) on delete set null,
  parceiro_id uuid references public.parceiros(id) on delete set null,
  quantidade int,
  prazo date,
  etiqueta text,
  observacao text,
  coluna_id text not null references public.producao_colunas(id),
  ordem double precision not null default 0,
  movido_em timestamptz not null default now(),
  criado_por uuid default public.pessoa_atual_id(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz
);
create index on public.producao_ops (coluna_id, ordem) where arquivado_em is null;

create table public.producao_historico (
  id bigint generated always as identity primary key,
  op_id uuid not null references public.producao_ops(id) on delete cascade,
  de text, para text,
  por uuid default public.pessoa_atual_id(),
  em timestamptz not null default now()
);

alter table public.producao_colunas enable row level security;
alter table public.producao_ops enable row level security;
alter table public.producao_historico enable row level security;
create policy ver on public.producao_colunas for select to authenticated using (public.tem_permissao('producao', 'ver'));
create policy ver on public.producao_ops for select to authenticated using (public.tem_permissao('producao', 'ver'));
create policy criar on public.producao_ops for insert to authenticated with check (public.tem_permissao('producao', 'criar'));
create policy editar on public.producao_ops for update to authenticated using (public.tem_permissao('producao', 'editar')) with check (public.tem_permissao('producao', 'editar'));
create policy apagar on public.producao_ops for delete to authenticated using (public.tem_permissao('producao', 'aprovar'));
create policy ver on public.producao_historico for select to authenticated using (public.tem_permissao('producao', 'ver'));
create policy criar on public.producao_historico for insert to authenticated with check (public.tem_permissao('producao', 'editar') or public.tem_permissao('producao', 'criar'));

-- Mover cartão: muda coluna e posição e registra no histórico.
create or replace function public.mover_op(p_op uuid, p_coluna text, p_ordem double precision)
returns void language plpgsql set search_path = public as $$
declare atual text;
begin
  if not public.tem_permissao('producao', 'editar') then raise exception 'Seu perfil não pode mover cartões.'; end if;
  select coluna_id into atual from public.producao_ops where id = p_op;
  if atual is null then raise exception 'Cartão não encontrado.'; end if;
  update public.producao_ops set coluna_id = p_coluna, ordem = p_ordem, atualizado_em = now(),
    movido_em = case when atual <> p_coluna then now() else movido_em end
   where id = p_op;
  if atual <> p_coluna then insert into public.producao_historico (op_id, de, para) values (p_op, atual, p_coluna); end if;
end $$;
revoke all on function public.mover_op(uuid, text, double precision) from public, anon;
grant execute on function public.mover_op(uuid, text, double precision) to authenticated;

alter table public.producao_ops add column faccao text;
