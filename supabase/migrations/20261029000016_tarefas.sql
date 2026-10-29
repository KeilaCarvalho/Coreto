-- =====================================================================
-- Minhas tarefas: lista pessoal de cada login (Kanban, Hoje, Lista).
-- Cada pessoa só vê e mexe nas próprias tarefas.
-- Rotinas (tarefas que se repetem): ao marcar como feita, o dia fica
-- registrado em tarefa_feitas e a tarefa pula para a próxima data.
-- =====================================================================

create table public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  dono           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo         text not null check (length(trim(titulo)) between 1 and 200),
  area           text not null default 'geral'
                 check (area in ('financeiro', 'producao', 'loja', 'sistema', 'pessoal', 'geral')),
  prioridade     text not null default 'normal' check (prioridade in ('alta', 'normal', 'baixa')),
  status         text not null default 'a_fazer'
                 check (status in ('ideia', 'a_fazer', 'fazendo', 'esperando', 'feito')),
  data           date,
  -- null = uma vez só · dias_uteis · diaria · semanal:0..6 (0 = domingo) · mensal:1..31
  repete         text check (repete is null or repete ~ '^(dias_uteis|diaria|semanal:[0-6]|mensal:([1-9]|[12][0-9]|3[01]))$'),
  checklist      jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array'),  -- [{texto, feito}]
  notas          text check (length(notas) <= 4000),
  atalho         text check (atalho is null or atalho ~ '^/[a-z0-9/_-]*$'),
  esperando_quem text check (length(esperando_quem) <= 120),
  ordem          double precision not null default extract(epoch from clock_timestamp()),
  feita_em       timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (repete is null or data is not null)
);
create index tarefas_dono on public.tarefas (dono, status, data);

create table public.tarefa_feitas (
  id         bigserial primary key,
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  dono       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dia        date not null,
  feita_em   timestamptz not null default now()
);
create index tarefa_feitas_dono on public.tarefa_feitas (dono, feita_em);
create index tarefa_feitas_tarefa on public.tarefa_feitas (tarefa_id);

create or replace function public.carimbar_tarefa()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  new.feita_em := case when new.status = 'feito' then coalesce(new.feita_em, now()) else null end;
  return new;
end $$;
create trigger tarefas_carimbo before insert or update on public.tarefas
  for each row execute function public.carimbar_tarefa();

-- Próxima data de uma rotina, estritamente depois de p_depois.
create or replace function public.proxima_data_rotina(p_repete text, p_depois date)
returns date language plpgsql immutable set search_path = public as $$
declare
  d date := p_depois + 1;
  alvo int;
  ultimo int;
begin
  if p_repete = 'diaria' then return d; end if;
  if p_repete = 'dias_uteis' then
    while extract(isodow from d) > 5 loop d := d + 1; end loop;
    return d;
  end if;
  if p_repete like 'semanal:%' then
    alvo := split_part(p_repete, ':', 2)::int;
    while extract(dow from d)::int <> alvo loop d := d + 1; end loop;
    return d;
  end if;
  if p_repete like 'mensal:%' then
    alvo := split_part(p_repete, ':', 2)::int;
    -- mês de p_depois; se o dia já passou, o mês seguinte (dia 31 vira o último dia do mês)
    for i in 0..2 loop
      ultimo := extract(day from (date_trunc('month', p_depois) + make_interval(months => i + 1) - interval '1 day'))::int;
      d := (date_trunc('month', p_depois) + make_interval(months => i))::date + (least(alvo, ultimo) - 1);
      if d > p_depois then return d; end if;
    end loop;
  end if;
  return null;
end $$;

-- Marcar como feita. Rotina: registra o dia e pula para a próxima data. Tarefa comum: vai para "Feito".
create or replace function public.concluir_tarefa(p_id uuid)
returns date language plpgsql set search_path = public as $$
declare
  t public.tarefas;
  proxima date;
begin
  select * into t from public.tarefas where id = p_id and dono = auth.uid() for update;
  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if t.repete is null then
    update public.tarefas set status = 'feito' where id = p_id;
    return null;
  end if;
  insert into public.tarefa_feitas (tarefa_id, dono, dia) values (t.id, t.dono, t.data);
  proxima := public.proxima_data_rotina(t.repete, greatest(t.data, public.hoje_sp()));
  update public.tarefas
     set data = proxima, status = 'a_fazer',
         checklist = (select coalesce(jsonb_agg(jsonb_set(c, '{feito}', 'false'::jsonb)), '[]'::jsonb)
                        from jsonb_array_elements(t.checklist) c)
   where id = p_id;
  return proxima;
end $$;

-- Desfazer o "feito" de hoje de uma rotina (marcou sem querer).
create or replace function public.desfazer_rotina(p_id uuid)
returns void language plpgsql set search_path = public as $$
declare
  f public.tarefa_feitas;
begin
  select * into f from public.tarefa_feitas
   where tarefa_id = p_id and dono = auth.uid() order by feita_em desc limit 1;
  if not found then raise exception 'Nada para desfazer.'; end if;
  update public.tarefas set data = f.dia, status = 'a_fazer' where id = p_id and dono = auth.uid();
  delete from public.tarefa_feitas where id = f.id;
end $$;

alter table public.tarefas enable row level security;
alter table public.tarefa_feitas enable row level security;
revoke all on public.tarefas, public.tarefa_feitas from anon, authenticated;
grant select, insert, update, delete on public.tarefas to authenticated;
grant select, insert, delete on public.tarefa_feitas to authenticated;
grant usage on sequence public.tarefa_feitas_id_seq to authenticated;

create policy dono on public.tarefas for all to authenticated
  using (dono = auth.uid()) with check (dono = auth.uid());
create policy dono on public.tarefa_feitas for all to authenticated
  using (dono = auth.uid()) with check (dono = auth.uid());

revoke all on function public.concluir_tarefa(uuid), public.desfazer_rotina(uuid),
  public.proxima_data_rotina(text, date), public.carimbar_tarefa() from public, anon;
grant execute on function public.concluir_tarefa(uuid), public.desfazer_rotina(uuid),
  public.proxima_data_rotina(text, date) to authenticated;
