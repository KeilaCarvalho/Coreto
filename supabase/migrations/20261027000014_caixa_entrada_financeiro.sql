-- =====================================================================
-- Caixa de entrada do financeiro ("segundo cérebro").
-- Tudo que chega (nota fiscal, cupom, boleto, fatura, recibo), por
-- WhatsApp, e-mail ou em papel, é jogado aqui primeiro. Depois cada
-- documento é conferido e acompanhado até o fim:
--   lançado no Conta Azul → anexado no Conta Azul → salvo no Drive → pago.
-- O que ainda não foi lançado ou anexado no Conta Azul vira pendência.
-- Arquivos (foto ou PDF) ficam no bucket privado "documentos".
-- =====================================================================

create table public.documentos_financeiros (
  id                  uuid primary key default gen_random_uuid(),
  arquivo             text,          -- caminho no Storage (bucket "documentos")
  nome_arquivo        text,          -- nome original do arquivo enviado
  tipo                text not null default 'nota_fiscal'
                        check (tipo in ('nota_fiscal', 'cupom', 'boleto', 'fatura', 'recibo', 'outro')),
  origem              text not null default 'whatsapp'
                        check (origem in ('whatsapp', 'email', 'papel', 'outro')),
  situacao            text not null default 'entrada'
                        check (situacao in ('entrada', 'conferido', 'descartado')),
  fornecedor          text,
  numero              text,
  valor               numeric(12,2) check (valor is null or valor >= 0),
  emitido_em          date,
  vence_em            date,
  categoria           text,
  observacao          text,
  -- acompanhamento
  lancado_conta_azul  boolean not null default false,
  lancado_em          timestamptz,
  anexado_conta_azul  boolean not null default false,
  anexado_em          timestamptz,
  salvo_drive         boolean not null default false,
  link_drive          text,
  pago                boolean not null default false,
  pago_em             date,
  -- carimbos
  criado_em           timestamptz not null default now(),
  criado_por          uuid references public.pessoas(id) default public.pessoa_atual_id(),
  atualizado_em       timestamptz not null default now()
);

create index documentos_fin_criado on public.documentos_financeiros (criado_em desc);
create index documentos_fin_vence on public.documentos_financeiros (vence_em) where not pago and situacao <> 'descartado';
create index documentos_fin_pendentes on public.documentos_financeiros (criado_em)
  where situacao <> 'descartado' and (not lancado_conta_azul or not anexado_conta_azul);
create index documentos_fin_criado_por on public.documentos_financeiros (criado_por);

create trigger documentos_financeiros_atualizado before update on public.documentos_financeiros
  for each row execute function public.tocar_atualizado_em();

-- Marca a hora em que cada etapa foi feita (e limpa se for desmarcada).
create or replace function public.carimbar_documento_financeiro()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lancado_conta_azul and (tg_op = 'INSERT' or not old.lancado_conta_azul) then new.lancado_em := now(); end if;
  if not new.lancado_conta_azul then new.lancado_em := null; end if;
  if new.anexado_conta_azul and (tg_op = 'INSERT' or not old.anexado_conta_azul) then new.anexado_em := now(); end if;
  if not new.anexado_conta_azul then new.anexado_em := null; end if;
  if new.pago and new.pago_em is null then new.pago_em := public.hoje_sp(); end if;
  if not new.pago then new.pago_em := null; end if;
  if nullif(trim(coalesce(new.link_drive, '')), '') is not null then new.salvo_drive := true; end if;
  return new;
end $$;
create trigger documentos_financeiros_carimbo before insert or update on public.documentos_financeiros
  for each row execute function public.carimbar_documento_financeiro();
revoke execute on function public.carimbar_documento_financeiro() from anon, authenticated, public;

create trigger documentos_financeiros_auditoria after insert or update or delete on public.documentos_financeiros
  for each row execute function public.registrar_auditoria();

-- Segurança: só quem mexe no financeiro.
alter table public.documentos_financeiros enable row level security;
revoke all on public.documentos_financeiros from anon, authenticated;
grant select, insert, update, delete on public.documentos_financeiros to authenticated;

create policy ver on public.documentos_financeiros for select to authenticated
  using (public.tem_permissao('financeiro', 'ver'));
create policy criar on public.documentos_financeiros for insert to authenticated
  with check (public.tem_permissao('financeiro', 'criar'));
create policy editar on public.documentos_financeiros for update to authenticated
  using (public.tem_permissao('financeiro', 'criar') or public.tem_permissao('financeiro', 'editar'));
create policy remover on public.documentos_financeiros for delete to authenticated
  using (public.tem_permissao('financeiro', 'editar'));

-- Arquivos: bucket privado.
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documentos', 'documentos', false, 15728640,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'text/xml', 'application/xml'])
  on conflict (id) do nothing;
  execute $p$create policy documentos_ver on storage.objects for select to authenticated using (
    bucket_id = 'documentos' and public.tem_permissao('financeiro', 'ver'))$p$;
  execute $p$create policy documentos_enviar on storage.objects for insert to authenticated with check (
    bucket_id = 'documentos' and public.tem_permissao('financeiro', 'criar'))$p$;
  execute $p$create policy documentos_apagar on storage.objects for delete to authenticated using (
    bucket_id = 'documentos' and public.tem_permissao('financeiro', 'editar'))$p$;
end $$;
