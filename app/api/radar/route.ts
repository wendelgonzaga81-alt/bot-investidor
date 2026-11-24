import { scanB3 } from "@/lib/market";

export const runtime = "nodejs";
export const maxDuration = 60;
// Recalcula no máximo a cada 30 minutos (cache da Vercel).
export const revalidate = 1800;

export async function GET() {
  try {
    const s = await scanB3();
    const top = s.ranking.slice(0, 3).map((a) => ({
      ticker: a.ticker,
      name: a.name,
      bias: a.bias,
      score: a.score,
      coveragePct: a.coveragePct,
      regime: a.regime,
      signal: a.signal,
      lastPrice: a.lastPrice,
      lastTradeTimeBrasilia: a.lastTradeTimeBrasilia,
      changes: a.changes,
      volumeVsMedian20: a.volumeVsMedian20,
      volatility20: a.volatility20,
      bars: a.bars.slice(-60),
    }));
    return Response.json({
      generatedAt: new Date().toISOString(),
      source: "brapi.dev",
      universoReduzido: s.universoReduzido,
      top,
    });
  } catch (e) {
    console.error("radar:", (e as Error).message);
    return Response.json({ error: "Dados de mercado indisponíveis agora." }, { status: 502 });
  }
}
