-- Formas de pagamento do Fluxo guardadas ao salvar (renomear/tirar vale para os próximos dias).
alter table public.fluxo_config add column if not exists formas_padrao jsonb;
