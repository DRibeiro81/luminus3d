// Desenhar em 3D — o miolo do modelador de desenho livre.
//
// A ideia que faz isso caber no que já existe: as formas ficam VETORIAIS, pra
// continuarem editáveis, e só na hora de virar peça viram desenho numa grade.
// Aí o material se junta, o furo é subtraído, o contorno é traçado e extrudado.
//
// Por que passar por grade em vez de fazer booleana de polígono: booleana de
// polígono robusta é biblioteca inteira, e a grade já está pronta e testada
// aqui — contorno por marching squares, suavização, triangulação com furo e
// casca fechada vieram do cortador de biscoito, com suíte em cima.

import { contornos, borrar, suavizarLinha, decimar, agruparFuros, prisma,
         preencherPoligono } from './cortador.js';
import { fechar, anexar, volume } from './geometria.js';

/** '#4ec9b0' vira [0.31, 0.79, 0.69]. */
export function corParaRgb(hex) {
  const n = parseInt(String(hex || '#c9a05a').replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Grade vazia de C x L células. */
function grade(C, L) {
  const m = [];
  for (let j = 0; j < L; j++) m.push(new Uint8Array(C));
  return m;
}

const ou = (A, B) => { for (let j = 0; j < A.length; j++)
  for (let i = 0; i < A[0].length; i++) if (B[j][i]) A[j][i] = 1; return A; };
const menos = (A, B) => { for (let j = 0; j < A.length; j++)
  for (let i = 0; i < A[0].length; i++) if (B[j][i]) A[j][i] = 0; return A; };

/**
 * Carimba um disco de raio `r` em cada passo do caminho.
 *
 * É como o traço de caneta vira área. Andar de meio raio em meio raio é o que
 * garante linha contínua: com passo maior que o raio a linha sai pontilhada.
 */
function riscar(m, pontos, r) {
  const C = m[0].length, L = m.length;
  const disco = (cx, cy) => {
    const i0 = Math.max(0, Math.ceil(cx - r)), i1 = Math.min(C - 1, Math.floor(cx + r));
    const j0 = Math.max(0, Math.ceil(cy - r)), j1 = Math.min(L - 1, Math.floor(cy + r));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
      if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) m[j][i] = 1;
  };
  for (let k = 0; k + 1 < pontos.length; k++) {
    const [x0, y0] = pontos[k], [x1, y1] = pontos[k + 1];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / Math.max(0.5, r * 0.5)));
    for (let t = 0; t <= n; t++) disco(x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n);
  }
  if (pontos.length === 1) disco(pontos[0][0], pontos[0][1]);
  return m;
}

/** Espelha os pontos em torno de uma vertical. */
export function espelharPontos(pontos, eixoX) {
  return pontos.map(([x, y]) => [2 * eixoX - x, y]);
}

export function retangulo(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
}

export function elipse(cx, cy, rx, ry, lados = 64) {
  const p = [];
  for (let i = 0; i <= lados; i++) {
    const a = (i / lados) * Math.PI * 2;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}

export function estrela(cx, cy, rFora, rDentro, pontas = 5) {
  const p = [];
  for (let i = 0; i <= pontas * 2; i++) {
    const a = (i / (pontas * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? rDentro : rFora;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
}

/** Arco de três pontos: começo, um ponto por onde passa, e fim. */
export function arco(a, meio, b, lados = 32) {
  const d = 2 * (a[0] * (meio[1] - b[1]) + meio[0] * (b[1] - a[1]) + b[0] * (a[1] - meio[1]));
  if (Math.abs(d) < 1e-9) return [a, b];             // os três em linha reta
  const ua = a[0] ** 2 + a[1] ** 2, um = meio[0] ** 2 + meio[1] ** 2, ub = b[0] ** 2 + b[1] ** 2;
  const cx = (ua * (meio[1] - b[1]) + um * (b[1] - a[1]) + ub * (a[1] - meio[1])) / d;
  const cy = (ua * (b[0] - meio[0]) + um * (a[0] - b[0]) + ub * (meio[0] - a[0])) / d;
  const r = Math.hypot(a[0] - cx, a[1] - cy);
  const ang = (p) => Math.atan2(p[1] - cy, p[0] - cx);
  let a0 = ang(a), a1 = ang(b);
  const am = ang(meio);
  // o arco tem que passar pelo ponto do meio: se não passa, vai pelo outro lado
  const entre = (x, i, f) => { const g = (v) => (v - i + Math.PI * 4) % (Math.PI * 2);
    return g(x) <= g(f); };
  if (!entre(am, a0, a1)) { const t = a0; a0 = a1; a1 = t; }
  let volta = (a1 - a0 + Math.PI * 4) % (Math.PI * 2);
  const p = [];
  for (let i = 0; i <= lados; i++) {
    const t = a0 + volta * (i / lados);
    p.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  if (Math.hypot(p[0][0] - a[0], p[0][1] - a[1]) > 1e-6) p.reverse();
  return p;
}

/**
 * Desenha uma forma na grade. Tudo em milímetros; a grade converte.
 *
 * Forma fechada vira área cheia; forma aberta vira uma faixa da largura do
 * traço. É o que deixa o mesmo "rabisco" servir pra contorno e pra peça.
 */
export function desenharForma(m, forma, op) {
  const e = op.mmPorCelula, x0 = op.x0, y0 = op.y0;
  const paraGrade = (p) => p.map(([x, y]) => [(x - x0) / e, (y - y0) / e]);
  const listas = [[forma.pontos, false]];
  if (forma.espelho != null) listas.push([espelharPontos(forma.pontos, forma.espelho), true]);
  for (const [bruta, espelhado] of listas) {
    if (bruta.length < 2) { if (bruta.length === 1) riscar(m, paraGrade(bruta), Math.max(1, forma.traco / 2 / e)); continue; }
    const p = paraGrade(bruta);
    if (forma.fechado) {
      const fechada = [...p, p[0]];
      // Sem carimbar a borda: a célula é fina o bastante pra nada sumir, e
      // carimbar engordava a forma na grossura do traço — o furo saía um
      // milímetro maior do que o desenhado na tela.
      const cheio = preencherPoligono(fechada, m[0].length, m.length);
      // furo da própria forma: o miolo do "o", o vazado de um desenho
      if (forma.furosInternos) {
        for (const bruto of forma.furosInternos) {
          const q = paraGrade(espelhado ? espelharPontos(bruto, forma.espelho) : bruto);
          menos(cheio, preencherPoligono([...q, q[0]], m[0].length, m.length));
        }
      }
      ou(m, cheio);
    } else {
      riscar(m, p, Math.max(1, forma.traco / 2 / e));
    }
  }
  return m;
}

/** Caixa que cabe todas as formas, com uma folga. */
export function limites(formas, folga = 4) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of formas) {
    const listas = [f.pontos];
    if (f.espelho != null) listas.push(espelharPontos(f.pontos, f.espelho));
    for (const l of listas) for (const [x, y] of l) {
      // A grossura conta MESMO em forma fechada: ela também ganha traço na
      // borda, e sem isso o desenho passava da grade e era cortado nela — a
      // peça saía em pedaços.
      const r = f.traco / 2 + 0.001;
      if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r;
      if (y - r < y0) y0 = y - r; if (y + r > y1) y1 = y + r;
    }
  }
  if (!isFinite(x0)) return null;
  return { x0: x0 - folga, y0: y0 - folga, x1: x1 + folga, y1: y1 + folga };
}

/**
 * Monta a peça.
 *
 * Cada faixa de altura vira um sólido próprio. Furo corta toda faixa de material
 * que ele atravessa — é o que faz um furo passante ser um furo só, e não um por
 * peça.
 */
export function montar(formas, op) {
  const cheias = formas.filter((f) => !f.furo && f.altura > 0);
  const furos = formas.filter((f) => f.furo);
  if (!cheias.length) return { tris: [], volume: 0, pecas: 0, vazio: true };

  // folga só o suficiente pra o contorno não encostar na borda da grade; a
  // medida da peça sai da malha, não daqui
  const cx = limites(formas, Math.max(1, op.mmPorCelula * 4));
  const e = op.mmPorCelula;
  const C = Math.max(8, Math.ceil((cx.x1 - cx.x0) / e));
  const L = Math.max(8, Math.ceil((cx.y1 - cx.y0) / e));
  const gOp = { mmPorCelula: e, x0: cx.x0, y0: cx.y0 };

  // Agrupa por faixa de altura E por cor. A cor entra na chave porque cada
  // sólido sai de uma cor só: é o que permite mostrar a peça colorida no 3D e,
  // na impressão, saber onde trocar de filamento.
  const faixas = new Map();
  for (const f of cheias) {
    const k = `${f.base}|${f.altura}|${f.cor || ''}`;
    if (!faixas.has(k)) faixas.set(k, { base: f.base, altura: f.altura, cor: f.cor, formas: [] });
    faixas.get(k).formas.push(f);
  }

  const tris = [], cores = [];
  let pecas = 0;
  for (const faixa of faixas.values()) {
    const m = grade(C, L);
    for (const f of faixa.formas) desenharForma(m, f, gOp);
    const z0 = faixa.base, z1 = faixa.base + faixa.altura;
    for (const f of furos) {
      const fz0 = f.base, fz1 = f.base + (f.altura > 0 ? f.altura : 1e6);
      if (fz1 <= z0 + 1e-9 || fz0 >= z1 - 1e-9) continue;    // não se cruzam em altura
      menos(m, desenharForma(grade(C, L), f, gOp));
    }
    // o borrão dá precisão abaixo da célula; sem ele a peça sai em escada
    const laços = contornos(borrar(m, 1))
      .map((l) => decimar(suavizarLinha(l, 2), 0.6))
      .filter((l) => l.length > 8);
    const rgb = corParaRgb(faixa.cor);
    for (const g of agruparFuros(laços)) {
      const t = [];
      prisma(t, g.externo, e, z0, z1, g.furos);
      const fechados = fechar(t);
      anexar(tris, fechados);
      for (let k = 0; k < fechados.length; k++) cores.push(rgb);
      pecas++;
    }
  }
  // volta pro lugar: a grade nasce na origem da caixa
  const saida = tris.map((t) => t.map(([x, y, z]) => [x + cx.x0, y + cx.y0, z]));
  // medida vinda da MALHA. Tirar da caixa das formas contava a folga da grade
  // junto, e a peça aparecia 8 mm maior do que o pedido.
  let x0 = Infinity, y0 = Infinity, z0m = Infinity, x1 = -Infinity, y1 = -Infinity, z1m = -Infinity;
  for (const t of saida) for (const [x, y, z] of t) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0m) z0m = z; if (z > z1m) z1m = z;
  }
  return { tris: saida, cores, volume: volume(saida) / 1000, pecas,
           largura: x1 - x0, profundidade: y1 - y0, altura: z1m - z0m };
}
