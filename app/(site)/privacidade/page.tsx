import Link from "next/link";
import { POLICY_VERSION } from "@/lib/privacy";

export const metadata = { title: "Política de Privacidade · Invest Moment" };

export default function Privacidade() {
  const contato = process.env.CONTACT_EMAIL;
  return (
    <main className="container" style={{ maxWidth: 760, padding: "32px 16px 60px", lineHeight: 1.65 }}>
      <Link href="/" className="brand"><img src="/icon.svg" alt="" />Invest <span>Moment</span></Link>
      <h1 style={{ marginTop: 28 }}>Política de Privacidade</h1>
      <p className="muted">Versão {POLICY_VERSION}. Em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

      <h3>Quais dados coletamos</h3>
      <ul>
        <li><b>Cadastro opcional:</b> nome e e-mail, só se você preencher e marcar o consentimento.</li>
        <li><b>Estatísticas anônimas:</b> número de acessos e de perguntas por dia. Visitantes únicos são contados por um código embaralhado que muda todo dia; não guardamos seu IP nas estatísticas.</li>
        <li><b>Segurança:</b> quando um pedido é bloqueado (ataque, excesso de pedidos), registramos o motivo, o horário e o IP parcial (ex.: 189.45.x.x), por até 90 dias.</li>
        <li><b>Conversas:</b> o texto das perguntas não é gravado pelo site. Ele é enviado ao provedor de IA (Google Gemini) só para gerar a resposta. O histórico fica apenas no seu navegador.</li>
      </ul>

      <h3>Para que usamos</h3>
      <p>Cadastro: enviar o Radar do dia e novidades do Invest Moment (base legal: consentimento). Estatísticas e segurança: manter o site funcionando e protegido (base legal: legítimo interesse).</p>

      <h3>Com quem compartilhamos</h3>
      <p>Não vendemos dados. Usamos fornecedores para operar o site: Vercel (hospedagem), Supabase (armazenamento), Google e Mistral (IA), brapi.dev (cotações) e Firecrawl (notícias).</p>

      <h3>Seus direitos</h3>
      <p>Você pode pedir acesso, correção ou exclusão dos seus dados e retirar o consentimento a qualquer momento{contato ? <> pelo e-mail <a href={`mailto:${contato}`}>{contato}</a></> : " pelos canais de contato do Invest Moment"}.</p>

      <h3>Aviso</h3>
      <p className="muted">O Invest Moment oferece análises informativas e pode cometer erros. Não é recomendação individual nem garantia de resultado.</p>
    </main>
  );
}
