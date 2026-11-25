create or replace function public.carimbar_fluxo() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  -- O robô do HeraDash (sem pessoa) não apaga quem lançou o dia.
  if not public.e_processo_interno() then
    new.atualizado_por := coalesce(public.pessoa_atual_id(), case when tg_op = 'UPDATE' then old.atualizado_por end);
  end if;
  return new;
end $$;
