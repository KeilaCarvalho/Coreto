import Link from "next/link";
import { notFound } from "next/navigation";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { Icone } from "@/components/icone";
import { EscolherModelo } from "@/components/recebimento/campos";
import { ConferirOp } from "@/components/recebimento/conferir-op";
import type { LinhaGradeOp } from "@/components/producao/grade-op";

export const metadata = { title: "Conferir chegada" };

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export default async function ConferirChegada({ params, searchParams }: { params: Promise<{ op: string }>; searchParams: Promise<{ produto?: string }> }) {
  await exigir("faccao", "criar");
  const { op: id } = await params;
  const { produto: escolhido } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await supabaseServidor();
  const [{ data: op }, { data: produtos }] = await Promise.all([
    sb.from("producao_ops").select("id, numero, titulo, faccao, tamanhos, grade, entrega, produto_id, pronta_em, conferida_em, recebimento_id").eq("id", id).maybeSingle(),
    sb.from("produtos").select("id, referencia, nome").is("arquivado_em", null).order("referencia"),
  ]);
  if (!op) notFound();
  const lista = (produtos ?? []) as { id: string; referencia: string; nome: string }[];

  // Modelo: o escolhido, o já ligado à OP ou um palpite pelo nome.
  const palpite = lista.find((p) => normal(p.nome) === normal(op.titulo))?.id
    ?? lista.find((p) => normal(op.titulo).includes(normal(p.nome)) || normal(p.nome).includes(normal(op.titulo)))?.id;
  const produtoId = escolhido && /^[0-9a-f-]{36}$/i.test(escolhido) ? escolhido : op.produto_id ?? palpite ?? null;
  let produto: { id: string; nome: string; cores: { id: string; nome: string; hex: string | null }[]; variantes: { id: string; cor_id: string; tamanho: string }[] } | null = null;
  if (produtoId) {
    const { data: pr } = await sb.from("produtos").select("id, nome, variantes(id, cor_id, tamanho, ativa, cores(id, nome, hex))").eq("id", produtoId).maybeSingle();
    if (pr) {
      const vs = ((pr as unknown as { variantes: { id: string; cor_id: string; tamanho: string; cores: { id: string; nome: string; hex: string | null } | null }[] }).variantes ?? []);
      const cores = new Map<string, { id: string; nome: string; hex: string | null }>();
      for (const v of vs) if (v.cores) cores.set(v.cor_id, v.cores);
      produto = { id: pr.id, nome: pr.nome, cores: [...cores.values()].sort((a, b) => a.nome.localeCompare(b.nome)), variantes: vs.map((v) => ({ id: v.id, cor_id: v.cor_id, tamanho: v.tamanho })) };
    }
  }
  const entrega = ((op.entrega ?? op.grade ?? []) as LinhaGradeOp[]).filter((l) => l.cor);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <Cabecalho
        titulo={`Conferir ${op.numero != null ? `OP ${op.numero}` : "OP"} · ${op.titulo}`}
        descricao={`${op.faccao ? `Facção ${op.faccao}. ` : ""}Compare o que a produção disse que ia entregar com o que chegou.`}
        trilha={[{ rotulo: "Chegada da facção", href: "/producao/recebimentos" }]}
      />
      {op.conferida_em ? (
        <p className="aviso ok"><Icone nome="certo" />Esta OP já foi conferida. {op.recebimento_id && <Link href={`/producao/recebimentos/${op.recebimento_id}`}>Abrir o lote</Link>}</p>
      ) : !entrega.length ? (
        <p className="aviso alerta"><Icone nome="alerta" />A produção ainda não lançou a grade desta OP.</p>
      ) : (
        <>
          <section className="painel" style={{ marginBottom: 12 }}>
            <div className="painel-topo"><div><h2>Modelo do catálogo</h2><p>{produto ? "Confira se é este o modelo." : "Escolha o modelo para ligar as cores e tamanhos ao estoque."}</p></div></div>
            <div className="painel-corpo"><EscolherModelo produtos={lista} atual={produto?.id ?? null} /></div>
          </section>
          {produto && <ConferirOp key={produto.id} op={{ id: op.id, numero: op.numero, titulo: op.titulo, faccao: op.faccao, tamanhos: op.tamanhos ?? ["PP", "P", "M", "G"], entrega }} produto={produto} hoje={hoje} />}
        </>
      )}
    </>
  );
}
