import Link from "next/link";
import { TickerTape } from "@/components/TickerTape";

export default function Home() {
  return (
    <>
      <TickerTape />
      <div className="container">
        <header className="header">
          <Link href="/" className="brand"><img src="/icon.svg" alt="" />Invest <span>Moment</span></Link>
          <Link href="/chat" className="btn ghost">Entrar</Link>
        </header>
        <section className="hero">
          <span className="badge">● ANALISTA DE PESQUISA · B3</span>
          <h1>Invest Moment — <em>análise da B3 com evidência,</em> não com palpite</h1>
          <p>Pergunte qual ação está melhor, peça uma previsão ou o boletim do dia. O bot busca cotações e notícias, calcula o score e responde curto, com fonte e horário.</p>
          <Link href="/chat" className="btn">Abrir o chat →</Link>
          <div className="dim mono" style={{ fontSize: 12, marginTop: 10 }}>comece com <span style={{ color: "var(--accent)" }}>Hello invest moment</span></div>
        </section>
        <img className="banner-img" src="/banner.png" alt="Bem-vindo ao Invest Moment" />
        <div className="grid3">
          <div className="card"><h3>📊 Dados reais</h3><p>Cotações e histórico da brapi.dev, gráficos do TradingView e notícias de B3, CVM, RI e BCB via Firecrawl.</p></div>
          <div className="card"><h3>🎯 Score -100 a +100</h3><p>Tendência, momentum, volume, fundamentos e risco calculados em código, com a cobertura de dados informada.</p></div>
          <div className="card"><h3>⚡ Direto ao ponto</h3><p>Até 3 ativos com viés, motivo, risco e o que invalidaria a leitura. Sem rodeios.</p></div>
        </div>
        <footer className="footer">
          Análise informativa, pode conter erros. Não é garantia de resultado nem recomendação personalizada. O Invest Moment não executa ordens nem pede senhas. Cotações da B3 com 15 minutos de atraso. <a href="/privacidade">Privacidade</a>
        </footer>
      </div>
    </>
  );
}
