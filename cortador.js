// Cortador de biscoito a partir de uma imagem. Sem DOM: roda no Node, é o que
// o teste faz.
//
// A ideia que dispensa qualquer matemática de contorno: a lâmina é a silhueta
// ENGORDADA menos a silhueta ENCOLHIDA. Sobra um anel de espessura constante
// seguindo a borda da figura, e as duas operações já existem no módulo do
// texto. Não precisa traçar polígono, não precisa calcular deslocamento de
// curva, não precisa de operação booleana.
//
// A peça nasce do jeito que imprime: aba na mesa (z=0), lâmina subindo, fio de
// corte no topo. Assim a primeira camada é larga e gruda, e a lâmina sobe como
// parede vertical, sem apoio.

import { engordar, encolher, pedacos, corridas } from './texto.js';
import { anexar, volume } from './geometria.js';

const vazia = (L, C) => Array.from({ length: L }, () => new Uint8Array(C));

/** Só o maior pedaço: tira sujeira de fundo e sombra solta. */
export function maiorPedaco(m) {
  const L = m.length, C = m[0].length;
  const marca = new Int32Array(L * C).fill(-1);
  const tamanhos = [];
  const pilha = [];
  for (let j = 0; j < L; j++) for (let i = 0; i < C; i++) {
    if (!m[j][i] || marca[j * C + i] >= 0) continue;
    const id = tamanhos.length;
    let n = 0;
    marca[j * C + i] = id; pilha.length = 0; pilha.push(j * C + i);
    while (pilha.length) {
      const k = pilha.pop(); n++;
      const y = (k / C) | 0, x = k % C;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= C || ny >= L) continue;
        const kk = ny * C + nx;
        if (m[ny][nx] && marca[kk] < 0) { marca[kk] = id; pilha.push(kk); }
      }
    }
    tamanhos.push(n);
  }
  if (!tamanhos.length) return { mascara: m, sobraram: 0 };
  let maior = 0;
  for (let i = 1; i < tamanhos.length; i++) if (tamanhos[i] > tamanhos[maior]) maior = i;
  const saida = vazia(L, C);
  for (let j = 0; j < L; j++) for (let i = 0; i < C; i++)
    if (marca[j * C + i] === maior) saida[j][i] = 1;
  return { mascara: saida, sobraram: tamanhos.length - 1 };
}

/**
 * Fecha os buracos de dentro da figura.
 *
 * Descobre o fundo pelo lado de fora: o que a inundação a partir da borda não
 * alcança está cercado pela figura e vira parte dela. É o que separa "o olho do
 * bichinho vira furo no cortador" de "o olho some".
 */
export function preencherFuros(m) {
  const L = m.length, C = m[0].length;
  const fora = new Uint8Array(L * C);
  const pilha = [];
  const por = (x, y) => {
    const k = y * C + x;
    if (x < 0 || y < 0 || x >= C || y >= L || fora[k] || m[y][x]) return;
    fora[k] = 1; pilha.push(k);
  };
  for (let i = 0; i < C; i++) { por(i, 0); por(i, L - 1); }
  for (let j = 0; j < L; j++) { por(0, j); por(C - 1, j); }
  while (pilha.length) {
    const k = pilha.pop(), y = (k / C) | 0, x = k % C;
    por(x + 1, y); por(x - 1, y); por(x, y + 1); por(x, y - 1);
  }
  const saida = vazia(L, C);
  for (let j = 0; j < L; j++) for (let i = 0; i < C; i++)
    saida[j][i] = m[j][i] || !fora[j * C + i] ? 1 : 0;
  return saida;
}

/**
 * Anel em volta da borda da figura: engorda `fora` células pra cá e encolhe
 * `dentro` células pra lá; o que sobra entre os dois é a parede.
 */
export function anel(m, fora, dentro) {
  const grande = fora > 0 ? engordar(m, fora) : m;
  let pequeno = m;
  for (let k = 0; k < dentro; k++) pequeno = encolher(pequeno);
  const L = grande.length, C = grande[0].length;
  const saida = vazia(L, C);
  for (let j = 0; j < L; j++) for (let i = 0; i < C; i++)
    saida[j][i] = grande[j][i] && !pequeno[j][i] ? 1 : 0;
  return saida;
}

/** Quantas células a peça tem de largura mínima de parede, medindo de verdade. */
export function paredeMaisFina(anelMascara, mmPorCelula) {
  let m = anelMascara, k = 0;
  const inteiro = pedacos(m);
  while (k < 12) {
    const menor = encolher(m);
    let tem = false;
    for (const l of menor) { for (const v of l) if (v) { tem = true; break; } if (tem) break; }
    if (!tem || pedacos(menor) !== inteiro) break;
    m = menor; k++;
  }
  return (2 * k + 1) * mmPorCelula;
}

/* ================================================================
   Montagem da malha
   ================================================================ */

/**
 * Extruda uma máscara entre duas alturas, emitindo só as faces que ficam à
 * mostra. `abaixo` e `acima` são as máscaras das faixas vizinhas: onde elas
 * cobrem, não existe tampa.
 */
function extrudar(tris, m, e, z0, z1, abaixo, acima) {
  const L = m.length, C = m[0].length;
  const X = (i) => i * e, Y = (j) => (L - j) * e;
  const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
  const dentro = (mm, j, i) => j >= 0 && j < L && i >= 0 && i < C && mm && mm[j][i];

  for (let j = 0; j < L; j++) {
    for (let i = 0; i < C; i++) {
      if (!m[j][i]) continue;
      const x0 = X(i), x1 = X(i + 1), y1 = Y(j), y0 = Y(j + 1);
      // paredes: só onde o vizinho do lado está vazio
      if (!dentro(m, j, i - 1))
        quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      if (!dentro(m, j, i + 1))
        quad([x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]);
      if (!dentro(m, j - 1, i))
        quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
      if (!dentro(m, j + 1, i))
        quad([x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]);
      // tampas: só onde a faixa vizinha não cobre
      if (!dentro(abaixo, j, i))
        quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
      if (!dentro(acima, j, i))
        quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    }
  }
}

/**
 * Monta o cortador inteiro.
 *
 * `op`: mmPorCelula, larguraAba, alturaAba, espessuraLamina, altura, fio.
 * As faixas, de baixo pra cima: aba larga na mesa, lâmina, e o fio de corte
 * mais fino no topo.
 */
export function montarCortador(op, mascara) {
  const e = op.mmPorCelula;
  const cel = (mm) => Math.max(1, Math.round(mm / e));

  const meia = cel(op.espessuraLamina) / 2;
  const foraLamina = Math.max(1, Math.round(meia));
  const dentroLamina = Math.max(1, Math.round(meia));

  const lamina = anel(mascara, foraLamina, dentroLamina);
  // Figura com furo gera um anel de fora e outro em volta do furo, e o de
  // dentro sai SOLTO — cai da peça. A aba cheia (a silhueta inteira, não só a
  // borda) amarra os dois. Vira cortador com carimbo, que é como se resolve
  // isso de verdade.
  const aba = op.abaCheia
    ? engordar(mascara, foraLamina + cel(op.larguraAba))
    : anel(mascara, foraLamina + cel(op.larguraAba), dentroLamina);
  const fioCel = Math.max(1, Math.round(cel(op.espessuraLamina) * 0.35));
  const fio = op.fio > 0 ? anel(mascara, fioCel, fioCel) : lamina;

  const zAba = op.alturaAba;
  const zFio = Math.max(zAba + 0.6, op.altura - (op.fio || 0));
  const faixas = [
    { m: aba,    z0: 0,    z1: zAba },
    { m: lamina, z0: zAba, z1: zFio },
    { m: fio,    z0: zFio, z1: op.altura },
  ].filter((f) => f.z1 - f.z0 > 1e-6);

  const tris = [];
  for (let k = 0; k < faixas.length; k++) {
    const f = faixas[k];
    extrudar(tris, f.m, e, f.z0, f.z1,
             k > 0 ? faixas[k - 1].m : null,
             k + 1 < faixas.length ? faixas[k + 1].m : null);
  }

  let celulas = 0;
  for (const f of faixas) {
    let n = 0;
    for (const l of f.m) for (const v of l) if (v) n++;
    celulas += n * (f.z1 - f.z0);
  }

  const L = mascara.length, C = mascara[0].length;
  return {
    tris,
    largura: C * e,
    profundidade: L * e,
    altura: op.altura,
    // pedaços da PEÇA, não da lâmina: com aba cheia tudo vira um corpo só
    pedacos: pedacos(op.abaCheia ? aba : lamina),
    aneis: pedacos(lamina),
    paredeFina: paredeMaisFina(lamina, e),
    volume: celulas * e * e / 1000,
  };
}
