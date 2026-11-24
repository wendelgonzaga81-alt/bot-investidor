import type { MetadataRoute } from "next";

// Permite instalar o site como aplicativo (Chrome/Edge: ícone "Instalar" na barra de endereço).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Invest Moment",
    short_name: "Invest Moment",
    description: "Analista da B3 com dados, notícias e Radar do dia.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#0B0F14",
    theme_color: "#0B0F14",
    lang: "pt-BR",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/logo.png", sizes: "1080x1080", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Chat", url: "/chat" },
      { name: "Painel administrativo", url: "/admin" },
    ],
  };
}
