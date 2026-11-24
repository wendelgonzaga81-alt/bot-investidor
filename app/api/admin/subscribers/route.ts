// Exportar (CSV) e excluir cadastros. Protegido pela sessão do painel no middleware.
import { listSubscribers, removeSubscriber } from "@/lib/store";

export const runtime = "nodejs";

const csvCell = (v: string) => `"${v.replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;

export async function GET() {
  const subs = (await listSubscribers()) ?? [];
  const rows = [["nome", "email", "consentimento_em", "versao_aviso"], ...subs.map((s) => [s.name, s.email, s.consentAt, s.policy])];
  return new Response(rows.map((r) => r.map(csvCell).join(",")).join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cadastros-invest-moment.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(req: Request) {
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return Response.json({ error: "Informe o e-mail." }, { status: 400 });
  await removeSubscriber(email);
  return Response.json({ ok: true });
}
