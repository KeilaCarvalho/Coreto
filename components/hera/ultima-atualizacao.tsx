"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/navegador";

type Sinc = { fim: string | null; ok: boolean | null; erro: string | null };

const hora = (iso: string) => {
  const d = new Date(iso);
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const diaSP = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hh = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  if (diaSP === hojeSP) return `hoje às ${hh}`;
  const ontem = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return diaSP === ontem ? `ontem às ${hh}` : `${diaSP.slice(8, 10)}/${diaSP.slice(5, 7)} às ${hh}`;
};

/** Selo "Vendas atualizadas hoje às 17:05" (última vez que o robô puxou o HeraDash). Atualiza sozinho. */
export function UltimaAtualizacao({ compacto = false }: { compacto?: boolean }) {
  const [ultimaOk, setUltimaOk] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [pode, setPode] = useState(true);
  useEffect(() => {
    const sb = supabaseNavegador();
    let vivo = true;
    async function ler() {
      const [{ data: ok, error }, { data: ult }] = await Promise.all([
        sb.from("hera_sincronizacoes").select("fim, ok, erro").eq("ok", true).order("inicio", { ascending: false }).limit(1).maybeSingle(),
        sb.from("hera_sincronizacoes").select("fim, ok, erro").not("fim", "is", null).order("inicio", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!vivo) return;
      if (error) { setPode(false); return; }
      setUltimaOk((ok as Sinc | null)?.fim ?? null);
      setFalhou((ult as Sinc | null)?.ok === false);
    }
    ler();
    const t = setInterval(ler, 5 * 60 * 1000);
    const foco = () => { if (document.visibilityState === "visible") ler(); };
    document.addEventListener("visibilitychange", foco);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", foco); };
  }, []);
  if (!pode || !ultimaOk) return null;
  const texto = hora(ultimaOk);
  return (
    <Link href="/comercial/vendas" className={`ua-selo${falhou ? " falhou" : ""}${compacto ? " compacto" : ""}`}
      title={falhou ? `A última tentativa falhou. Vendas do HeraDash atualizadas ${texto}.` : `Vendas do HeraDash atualizadas ${texto}`}>
      <i aria-hidden="true" />
      {compacto ? <span>{texto.replace("hoje às ", "")}</span> : <span>Vendas atualizadas <b>{texto}</b></span>}
    </Link>
  );
}
