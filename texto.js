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

/**
 * Monta a peça.
 *
 * `mascara[linha][coluna]`, linha 0 no topo. `op`:
 *   mmPorPx, profundidade, parede, furo (já com folga), furoZ, gota.
 *
 * `cobertura` é opcional: a mesma grade, mas com o quanto cada célula está
 * pintada, pra a borda lateral não sair em degrau (ver `bordasFinas`).
 *
 * Uma caixa por trecho de material, cortada em dois onde o canal passa. As
 * caixas se SOBREPÕEM meio décimo em Z de propósito: encostadas, dividiriam
 * face e a malha deixaria de ser sólida pro fatiador.
 */
export function nomeNoLapis(op, mascara, cobertura) {
  const L = mascara.length, C = mascara[0].length;
  const e = op.mmPorPx;
  const D = op.profundidade;
  const { furoY } = encaixeDoCanal(op);
  const cfg = { ...op, furoY };
  // Sobreposição entre faixas vizinhas. 0,3 e não 0,5: com meia célula, a caixa
  // de uma linha terminava EXATAMENTE onde a de duas linhas acima começava, os
  // vértices viravam o mesmo ponto e a malha rachava em triângulos soltos.
  // Sobrepor sólido é seguro; encostar ponto a ponto nunca é.
  const ov = e * 0.3;

  const tris = [];

  for (let j = 0; j < L; j++) {
    const linhas = corridas(mascara[j]);
    if (!linhas.length) continue;

    // altura da faixa: linha 0 é o topo da peça
    const z0 = (L - 1 - j) * e, z1 = z0 + e;
    // dentro da faixa, o Z mais perto do centro do canal — assim o furo nunca
    // sai menor do que o lápis precisa
    const zc = op.furoZ;
    const perto = Math.max(z0, Math.min(z1, zc));
    const canal = canalEmY(cfg, perto - zc);

    for (const [c0, c1] of linhas) {
      const [f0, f1] = bordasFinas(c0, c1, cobertura && cobertura[j]);
      const x0 = f0 * e, x1 = f1 * e;
      if (!canal) { caixa(tris, x0, 0, z0 - ov, x1, D, z1 + ov); continue; }
      const [ya, yb] = canal;
      if (ya > 0.001) caixa(tris, x0, 0, z0 - ov, x1, Math.min(ya, D), z1 + ov);
      if (yb < D - 0.001) caixa(tris, x0, Math.max(yb, 0), z0 - ov, x1, D, z1 + ov);
    }
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
    caixas: tris.length / 12,
    aperto: cobertos / C,
    volume: volume(tris) / 1000,
  };
}
