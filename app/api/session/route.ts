import { ensureBootstrapAdmin } from "@/lib/access";
export const dynamic = "force-dynamic";
export async function GET() { try { const user = await ensureBootstrapAdmin(); return user ? Response.json({ user }) : Response.json({ error: "Usuário sem acesso." }, { status: 403 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao identificar usuário." }, { status: 500 }); } }
