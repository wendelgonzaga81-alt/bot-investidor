// Painel administrativo (backend). Renderizado só no servidor; exige sessão de administrador.
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminConfigured, verifySession } from "@/lib/admin/auth";
import { hasStore, lastDays, listSubscribers, recentSecurity } from "@/lib/store";
import { LoginForm } from "./_ui/LoginForm";
import { Dashboard } from "./_ui/Dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySession(token))) {
    return <LoginForm configured={adminConfigured()} />;
  }

  const [days, events, subs] = await Promise.all([lastDays(14), recentSecurity(40), listSubscribers()]);
  const provider = process.env.AI_PROVIDER?.toLowerCase() === "anthropic" && process.env.ANTHROPIC_API_KEY
    ? "Claude (Anthropic)"
    : process.env.GEMINI_API_KEY
      ? `Gemini (${process.env.GEMINI_MODEL || "gemini-3.8-flash"})`
      : process.env.ANTHROPIC_API_KEY
        ? "Claude (Anthropic)"
        : "nenhum";

  return (
    <Dashboard
      store={hasStore()}
      days={days}
      events={events}
      subs={subs}
      generatedAt={new Date().toISOString()}
      system={{
        provider,
        keys: [
          { name: "IA (Gemini/Claude)", ok: !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY) },
          { name: "Cotações (brapi)", ok: !!process.env.BRAPI_TOKEN },
          { name: "Notícias (Firecrawl)", ok: !!process.env.FIRECRAWL_API_KEY },
          { name: "Armazenamento (Redis)", ok: hasStore() },
          { name: "Assinatura do painel (ADMIN_SECRET)", ok: !!process.env.ADMIN_SECRET },
        ],
        lockdown: process.env.SITE_LOCKDOWN === "1",
        aiDisabled: process.env.AI_DISABLED === "1",
        limits: {
          chatMin: Number(process.env.RATE_LIMIT_CHAT_PER_MIN) || 8,
          chatDay: Number(process.env.RATE_LIMIT_CHAT_PER_DAY) || 150,
          global: Number(process.env.GLOBAL_CHAT_PER_MIN) || 60,
        },
      }}
    />
  );
}
