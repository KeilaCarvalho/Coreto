/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/cabecalho";
import { EM_BREVE } from "@/lib/navegacao";

export default async function EmBreve({ params }: { params: Promise<{ area: string }> }) {
  const area = EM_BREVE[(await params).area];
  if (!area) notFound();
  return (
    <>
      <Cabecalho titulo={area.titulo} />
      <section className="painel em-breve-caixa">
        <img src="/coreto-flor.png" alt="" />
        <h2>Chega na {area.fase}</h2>
        <p>{area.texto}</p>
        <p style={{ marginTop: 12 }}>Enquanto isso, essa rotina continua no sistema antigo.</p>
      </section>
    </>
  );
}
