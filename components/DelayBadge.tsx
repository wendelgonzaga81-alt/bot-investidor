export function DelayBadge({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className="badge amber"
      href="https://www.tradingview.com/blog/en/b3-data-available-in-tradingview-widgets-41743/"
      target="_blank"
      rel="noreferrer"
      title="Cotações de ações e índices da B3 exibidas com 15 minutos de atraso, conforme o TradingView. Dólar e commodities seguem o atraso do respectivo provedor. Não é recomendação de investimento."
    >
      ⏱ {compact ? "Atraso 15 min" : "Atraso de 15 min · B3 via TradingView"}
    </a>
  );
}
