-- Funções criadas na migração 6 nasceram executáveis por qualquer um (padrão do Postgres).
-- Só usuários logados podem chamá-las; cada uma ainda checa a permissão do perfil.
revoke execute on function public.desfazer_importacao_clientes(uuid), public.importar_clientes(text, jsonb, text, text),
  public.normalizar_nome(text), public.recalcular_clientes() from anon, public;
