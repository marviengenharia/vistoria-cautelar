// Roda os testes de navegador: sobe um servidor estático da pasta do app, abre o Edge
// (ou o Chrome) sem janela e executa cada arquivo tests/*.teste.mjs com um perfil novo.
// Uso: npm test            (todos)
//      npm test -- telas   (só os arquivos cujo nome contém "telas")
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PORTA = 8766;
const BASE = `http://127.0.0.1:${PORTA}/`;
const NAVEGADORES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
};

function subirServidor() {
  const servidor = http.createServer((req, res) => {
    let caminho = decodeURIComponent(new URL(req.url, BASE).pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arquivo = path.join(RAIZ, caminho);
    if (!arquivo.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
    fs.readFile(arquivo, (erro, dados) => {
      if (erro) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(dados);
    });
  });
  return new Promise((resolve) => servidor.listen(PORTA, '127.0.0.1', () => resolve(servidor)));
}

const executavel = NAVEGADORES.find((c) => fs.existsSync(c));
if (!executavel) {
  console.error('Não achei Edge nem Chrome instalados.');
  process.exit(1);
}

const filtro = process.argv[2] ?? '';
const arquivos = fs.readdirSync(path.join(RAIZ, 'tests'))
  .filter((n) => n.endsWith('.teste.mjs') && n.includes(filtro)).sort();

let falhas = 0;
let total = 0;

for (const nome of arquivos) {
  console.log(`\n== ${nome}`);
  let servidor = await subirServidor();
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'vistoria-teste-'));
  const browser = await puppeteer.launch({
    executablePath: executavel, headless: true, userDataDir: perfil, args: ['--no-first-run'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
  const errosConsole = [];
  page.on('pageerror', (e) => errosConsole.push(e.message));
  page.on('console', async (m) => {
    if (m.type() !== 'error') return;
    // mostra a mensagem real do erro (e não "JSHandle@error")
    const partes = await Promise.all(m.args().map((a) => a
      .evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message}` : String(v)))
      .catch(() => m.text())));
    errosConsole.push(partes.join(' ') || m.text());
  });
  page.on('dialog', (d) => d.accept());

  const ok = (condicao, mensagem) => {
    total += 1;
    if (!condicao) falhas += 1;
    console.log(`${condicao ? 'OK   ' : 'FALHA'} ${mensagem}`);
  };
  const ctx = {
    page, browser, base: BASE, ok,
    fixture: (n) => path.join(RAIZ, 'tests', 'fixtures', n),
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
    pararServidor: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); servidor = null; }),
    errosConsole,
  };

  try {
    const modulo = await import(pathToFileURL(path.join(RAIZ, 'tests', nome)).href);
    await modulo.default(ctx);
  } catch (erro) {
    ok(false, `erro inesperado: ${erro.stack || erro.message}`);
  }
  // erros esperados de rede (servidor desligado de propósito) não contam
  // e o aviso do teste de "arquivo que não é imagem" também é esperado
  const erros = errosConsole.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|Não foi possível ler essa imagem/.test(e));
  ok(erros.length === 0, 'sem erros no console' + (erros.length ? `: ${erros.join(' | ')}` : ''));

  await browser.close();
  if (servidor) await ctx.pararServidor();
  fs.rmSync(perfil, { recursive: true, force: true });
}

console.log(`\n${total - falhas} de ${total} verificações OK${falhas ? ` — ${falhas} FALHARAM` : ''}`);
process.exit(falhas ? 1 : 0);
