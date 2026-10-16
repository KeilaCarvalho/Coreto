import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/sessao";
import { lerRelatorio } from "@/lib/relatorios-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lê um relatório em PDF e devolve a prévia das linhas. Não grava nada. */
export async function POST(request: Request) {
  const sessao = await lerSessao();
  if (!sessao?.pessoa?.acesso_ativo || !sessao.pode("comercial", "aprovar")) {
    return NextResponse.json({ erro: "Somente a gestão comercial pode importar relatórios." }, { status: 403 });
  }
  try {
    const form = await request.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || !/\.pdf$/i.test(arquivo.name) && arquivo.type !== "application/pdf") {
      return NextResponse.json({ erro: "Escolha o relatório em PDF." }, { status: 400 });
    }
    if (arquivo.size > 4 * 1024 * 1024) return NextResponse.json({ erro: "O PDF pode ter no máximo 4 MB." }, { status: 400 });
    const lido = await lerRelatorio(new Uint8Array(await arquivo.arrayBuffer()));
    if (!lido.linhas.length) {
      return NextResponse.json({ erro: "Não reconheci este relatório. Use um dos três modelos: Clientes primeira compra, Relatório de clientes (aniversariantes) ou Desconto/Acréscimo de vendas por vendedor." }, { status: 422 });
    }
    return NextResponse.json({ ...lido, arquivo: arquivo.name });
  } catch (e) {
    return NextResponse.json({ erro: `Não consegui ler o PDF: ${(e as Error).message}` }, { status: 500 });
  }
}
