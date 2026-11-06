-- Peças para fotos não mexem no estoque do sistema: ela digita peça, cor e tamanho.
alter table public.fotos_itens alter column variante_id drop not null;
alter table public.fotos_itens add column if not exists peca text, add column if not exists cor text, add column if not exists tamanho text;
-- registrar_sessao_fotos(jsonb) e mudar_item_fotos(bigint,text,text) recriadas sem movimentar estoque (ver Supabase).
