import { count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";

export type AppRole = "admin" | "chefe" | "conferente" | "vendedora";
export type CurrentAccess = { email: string; name: string; role: AppRole; sellerName: string | null; active: boolean; bootstrap?: boolean };

export async function authenticatedIdentity() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
  const encoded = requestHeaders.get("oai-authenticated-user-full-name");
  const name = encoded && requestHeaders.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8" ? safeDecode(encoded) : null;
  return email ? { email, name: name || email.split("@")[0] } : null;
}

export async function getCurrentAccess(): Promise<CurrentAccess | null> {
  const identity = await authenticatedIdentity();
  if (!identity) return null;
  const db = getDb();
  const [user] = await db.select().from(appUsers).where(eq(appUsers.email, identity.email)).limit(1);
  if (user) return { email: user.email, name: user.name, role: user.role as AppRole, sellerName: user.sellerName, active: user.active };
  const [total] = await db.select({ value: count() }).from(appUsers);
  if (!total.value) return { ...identity, role: "admin", sellerName: null, active: true, bootstrap: true };
  return null;
}

export async function ensureBootstrapAdmin() {
  const access = await getCurrentAccess();
  if (!access?.bootstrap) return access;
  const [user] = await getDb().insert(appUsers).values({ email: access.email, name: access.name, role: "admin", active: true }).onConflictDoNothing().returning();
  return user ? { email: user.email, name: user.name, role: user.role as AppRole, sellerName: user.sellerName, active: user.active } : getCurrentAccess();
}

export function accessError(access: CurrentAccess | null, roles: AppRole[]) {
  if (!access) return Response.json({ error: "Usuário sem acesso ao sistema." }, { status: 403 });
  if (!access.active) return Response.json({ error: "Usuário inativo." }, { status: 403 });
  if (!roles.includes(access.role)) return Response.json({ error: "Você não tem permissão para acessar esta área.", redirect: access.role === "vendedora" ? "/crm" : "/" }, { status: 403 });
  return null;
}

function safeDecode(value: string) { try { return decodeURIComponent(value); } catch { return null; } }
