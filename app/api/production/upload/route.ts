import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return Response.json({ error: "Selecione um arquivo." }, { status: 400 }); if (!/^(application\/pdf|image\/)/.test(file.type)) return Response.json({ error: "Envie PDF ou imagem." }, { status: 400 }); const key = `invoices/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`; await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } }); return Response.json({ key, fileName: file.name, status: "stored", extractedItems: [] }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha no upload." }, { status: 500 }); }
}
