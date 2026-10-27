-- O link do arquivo no Drive pode apontar para a pasta de ENTRADA (ainda não organizado),
-- então ter link não marca mais "salvo na NF DE ENTRADA" sozinho.
create or replace function public.carimbar_documento_financeiro()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lancado_conta_azul and (tg_op = 'INSERT' or not old.lancado_conta_azul) then new.lancado_em := now(); end if;
  if not new.lancado_conta_azul then new.lancado_em := null; end if;
  if new.anexado_conta_azul and (tg_op = 'INSERT' or not old.anexado_conta_azul) then new.anexado_em := now(); end if;
  if not new.anexado_conta_azul then new.anexado_em := null; end if;
  if new.pago and new.pago_em is null then new.pago_em := public.hoje_sp(); end if;
  if not new.pago then new.pago_em := null; end if;
  return new;
end $$;
revoke execute on function public.carimbar_documento_financeiro() from anon, authenticated, public;
