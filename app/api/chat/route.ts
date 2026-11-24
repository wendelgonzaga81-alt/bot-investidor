import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT, contextBlock } from "@/lib/prompt";
import { TOOL_DEFS, runTool } from "@/lib/tools";
import { geminiAllCooling, runGemini } from "@/lib/gemini";
import { hasBackup, runBackup } from "@/lib/ai-backup";
import { looksLikeInjection, scrubSecrets, securityLog } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 4;
const DEADLINE_MS = 55_000; // termina antes do limite de 60 s da função na Vercel

const Body = z.object({
  name: z.string().max(80).optional().default(""),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

// Provedor: AI_PROVIDER ("gemini", "groq" ou "anthropic") se definido; senão Gemini quando houver GEMINI_API_KEY,
// a IA reserva (Mistral, OpenRouter ou Groq) quando só houver a chave dela, e Anthropic quando só houver ANTHROPIC_API_KEY.
// Com Gemini e reserva configurados, a reserva entra sozinho quando o Gemini falha ou demora.
function provider(): "gemini" | "backup" | "anthropic" | null {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if ((forced === "mistral" || forced === "groq" || forced === "openrouter") && hasBackup()) return "backup";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (hasBackup()) return "backup";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

// Cache curto para perguntas gerais de mercado (iguais para todos), como "Bolsa hoje".
// O nome do usuário é trocado por um marcador antes de guardar, para não aparecer a outra pessoa.
const CACHE_MS = 5 * 60_000;
const NAME_MARK = "\u0000NOME\u0000";
const answerCache = new Map<string, { at: number; text: string }>();
function cacheKey(messages: { role: string; content: string }[]): string | null {
  if (messages.length > 2) return null; // só a primeira pergunta da conversa (sem contexto anterior)
  const q = messages[messages.length - 1].content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(como esta a )?bolsa (de )?hoje$|^radar( do dia)?$|^ibovespa hoje$|^mercado hoje$|^resumo do mercado$/.test(q)) return q;
  if (/^onde estao os olhos dos investidores$/.test(q)) return q;
  if (/^qual acao esta melhor para os proximos 20 pregoes$/.test(q)) return q;
  return null;
}

const anthropicTools: Anthropic.Beta.BetaTool[] = TOOL_DEFS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

async function runAnthropic(opts: {
  name: string;
  messages: { role: "user" | "assistant"; content: string }[];
  write: (s: string) => void;
  signal: AbortSignal;
}) {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: contextBlock(opts.name, new Date()) },
  ];
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = client.beta.messages.stream(
        {
          model: ANTHROPIC_MODEL,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          max_tokens: 16000,
          output_config: { effort: "medium" },
          system,
          tools: anthropicTools,
          messages,
        },
        { signal: opts.signal },
      );
      stream.on("text", (delta) => opts.write(delta));
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        opts.write("\n\nNão consegui responder a este pedido.");
        return;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) return;
      if (round === MAX_TOOL_ROUNDS) {
        opts.write("\n\n(Limite de consultas atingido nesta resposta.)");
        return;
      }
      messages.push({ role: "assistant", content: message.content });
      opts.write("\n");
      const results = await Promise.all(
        toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await runTool(t.name, t.input);
          return { type: "tool_result", tool_use_id: t.id, content: r.content, is_error: r.isError };
        }),
      );
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) opts.write("\n\nMuitos pedidos agora. Tente de novo em instantes.");
    else if (e instanceof Anthropic.AuthenticationError) opts.write("\n\nChave da IA inválida no servidor.");
    else if (e instanceof Anthropic.APIError) opts.write(`\n\nErro da IA (${e.status}). Tente de novo.`);
    else throw e;
  }
}

export async function POST(req: Request) {
  const p = provider();
  if (!p) {
    return new Response("O servidor ainda não tem a chave da IA configurada (GEMINI_API_KEY ou MISTRAL_API_KEY).", { status: 500 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Pedido inválido.", { status: 400 });

  const messages = parsed.data.messages.slice(-20);
  if (messages[0]?.role !== "user") messages.shift();

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return new Response("Pedido inválido.", { status: 400 });
  // Comando de início: resposta imediata, sem IA (não depende de cotações nem notícias).
  if (/^\s*hello\s+invest\s+moment\b/i.test(last.content)) {
    const nome = parsed.data.name.replace(/\s+/g, " ").trim().slice(0, 80) || "investidor";
    const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" }).format(new Date());
    const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    return new Response(
      `${saud}, **${nome}**! Eu sou o Invest Moment, seu analista da B3 (${hora} em Brasília).\n\n` +
        "**O que posso fazer:**\n" +
        "- **Qual ação está melhor para os próximos 20 pregões?**\n" +
        "- **Bolsa hoje**: resumo do mercado\n" +
        "- **Analise PETR4**: análise de uma ação\n" +
        "- **Previsão de VALE3**: viés para os próximos pregões\n" +
        "- **Compare ITUB4 e BBDC4**\n" +
        "- **Onde estão os olhos dos investidores?**\n" +
        "- **Mostre um gráfico de WEGE3**\n\n" +
        "⚠️ Análise informativa, pode conter erros. Não é garantia de resultado.",
      { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  if (looksLikeInjection(last.content)) {
    securityLog("prompt_injection", {
      ip: req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido",
      sample: last.content.slice(0, 120),
    });
    return new Response(
      "Não posso compartilhar instruções internas, chaves ou configuração. Posso analisar uma ação, o Ibovespa ou o Radar do dia.\n\n⚠️ Análise informativa, pode conter erros. Não é garantia de resultado.",
      { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  const nome = parsed.data.name.replace(/\s+/g, " ").trim().slice(0, 80);
  const key = cacheKey(messages);
  const hit = key ? answerCache.get(key) : undefined;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return new Response(hit.text.split(NAME_MARK).join(nome || "investidor"), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const encoder = new TextEncoder();
  const started = Date.now();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let failed = false;
      const write = (s: string) => {
        const clean = scrubSecrets(s);
        full += clean;
        controller.enqueue(encoder.encode(clean));
      };
      const system = `${SYSTEM_PROMPT}\n\n${contextBlock(parsed.data.name, new Date())}`;
      const base = { system, messages, write, signal: req.signal, maxRounds: MAX_TOOL_ROUNDS };
      try {
        if (p === "gemini") {
          const backup = hasBackup();
          let done = false;
          if (!(backup && geminiAllCooling())) {
            // Com reserva: o Gemini tem até 28 s; se falhar sem escrever nada, a reserva responde no tempo restante.
            done = await runGemini({ ...base, deadline: started + (backup ? 28_000 : DEADLINE_MS), fallback: backup });
          }
          if (!done) {
            const ok = await runBackup({ ...base, deadline: started + DEADLINE_MS });
            if (!ok) {
              failed = true;
              write("As IAs gratuitas estão sobrecarregadas neste momento. Tente de novo em 1 minuto.");
            }
          }
        } else if (p === "backup") {
          const ok = await runBackup({ ...base, deadline: started + DEADLINE_MS });
          if (!ok) {
            failed = true;
            write("A IA está sobrecarregada neste momento. Tente de novo em 1 minuto.");
          }
        } else {
          await runAnthropic({ name: parsed.data.name, messages, write, signal: req.signal });
        }
      } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError")) {
          console.error("chat:", (e as Error)?.message);
          failed = true;
          write("\n\nFalha ao gerar a resposta. Tente de novo.");
        }
      } finally {
        // Guarda no cache só respostas completas (sem aviso de erro ou tempo esgotado).
        if (key && !failed && full.length > 80 && !/Tente de novo|Tempo esgotado|demorou demais/i.test(full)) {
          let text = nome ? full.split(nome).join(NAME_MARK) : full;
          const first = nome.split(" ")[0];
          if (first && first !== nome && first.length >= 3) text = text.split(first).join(NAME_MARK);
          answerCache.set(key, { at: Date.now(), text });
          if (answerCache.size > 50) answerCache.delete(answerCache.keys().next().value!);
        }
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
