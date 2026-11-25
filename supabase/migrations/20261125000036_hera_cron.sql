-- Agenda a função hera-sincronizar de hora em hora, das 8h às 21h (horário de Brasília = UTC-3).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('hera-sincronizar-horario', '5 11-23,0 * * *', $$
  select net.http_post(
    url := 'https://vonxmispmtiuhjaeytvk.supabase.co/functions/v1/hera-sincronizar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <chave anon do projeto>'),
    body := '{"origem":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
