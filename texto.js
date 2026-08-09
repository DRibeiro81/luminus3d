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
  // `inicioCorpo` é onde o corpo começa: com contorno, o relevo das letras fica
  // na frente dele e o canal não pode invadir esse relevo.
  const base = op.inicioCorpo || 0;
  const minima = base + op.parede + r + alcanceTras + op.parede;
  const furoY = Math.max(base + op.parede + r, op.profundidade - op.parede - alcanceTras);
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
export function encolher(m) {
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

/** Põe `n` células de folga em volta, pra o contorno ter pra onde crescer. */
export function moldar(m, n) {
  const C = m[0].length + 2 * n;
  const vazia = () => new Uint8Array(C);
  const saida = [];
  for (let k = 0; k < n; k++) saida.push(vazia());
  for (const linha of m) {
    const nova = vazia();
    nova.set(linha, n);
    saida.push(nova);
  }
  for (let k = 0; k < n; k++) saida.push(vazia());
  return saida;
}

/** Engorda a palavra em `n` células, pra virar a chapa de fundo colorida. */
export function engordar(m, n) {
  let atual = m;
  for (let k = 0; k < n; k++) {
    const L = atual.length, C = atual[0].length;
    const saida = [];
    // Alterna cruz e quadrado: só cruz engorda em losango, só quadrado engorda
    // em quadrado. Alternando, a borda sai redonda, que é o que o olho espera
    // em volta de uma letra.
    const diagonal = k % 2 === 1;
    for (let j = 0; j < L; j++) {
      const linha = new Uint8Array(C);
      for (let i = 0; i < C; i++) {
        if (atual[j][i]) { linha[i] = 1; continue; }
        const perto = (dj, di) => {
          const y = j + dj, x = i + di;
          return y >= 0 && y < L && x >= 0 && x < C && atual[y][x];
        };
        if (perto(-1, 0) || perto(1, 0) || perto(0, -1) || perto(0, 1)) linha[i] = 1;
        else if (diagonal && (perto(-1, -1) || perto(-1, 1) || perto(1, -1) || perto(1, 1))) linha[i] = 1;
      }
      saida.push(linha);
    }
    atual = saida;
  }
  return atual;
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

/** Junta trechos que se encostam ou se sobrepõem. */
export function unir(A) {
  const ordem = [...A].sort((a, b) => a[0] - b[0]);
  const saida = [];
  for (const [a, b] of ordem) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && a <= ultimo[1] + 1e-9) ultimo[1] = Math.max(ultimo[1], b);
    else saida.push([a, b]);
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
  const e = op.mmPorPx, D = op.profundidade;

  // Contorno: as letras ficam em relevo, numa cor, sobre um corpo engordado em
  // outra. Imprimindo deitado com a frente na mesa, o corpo é tudo que vem
  // DEPOIS da altura da letra — ou seja, uma troca de filamento só, cedo.
  const temContorno = op.contorno > 0 && op.alturaLetra > 0;
  const yLetra = temContorno ? Math.min(op.alturaLetra, D - 1) : 0;
  // Com contorno, a peça cresce pra fora das letras — sem folga em volta ele
  // sairia cortado rente na borda esquerda, direita, em cima e embaixo.
  const folga = temContorno ? Math.max(1, Math.round(op.contorno / e)) : 0;
  const letras = folga ? moldar(mascara, folga) : mascara;
  const mascaraCorpo = temContorno ? engordar(letras, folga) : letras;

  // O canal do lápis mora no corpo, nunca no relevo das letras.
  const L = letras.length, C = letras[0].length;
  const cfg = { ...op, profundidade: D, inicioCorpo: yLetra };
  const { furoY } = encaixeDoCanal(cfg);
  cfg.furoY = furoY;

  const trechos = (m, j) => corridas(m[j]).map(([c0, c1]) => {
    // a cobertura vem da máscara original: com folga, as colunas andam `folga`
    const cob = m === letras && cobertura ? cobertura[j] : null;
    const [f0, f1] = bordasFinas(c0, c1, cob && { length: c1 + 1,
      [c0]: cob[c0 - folga] === undefined ? 1 : cob[c0 - folga],
      [c1 - 1]: cob[c1 - 1 - folga] === undefined ? 1 : cob[c1 - 1 - folga] });
    return [f0 * e, f1 * e];
  });

  // Cada faixa de altura vira uma pilha de BLOCOS: cada um com sua fatia de Y e
  // seu recorte em X. Sem contorno é um bloco (ou dois, com o canal no meio);
  // com contorno, o relevo da letra e o corpo têm recortes diferentes.
  const faixas = [];
  for (let k = 0; k < L; k++) {
    const j = L - 1 - k;
    const z0 = k * e, z1 = z0 + e;
    const xsLetra = trechos(letras, j);
    const xsCorpo = temContorno ? trechos(mascaraCorpo, j) : xsLetra;
    const blocos = [];
    if (temContorno && xsLetra.length) blocos.push({ y0: 0, y1: yLetra, xs: xsLetra });
    if (xsCorpo.length) {
      const canal = canalEmY(cfg, Math.max(z0, Math.min(z1, op.furoZ)) - op.furoZ);
      if (!canal) blocos.push({ y0: yLetra, y1: D, xs: xsCorpo });
      else {
        const a = Math.min(D, Math.max(yLetra, canal[0]));
        const b = Math.min(D, Math.max(yLetra, canal[1]));
        if (a - yLetra > 1e-9) blocos.push({ y0: yLetra, y1: a, xs: xsCorpo });
        if (D - b > 1e-9) blocos.push({ y0: b, y1: D, xs: xsCorpo });
      }
    }
    faixas.push({ z0, z1, blocos });
  }

  const tris = [];
  // 1 onde a peça é da cor da letra, 0 onde é do corpo. Serve pra tela pintar as
  // duas cores; a malha em si é uma peça só, como sai da impressora.
  const marcas = [];
  const daLetra = (y0, y1) => (temContorno && y1 <= yLetra + 1e-9 ? 1 : 0);
  const guardar = (q, cor) => {
    tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
    for (let i = 0; i < 6; i++) marcas.push(cor);
  };
  // A faixa em Y pode atravessar a fronteira entre o relevo e o corpo; aí ela
  // vira dois quadriláteros, um de cada cor.
  const emZ = (x0, x1, y0, y1, z, pra) => {
    const pedaco = (a, b, cor) => {
      if (b - a < 1e-9) return;
      const q = [[x0, a, z], [x1, a, z], [x1, b, z], [x0, b, z]];
      if (pra < 0) q.reverse();
      guardar(q, cor);
    };
    if (temContorno && y0 < yLetra && y1 > yLetra) {
      pedaco(y0, yLetra, 1); pedaco(yLetra, y1, 0);
    } else pedaco(y0, y1, daLetra(y0, y1));
  };
  const emX = (y0, y1, z0, z1, x, pra) => {
    const q = [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]];
    if (pra < 0) q.reverse();
    guardar(q, daLetra(y0, y1));
  };
  // A cor vem do BLOCO, não da altura: a face da frente do corpo mora
  // exatamente em yLetra, e por altura ela seria confundida com o relevo.
  const emY = (x0, x1, z0, z1, y, pra, cor) => {
    const q = [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]];
    if (pra < 0) q.reverse();
    guardar(q, cor);
  };

  // Paredes laterais e as faces viradas pra frente e pra trás de cada bloco.
  for (const f of faixas) {
    const b = f.blocos;
    for (let i = 0; i < b.length; i++) {
      for (const [x0, x1] of b[i].xs) {
        emX(b[i].y0, b[i].y1, f.z0, f.z1, x0, -1);
        emX(b[i].y0, b[i].y1, f.z0, f.z1, x1, +1);
      }
      // encostado no vizinho? só sobra à mostra o que o vizinho não cobre
      const abaixo = i > 0 && Math.abs(b[i - 1].y1 - b[i].y0) < 1e-9 ? b[i - 1].xs : [];
      const acima = i + 1 < b.length && Math.abs(b[i + 1].y0 - b[i].y1) < 1e-9 ? b[i + 1].xs : [];
      const cor = daLetra(b[i].y0, b[i].y1);
      for (const [x0, x1] of diferenca(b[i].xs, abaixo)) emY(x0, x1, f.z0, f.z1, b[i].y0, -1, cor);
      for (const [x0, x1] of diferenca(b[i].xs, acima)) emY(x0, x1, f.z0, f.z1, b[i].y1, +1, cor);
    }
  }

  // Piso e teto de cada faixa. Como o recorte em X muda de bloco pra bloco, a
  // comparação com a faixa vizinha é feita por trecho de X: em cada trecho,
  // pergunta-se onde há material em Y dos dois lados e fecha-se a diferença.
  const ondeTemY = (f, x) => unir(f.blocos.filter(
    (b) => b.xs.some(([a, c]) => x > a && x < c)).map((b) => [b.y0, b.y1]));

  for (let k = 0; k <= L; k++) {
    const baixo = k > 0 ? faixas[k - 1] : { blocos: [] };
    const cima = k < L ? faixas[k] : { blocos: [] };
    if (!baixo.blocos.length && !cima.blocos.length) continue;
    const z = k > 0 ? baixo.z1 : cima.z0;

    const cortes = new Set();
    for (const f of [baixo, cima]) for (const b of f.blocos) for (const [a, c] of b.xs) {
      cortes.add(a); cortes.add(c);
    }
    const lista = [...cortes].sort((a, b) => a - b);
    for (let i = 0; i + 1 < lista.length; i++) {
      const x0 = lista[i], x1 = lista[i + 1];
      if (x1 - x0 < 1e-9) continue;
      const meio = (x0 + x1) / 2;
      const yb = ondeTemY(baixo, meio), yc = ondeTemY(cima, meio);
      for (const [a, c] of diferenca(yb, yc)) emZ(x0, x1, a, c, z, +1);
      for (const [a, c] of diferenca(yc, yb)) emZ(x0, x1, a, c, z, -1);
    }
  }

  let vol = 0;
  for (const f of faixas) for (const b of f.blocos) {
    let lx = 0;
    for (const [a, c] of b.xs) lx += c - a;
    vol += lx * (b.y1 - b.y0) * e;
  }

  // Quanto do comprimento do lápis fica abraçado pela peça. É o que segura: a
  // letra "A" abre as pernas bem na altura do canal e o lápis passa livre ali.
  const jCentro = Math.min(L - 1, Math.max(0, Math.round(L - 1 - op.furoZ / e)));
  let cobertos = 0;
  for (let i = 0; i < C; i++) if (mascaraCorpo[jCentro][i]) cobertos++;

  return {
    tris,
    marcas: new Float32Array(marcas),
    largura: mascaraCorpo[0].length * e,
    altura: L * e,
    profundidade: D,
    furoY,
    // altura em que trocar o filamento, medida da mesa (a frente encosta nela)
    trocaDeCor: temContorno ? yLetra : 0,
    mascaraCorpo,
    aperto: cobertos / mascaraCorpo[0].length,
    volume: vol / 1000,
  };
}
