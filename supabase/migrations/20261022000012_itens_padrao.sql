-- Itens que se repetem em quase todo modelo (mão de obra e outros custos):
-- ficam salvos e já vêm preenchidos em toda precificação nova.
alter table public.config_precificacao add column itens_padrao jsonb not null default '[]'::jsonb;
