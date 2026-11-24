// Preço (linha) e volume (barras) em painéis separados, só com pontos reais da série.
type Bar = { date: number; close: number; volume: number };

export function PriceVolume({ bars, ticker }: { bars: Bar[]; ticker: string }) {
  if (bars.length < 2) return <p className="dim">Série insuficiente para o gráfico.</p>;
  const W = 320, PH = 110, VH = 40, PAD = 4;
  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const vmax = Math.max(...bars.map((b) => b.volume)) || 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (bars.length - 1);
  const y = (c: number) => PAD + (PH - 2 * PAD) * (1 - (c - min) / (max - min || 1));
  const path = bars.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(b.close).toFixed(1)}`).join(" ");
  const up = closes.at(-1)! >= closes[0];
  const color = up ? "#10B981" : "#EF4444";
  const bw = Math.max(1, (W - 2 * PAD) / bars.length - 1);
  const fmt = (d: number) => new Date(d * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  return (
    <figure style={{ margin: "8px 0 0" }}>
      <svg viewBox={`0 0 ${W} ${PH}`} width="100%" role="img" aria-label={`Preço de fechamento de ${ticker}`}>
        <path d={path} fill="none" stroke={color} strokeWidth={1.8} />
      </svg>
      <svg viewBox={`0 0 ${W} ${VH}`} width="100%" role="img" aria-label={`Volume de ${ticker}`}>
        {bars.map((b, i) => {
          const h = (b.volume / vmax) * (VH - 2);
          return <rect key={b.date} x={x(i) - bw / 2} y={VH - h} width={bw} height={h} fill="#2B3A4A" />;
        })}
      </svg>
      <figcaption className="dim mono" style={{ fontSize: 10.5, display: "flex", justifyContent: "space-between" }}>
        <span>{fmt(bars[0].date)}</span>
        <span>fechamento R$ {min.toFixed(2)}–{max.toFixed(2)} · volume</span>
        <span>{fmt(bars.at(-1)!.date)}</span>
      </figcaption>
    </figure>
  );
}
