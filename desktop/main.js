// App de computador do Invest Moment: janela segura que abre o site publicado.
// Menu "Painel" abre /admin, que continua exigindo a senha de administrador.
// Nenhuma chave fica no app: tudo roda no servidor (Vercel).
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const SITE = (process.env.INVEST_MOMENT_URL || cfg.siteUrl).replace(/\/$/, "");
const ORIGIN = new URL(SITE).origin;

let win;

function go(p) {
  if (win) win.loadURL(`${SITE}${p}`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 380,
    backgroundColor: "#0B0F14",
    title: "Invest Moment",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Só o domínio do site abre dentro do app; links externos vão para o navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin === ORIGIN) return { action: "allow" };
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (new URL(url).origin !== ORIGIN) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.on("did-fail-load", () => {
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="background:#0B0F14;color:#E6EDF3;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Sem conexão com o Invest Moment</h2><p style="color:#9AA7B4">Verifique a internet ou se o site está publicado em<br><code>${SITE}</code></p><p style="color:#9AA7B4">Menu Exibir &gt; Recarregar para tentar de novo.</p></div></body>`,
        ),
    );
  });

  go("/chat");
}

const menu = Menu.buildFromTemplate([
  {
    label: "Invest Moment",
    submenu: [
      { label: "Chat", accelerator: "CmdOrCtrl+1", click: () => go("/chat") },
      { label: "Início", accelerator: "CmdOrCtrl+2", click: () => go("/") },
      { type: "separator" },
      { role: "quit", label: "Sair" },
    ],
  },
  {
    label: "Painel",
    submenu: [
      { label: "Painel administrativo", accelerator: "CmdOrCtrl+Shift+A", click: () => go("/admin") },
      { label: "Abrir no navegador", click: () => shell.openExternal(`${SITE}/admin`) },
    ],
  },
  {
    label: "Exibir",
    submenu: [
      { role: "reload", label: "Recarregar" },
      { role: "togglefullscreen", label: "Tela cheia" },
      { role: "zoomIn", label: "Aumentar" },
      { role: "zoomOut", label: "Diminuir" },
      { role: "resetZoom", label: "Tamanho normal" },
    ],
  },
]);

// Uma instância só.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Nega câmera, microfone, localização e afins para qualquer página.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  Menu.setApplicationMenu(menu);
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
