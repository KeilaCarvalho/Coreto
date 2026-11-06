-- Excluir sessões e peças de fotos: só quem aprova marketing.
create policy apagar on public.fotos_sessoes for delete to authenticated using (public.tem_permissao('marketing', 'aprovar'));
create policy apagar on public.fotos_itens for delete to authenticated using (public.tem_permissao('marketing', 'aprovar'));
