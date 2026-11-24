// Diagnóstico rápido: mostra se cada serviço está configurado e se a IA responde.
// Não mostra nenhuma chave, só "ok" ou o tipo de erro.
import { geminiCall, geminiModels, GeminiError } from "@/lib/gemini";
import { hasStore, storeKind, storePing } from "@/lib/store";
import { backupName, backupPing, hasBackup } from "@/lib/ai-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const out: Record<string, unknown> = {
    verificadoEm: new Date().toISOString(),
    ia: process.env.GEMINI_API_KEY ? "configurada" : process.env.ANTHROPIC_API_KEY ? "anthropic" : hasBackup() ? "só reserva" : "FALTA GEMINI_API_KEY",
    iaReserva: hasBackup() ? `configurada (${backupName()})` : "não configurada (opcional: MISTRAL_API_KEY)",
    cotacoes: process.env.BRAPI_TOKEN ? "configurada" : "FALTA BRAPI_TOKEN",
    noticias: process.env.FIRECRAWL_API_KEY ? "configurada" : "FALTA FIRECRAWL_API_KEY",
    painel: (process.env.ADMIN_PASSWORD ?? "").length >= 12 ? "configurado" : "FALTA ADMIN_PASSWORD (12+ caracteres)",
    armazenamento: hasStore() ? `configurado (${storeKind()})` : "não conectado (painel sem números)",
  };
  const [storeOk, groq] = await Promise.all([hasStore() ? storePing() : Promise.resolve(null), hasBackup() ? backupPing() : Promise.resolve(null)]);
  if (storeOk !== null) out.testeArmazenamento = storeOk ? "ok (lendo e gravando)" : "falhou ao conectar (veja os logs da Vercel)";
  if (groq) out.testeIAReserva = groq;
  if (process.env.GEMINI_API_KEY) {
    const t0 = Date.now();
    try {
      await geminiCall({ contents: [{ role: "user", parts: [{ text: "Responda só: ok" }] }] }, AbortSignal.timeout(25000), 8000, Date.now() + 25000);
      out.testeIA = `ok em ${Date.now() - t0} ms`;
    } catch (e) {
      out.testeIA = e instanceof GeminiError ? `erro ${e.status}: ${e.message}` : `erro: ${(e as Error).message}`;
      out.modelosTentados = geminiModels();
    }
  }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
