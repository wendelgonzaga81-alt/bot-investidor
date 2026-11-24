// Diagnóstico rápido: mostra se cada serviço está configurado e se a IA responde.
// Não mostra nenhuma chave, só "ok" ou o tipo de erro.
import { geminiCall, geminiModels, GeminiError } from "@/lib/gemini";
import { hasStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const out: Record<string, unknown> = {
    verificadoEm: new Date().toISOString(),
    ia: process.env.GEMINI_API_KEY ? "configurada" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "FALTA GEMINI_API_KEY",
    cotacoes: process.env.BRAPI_TOKEN ? "configurada" : "FALTA BRAPI_TOKEN",
    noticias: process.env.FIRECRAWL_API_KEY ? "configurada" : "FALTA FIRECRAWL_API_KEY",
    painel: (process.env.ADMIN_PASSWORD ?? "").length >= 12 ? "configurado" : "FALTA ADMIN_PASSWORD (12+ caracteres)",
    armazenamento: hasStore() ? "conectado" : "não conectado (painel sem números)",
  };
  if (process.env.GEMINI_API_KEY) {
    const t0 = Date.now();
    try {
      await geminiCall({ contents: [{ role: "user", parts: [{ text: "Responda só: ok" }] }] }, AbortSignal.timeout(20000));
      out.testeIA = `ok em ${Date.now() - t0} ms`;
    } catch (e) {
      out.testeIA = e instanceof GeminiError ? `erro ${e.status}: ${e.message}` : `erro: ${(e as Error).message}`;
      out.modelosTentados = geminiModels();
    }
  }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
