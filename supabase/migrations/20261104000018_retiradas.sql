-- =====================================================================
-- Retiradas de peças pela equipe: peças com desconto, abatimentos (prêmios),
-- parcelas que vencem no dia 7 e, na folha, a escolha de descontar ou não.
-- Só a administração (Pessoas → aprovar) vê e mexe.
-- =====================================================================

alter table public.folha_regras add column retirada_desconto numeric(5,4) not null default 0.30
  check (retirada_desconto between 0 and 1);

create table public.retiradas (
  id              bigserial primary key,
  pessoa_id       uuid not null references public.pessoas(id) on delete cascade,
  data            date not null,
  abatimentos     jsonb not null default '[]' check (jsonb_typeof(abatimentos) = 'array'),  -- [{descricao, valor}]
  desconto_extra  numeric(5,4) not null default 0 check (desconto_extra between 0 and 1),     -- ex.: 50% por meta batida
  total_combinado numeric(12,2) check (total_combinado is null or total_combinado >= 0),      -- quando o acordo foi outro
  observacao      text check (length(observacao) <= 1000),
  criado_em       timestamptz not null default now()
);
create index retiradas_pessoa on public.retiradas (pessoa_id, data);

create table public.retirada_itens (
  id           bigserial primary key,
  retirada_id  bigint not null references public.retiradas(id) on delete cascade,
  descricao    text not null check (length(trim(descricao)) between 1 and 200),
  preco        numeric(12,2) not null check (preco >= 0),        -- preço de venda
  desconto     numeric(5,4) check (desconto is null or desconto between 0 and 1),  -- null = preço de custo
  liquido      numeric(12,2) not null check (liquido >= 0)
);
create index retirada_itens_retirada on public.retirada_itens (retirada_id);

create table public.retirada_parcelas (
  id           bigserial primary key,
  retirada_id  bigint not null references public.retiradas(id) on delete cascade,
  numero       int not null check (numero >= 1),
  de           int not null check (de >= numero),
  vencimento   date not null,
  valor        numeric(12,2) not null check (valor >= 0),
  situacao     text not null default 'aberta' check (situacao in ('aberta', 'paga', 'perdoada')),
  folha_mes    date,             -- folha em que foi descontada
  observacao   text,
  unique (retirada_id, numero)
);
create index retirada_parcelas_venc on public.retirada_parcelas (vencimento, situacao);

-- Lançamento da folha que veio de uma parcela de retirada.
alter table public.folha_itens add column parcela_id bigint unique references public.retirada_parcelas(id) on delete set null;

-- Tirar o lançamento da folha devolve a parcela para "aberta".
create or replace function public.reabrir_parcela_da_folha()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.parcela_id is not null then
    update public.retirada_parcelas set situacao = 'aberta', folha_mes = null
     where id = old.parcela_id and folha_mes = old.mes;
  end if;
  return old;
end $$;
create trigger folha_itens_reabre_parcela after delete on public.folha_itens
  for each row execute function public.reabrir_parcela_da_folha();

/*
 * Registra a retirada inteira de uma vez: peças, abatimentos e parcelas.
 * p = {pessoa_id, data, abatimentos:[{descricao,valor}], desconto_extra, total_combinado,
 *      observacao, parcelas, primeiro_vencimento, itens:[{descricao, preco, desconto|null, liquido}]}
 */
create or replace function public.registrar_retirada(p jsonb)
returns bigint language plpgsql set search_path = public as $$
declare
  rid bigint;
  soma numeric := 0;
  abat numeric := 0;
  total numeric;
  n int := greatest(coalesce((p ->> 'parcelas')::int, 0), 0);
  venc date := (p ->> 'primeiro_vencimento')::date;
  parcela numeric;
  i int;
begin
  if jsonb_array_length(coalesce(p -> 'itens', '[]')) = 0 then raise exception 'Inclua pelo menos uma peça.'; end if;
  insert into public.retiradas (pessoa_id, data, abatimentos, desconto_extra, total_combinado, observacao)
  values ((p ->> 'pessoa_id')::uuid, (p ->> 'data')::date, coalesce(p -> 'abatimentos', '[]'),
          coalesce((p ->> 'desconto_extra')::numeric, 0), (p ->> 'total_combinado')::numeric, nullif(trim(p ->> 'observacao'), ''))
  returning id into rid;

  insert into public.retirada_itens (retirada_id, descricao, preco, desconto, liquido)
  select rid, trim(e ->> 'descricao'), (e ->> 'preco')::numeric, (e ->> 'desconto')::numeric, (e ->> 'liquido')::numeric
  from jsonb_array_elements(p -> 'itens') e;

  select coalesce(sum(liquido), 0) into soma from public.retirada_itens where retirada_id = rid;
  select coalesce(sum((e ->> 'valor')::numeric), 0) into abat from jsonb_array_elements(coalesce(p -> 'abatimentos', '[]')) e;
  total := coalesce((p ->> 'total_combinado')::numeric,
                    round(greatest(soma - abat, 0) * (1 - coalesce((p ->> 'desconto_extra')::numeric, 0)), 2));

  if n > 0 then
    if venc is null then raise exception 'Informe o vencimento da primeira parcela.'; end if;
    parcela := floor(total / n * 100) / 100;
    for i in 1..n loop
      insert into public.retirada_parcelas (retirada_id, numero, de, vencimento, valor)
      values (rid, i, n, (venc + make_interval(months => i - 1))::date,
              case when i = n then total - parcela * (n - 1) else parcela end);
    end loop;
  end if;
  return rid;
end $$;

/* Na folha do mês: desconta a parcela (cria o lançamento) ou desfaz. */
create or replace function public.descontar_parcela(p_parcela bigint, p_mes date, p_parte text)
returns void language plpgsql set search_path = public as $$
declare
  pa public.retirada_parcelas;
  r public.retiradas;
begin
  select * into pa from public.retirada_parcelas where id = p_parcela for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if pa.situacao <> 'aberta' then raise exception 'Essa parcela não está em aberto.'; end if;
  select * into r from public.retiradas where id = pa.retirada_id;
  insert into public.folha_itens (mes, pessoa_id, parte, tipo, descricao, valor, parcela_id)
  values (p_mes, r.pessoa_id, p_parte, 'retirada',
          format('Retirada de %s · parcela %s/%s', to_char(r.data, 'DD/MM'), pa.numero, pa.de), -pa.valor, pa.id);
  update public.retirada_parcelas set situacao = 'paga', folha_mes = p_mes where id = pa.id;
end $$;

alter table public.retiradas enable row level security;
alter table public.retirada_itens enable row level security;
alter table public.retirada_parcelas enable row level security;
do $$
declare t text;
begin
  foreach t in array array['retiradas', 'retirada_itens', 'retirada_parcelas'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy admin on public.%I for all to authenticated
                    using (public.tem_permissao('pessoas', 'aprovar')) with check (public.tem_permissao('pessoas', 'aprovar'))$p$, t);
  end loop;
end $$;
grant usage on sequence public.retiradas_id_seq, public.retirada_itens_id_seq, public.retirada_parcelas_id_seq to authenticated;
revoke all on function public.registrar_retirada(jsonb), public.descontar_parcela(bigint, date, text), public.reabrir_parcela_da_folha() from public, anon;
grant execute on function public.registrar_retirada(jsonb), public.descontar_parcela(bigint, date, text) to authenticated;

create trigger retiradas_auditoria after insert or update or delete on public.retiradas
  for each row execute function public.registrar_auditoria();
create trigger retirada_parcelas_auditoria after insert or update or delete on public.retirada_parcelas
  for each row execute function public.registrar_auditoria();
