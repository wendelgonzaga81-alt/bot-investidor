import { ADMIN_COOKIE, adminConfigured, checkPassword, createSession, sessionMaxAge } from "@/lib/admin/auth";
import { trackSecurity } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!adminConfigured()) {
    return Response.json({ error: "Painel desativado: defina ADMIN_PASSWORD (12+ caracteres) na Vercel." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const pw = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!(await checkPassword(pw))) {
    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
    console.warn(JSON.stringify({ security: "admin_login_failed", ip, at: new Date().toISOString() }));
    await trackSecurity("admin_login_failed", ip, "/api/admin/login");
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "Senha incorreta." }, { status: 401 });
  }
  const token = await createSession();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionMaxAge}${secure}`,
    },
  });
}
