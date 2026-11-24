// Cadastro opcional do site público, com consentimento explícito (LGPD).
import { z } from "zod";
import { addSubscriber, hasStore } from "@/lib/store";
import { POLICY_VERSION } from "@/lib/privacy";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  consent: z.literal(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos ou sem consentimento." }, { status: 400 });
  if (!hasStore()) return Response.json({ error: "Cadastro indisponível no momento." }, { status: 503 });
  await addSubscriber({
    name: parsed.data.name.replace(/[<>]/g, ""),
    email: parsed.data.email,
    consentAt: new Date().toISOString(),
    policy: POLICY_VERSION,
  });
  return Response.json({ ok: true });
}
