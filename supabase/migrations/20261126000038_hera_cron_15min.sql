-- Robô do HeraDash: de 15 em 15 minutos, das 8h às 21h (Brasília).
select cron.alter_job((select jobid from cron.job where jobname = 'hera-sincronizar-horario'), schedule := '*/15 11-23,0 * * *');
