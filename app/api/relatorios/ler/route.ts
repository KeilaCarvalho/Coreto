import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/sessao";
import { lerRelatorio } from "@/lib/relatorios-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lê um relatório em PDF do sistema de vendas e devolve as linhas. Não grava nada. */
export async function POST(request: Request) {
  const sessao = await lerSessao();
  if (!sessao?.pessoa?.acesso_ativo || !(sessao.pode("comercial", "aprovar") || sessao.pode("financeiro", "editar"))) {
    return NextResponse.json({ erro: "Somente a gestão pode importar relatórios." }, { status: 403 });
  }
  try {
    const form = await request.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== "application/pdf")) {
      return NextResponse.json({ erro: "Escolha o relatório em PDF." }, { status: 400 });
    }
    if (arquivo.size > 4 * 1024 * 1024) return NextResponse.json({ erro: "O PDF pode ter no máximo 4 MB. Gere o relatório de um período menor." }, { status: 400 });
    const lido = await lerRelatorio(new Uint8Array(await arquivo.arrayBuffer()));
    if (!lido.tipo) return NextResponse.json({ erro: "Não reconheci este relatório. Veja ao lado a lista dos relatórios que o sistema lê." }, { status: 422 });
    if (!lido.linhas.length) return NextResponse.json({ erro: "Reconheci o relatório, mas não achei linhas nele. Ele está vazio?" }, { status: 422 });
    return NextResponse.json({ ...lido, arquivo: arquivo.name });
  } catch (e) {
    return NextResponse.json({ erro: `Não consegui ler o PDF: ${(e as Error).message}` }, { status: 500 });
  }
}
