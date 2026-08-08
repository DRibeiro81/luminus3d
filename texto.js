// Nome no lápis: a palavra vira um bloco extrudado com um canal atravessando,
// por onde o lápis entra. Sem DOM — dá pra rodar no Node (é o que o teste faz).
//
// A palavra chega aqui já rasterizada, como uma máscara de 0 e 1. Desenhar
// fonte é trabalho do navegador; medir traço fino, achar letra solta e montar a
// malha é trabalho daqui.
//
// A peça nasce deitada do jeito que deve ser impressa: X ao longo da palavra
// (e do lápis), Z na altura das letras, Y na profundidade. A FRENTE das letras
// fica em Y=0, que é a face que encosta na mesa da impressora.

import { fechar, anexar, volume } from './geometria.js';

/** Caixa fechada, com as normais pra fora. */
function caixa(saida, x0, y0, z0, x1, y1, z1) {
  const p = [];
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const P = (i, z) => [c[i][0], c[i][1], z];
  p.push([P(0, z1), P(1, z1), P(2, z1)], [P(0, z1), P(2, z1), P(3, z1)]);
  p.push([P(0, z0), P(2, z0), P(1, z0)], [P(0, z0), P(3, z0), P(2, z0)]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    p.push([P(i, z0), P(j, z0), P(j, z1)], [P(i, z0), P(j, z1), P(i, z1)]);
  }
  anexar(saida, fechar(p));
}

/** Trechos seguidos de material em cada linha da máscara: [[c0, c1], ...]. */
export function corridas(linha) {
  const saida = [];
  let ini = -1;
  for (let i = 0; i < linha.length; i++) {
    if (linha[i]) { if (ini < 0) ini = i; }
    else if (ini >= 0) { saida.push([ini, i]); ini = -1; }
  }
  if (ini >= 0) saida.push([ini, linha.length]);
  return saida;
}

/**
 * Onde a borda REALMENTE cai dentro da célula, usando o quanto ela está pintada.
 *
 * A máscara é sim ou não: a célula da ponta ou entra inteira ou fica de fora, e
 * a lateral da letra vira escada de meio décimo. A cobertura (0 a 1, que é a
 * suavização do desenho) diz a fração pintada — célula 40% cheia põe a borda a
 * 40% dela. Traço quase reto sai reto, sem precisar de malha mais fina.
 */
export function bordasFinas(a, b, cob) {
  if (!cob) return [a, b];
  const e = a + (1 - Math.min(1, cob[a]));
  const d = (b - 1) + Math.min(1, cob[b - 1]);
  // piso de um quinto de célula: fatia mais fina que isso não vira material,
  // só uma caixa quase plana pra o fatiador tropeçar
  return d - e > 0.2 ? [e, d] : [a, b];
}

/**
 * Onde o canal do lápis começa e termina em Y, na altura `dz` acima ou abaixo
 * do centro dele. Devolve null onde o canal não alcança.
 *
 * Com `gota`, o teto do canal deixa de ser redondo e vira duas retas a 45°.
 * A peça imprime com a frente das letras na mesa, então quem cresce é o Y — e
 * o topo de um furo redondo nessa direção fica pendurado no ar e cede. A gota
 * corta o problema: nenhuma parede passa dos 45°.
 */
export function canalEmY(op, dz) {
  const r = op.furo / 2;
  const a = Math.abs(dz);
  if (a >= r) return null;
  const c = Math.sqrt(r * r - dz * dz);
  const reto = a <= r / Math.SQRT2;                 // onde a reta de 45° manda
  return [
    op.furoY - c,
    op.gota && reto ? op.furoY + r * Math.SQRT2 - a : op.furoY + c,
  ];
}

/**
 * Profundidade mínima pra caber o canal com parede dos dois lados, e a posição
 * do centro dele. O bico da gota avança pra trás, então é ele que manda no
 * fundo — encostar o canal na frente das letras é o que dá espaço.
 */
export function encaixeDoCanal(op) {
  const r = op.furo / 2;
  const alcanceTras = op.gota ? r * Math.SQRT2 : r;
  const minima = op.parede + r + alcanceTras + op.parede;
  const furoY = Math.max(op.parede + r, op.profundidade - op.parede - alcanceTras);
  return { minima, furoY };
}

/** Quantos pedaços soltos a palavra tem. Mais de um e a peça sai em pedaços. */
export function pedacos(mascara) {
  const L = mascara.length, C = mascara[0].length;
  const visto = new Uint8Array(L * C);
  let n = 0;
  const pilha = [];
  for (let j = 0; j < L; j++) for (let i = 0; i < C; i++) {
    if (!mascara[j][i] || visto[j * C + i]) continue;
    n++; visto[j * C + i] = 1; pilha.length = 0; pilha.push(j * C + i);
    while (pilha.length) {
      const k = pilha.pop(), y = (k / C) | 0, x = k % C;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= C || ny >= L) continue;
        const kk = ny * C + nx;
        if (mascara[ny][nx] && !visto[kk]) { visto[kk] = 1; pilha.push(kk); }
      }
    }
  }
  return n;
}

/** Come uma casca de material em volta de tudo. */
function encolher(m) {
  const L = m.length, C = m[0].length;
  const saida = [];
  for (let j = 0; j < L; j++) {
    const linha = new Uint8Array(C);
    for (let i = 0; i < C; i++) {
      if (!m[j][i]) continue;
      if (j === 0 || j === L - 1 || i === 0 || i === C - 1) continue;
      if (m[j - 1][i] && m[j + 1][i] && m[j][i - 1] && m[j][i + 1]) linha[i] = 1;
    }
    saida.push(linha);
  }
  return saida;
}

/**
 * Traço mais fino que ainda SEGURA a peça, em mm.
 *
 * Medir a menor corrida de pixels não servia: a borda inclinada de qualquer
 * letra tem sempre uma escadinha de um pixel, e o número saía no piso da malha
 * toda vez. Aqui a palavra é encolhida casca por casca; enquanto o número de
 * pedaços não muda, o que sumiu era enfeite de borda. Quando muda, achamos o
 * ponto onde a letra realmente arrebenta — e a largura ali é o dobro do que
 * deu pra comer.
 */
export function tracoMaisFino(mascara, mmPorPx, limite = 8) {
  const inteiro = pedacos(mascara);
  let m = mascara, k = 0;
  while (k < limite) {
    const menor = encolher(m);
    let temTinta = false;
    for (const linha of menor) { for (const v of linha) if (v) { temTinta = true; break; } if (temTinta) break; }
    if (!temTinta || pedacos(menor) !== inteiro) break;
    m = menor; k++;
  }
  return (2 * k + 1) * mmPorPx;
}

/* ================================================================
   Intervalos: a peça inteira é descrita por trechos numa reta
   ================================================================ */

/** Onde duas listas de trechos se sobrepõem. Ambas ordenadas e sem encostar. */
export function intersecao(A, B) {
  const saida = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const a = Math.max(A[i][0], B[j][0]), b = Math.min(A[i][1], B[j][1]);
    if (b - a > 1e-9) saida.push([a, b]);
    if (A[i][1] < B[j][1]) i++; else j++;
  }
  return saida;
}

/** O que está em A e não está em B. */
export function diferenca(A, B) {
  const saida = [];
  for (const [a0, a1] of A) {
    let atual = a0;
    for (const [b0, b1] of B) {
      if (b1 <= atual) continue;
      if (b0 >= a1) break;
      if (b0 > atual) saida.push([atual, Math.min(b0, a1)]);
      atual = Math.max(atual, b1);
      if (atual >= a1) break;
    }
    if (a1 - atual > 1e-9) saida.push([atual, a1]);
  }
  return saida;
}

/**
 * Monta a peça como uma CASCA FECHADA, não como pilha de caixas.
 *
 * A primeira versão empilhava uma caixa por faixa de pixel, sobrepostas pra
 * emendar. Funcionava pro fatiador e era horrível de olhar: as faces da frente
 * ficavam coplanares e sobrepostas, e no 3D a peça saía listrada — uma listra
 * por faixa. Agora cada face só existe onde o vizinho NÃO tem material, então a
 * frente da peça é uma superfície só, sem emenda e sem repetição.
 *
 * `mascara[linha][coluna]`, linha 0 no topo. `op`:
 *   mmPorPx, profundidade, parede, furo (já com folga), furoZ, gota.
 * `cobertura` é opcional (ver `bordasFinas`).
 */
export function nomeNoLapis(op, mascara, cobertura) {
  const L = mascara.length, C = mascara[0].length;
  const e = op.mmPorPx, D = op.profundidade;
  const { furoY } = encaixeDoCanal(op);
  const cfg = { ...op, furoY };

  // Cada faixa de altura vira: trechos com material em X, e onde há material em
  // Y (um pedaço só, ou dois quando o canal do lápis passa no meio).
  const faixas = [];
  for (let k = 0; k < L; k++) {
    const j = L - 1 - k;                       // linha 0 da máscara é o topo
    const z0 = k * e, z1 = z0 + e;
    const xs = corridas(mascara[j]).map(([c0, c1]) => {
      const [f0, f1] = bordasFinas(c0, c1, cobertura && cobertura[j]);
      return [f0 * e, f1 * e];
    });
    // dentro da faixa, o Z mais perto do centro do canal: assim o furo nunca
    // sai menor do que o lápis precisa
    const canal = canalEmY(cfg, Math.max(z0, Math.min(z1, op.furoZ)) - op.furoZ);
    let ys;
    if (!canal) ys = [[0, D]];
    else {
      const a = Math.min(D, Math.max(0, canal[0]));
      const b = Math.min(D, Math.max(0, canal[1]));
      ys = [];
      if (a > 1e-9) ys.push([0, a]);
      if (D - b > 1e-9) ys.push([b, D]);
    }
    faixas.push({ z0, z1, xs, ys });
  }

  const tris = [];
  const vazia = { xs: [], ys: [] };
  // Um quadrilátero por plano, com o giro que põe a normal pro lado certo.
  const emZ = (x0, x1, y0, y1, z, pra) => {
    const q = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
    if (pra < 0) q.reverse();
    tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
  };
  const emX = (y0, y1, z0, z1, x, pra) => {
    const q = [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]];
    if (pra < 0) q.reverse();
    tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
  };
  const emY = (x0, x1, z0, z1, y, pra) => {
    const q = [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]];
    if (pra < 0) q.reverse();
    tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
  };

  for (let k = 0; k < L; k++) {
    const f = faixas[k];
    if (!f.xs.length) continue;
    // paredes laterais e as faces de frente, de trás e do canal
    for (const [x0, x1] of f.xs) {
      for (const [y0, y1] of f.ys) {
        emX(y0, y1, f.z0, f.z1, x0, -1);
        emX(y0, y1, f.z0, f.z1, x1, +1);
        emY(x0, x1, f.z0, f.z1, y0, -1);
        emY(x0, x1, f.z0, f.z1, y1, +1);
      }
    }
  }

  // Piso e teto de cada faixa: só onde a faixa vizinha NÃO acompanha. É aqui
  // que a peça fecha quando a letra muda de largura ou o canal muda de altura.
  for (let k = 0; k <= L; k++) {
    const baixo = k > 0 ? faixas[k - 1] : vazia;
    const cima = k < L ? faixas[k] : vazia;
    if (!baixo.xs.length && !cima.xs.length) continue;
    const z = k > 0 ? baixo.z1 : cima.z0;

    for (const [x0, x1] of intersecao(baixo.xs, cima.xs)) {
      for (const [y0, y1] of diferenca(baixo.ys, cima.ys)) emZ(x0, x1, y0, y1, z, +1);
      for (const [y0, y1] of diferenca(cima.ys, baixo.ys)) emZ(x0, x1, y0, y1, z, -1);
    }
    for (const [x0, x1] of diferenca(baixo.xs, cima.xs))
      for (const [y0, y1] of baixo.ys) emZ(x0, x1, y0, y1, z, +1);
    for (const [x0, x1] of diferenca(cima.xs, baixo.xs))
      for (const [y0, y1] of cima.ys) emZ(x0, x1, y0, y1, z, -1);
  }

  let vol = 0;
  for (const f of faixas) {
    let lx = 0, ly = 0;
    for (const [a, b] of f.xs) lx += b - a;
    for (const [a, b] of f.ys) ly += b - a;
    vol += lx * ly * e;
  }

  // Quanto do comprimento do lápis fica abraçado pela peça. É o que segura: a
  // letra "A" abre as pernas bem na altura do canal e o lápis passa livre ali.
  const jCentro = Math.min(L - 1, Math.max(0, Math.round(L - 1 - op.furoZ / e)));
  let cobertos = 0;
  for (let i = 0; i < C; i++) if (mascara[jCentro][i]) cobertos++;

  return {
    tris,
    largura: C * e,
    altura: L * e,
    profundidade: D,
    furoY,
    aperto: cobertos / C,
    volume: vol / 1000,
  };
}
