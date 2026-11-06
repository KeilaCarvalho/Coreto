-- Ela só avisa (devolvendo / doando); a baixa final (devolvido / deu) é de quem aprova (marketing:aprovar).
alter table public.fotos_itens drop constraint if exists fotos_itens_situacao_check;
alter table public.fotos_itens add constraint fotos_itens_situacao_check check (situacao in ('com_ela', 'devolvendo', 'doando', 'devolvido', 'deu'));
-- mudar_item_fotos(bigint,text,text) recriada com essa regra (ver Supabase).
