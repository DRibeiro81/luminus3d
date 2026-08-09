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
import { anexar, volume, fechar } from './geometria.js';

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
 * Suaviza o contorno: fecha as fendas finas e come as pontinhas.
 *
 * Personagem de desenho tem dedo, mecha de cabelo e laço — detalhe que vira
 * lâmina fina demais pra cortar massa e frágil demais pra durar. Engordar e
 * depois encolher fecha fenda; encolher e depois engordar tira ponta. Os dois
 * na sequência deixam um contorno que dá pra imprimir e cortar.
 */
export function suavizar(m, n) {
  if (n <= 0) return m;
  let x = engordar(m, n);                       // fecha fenda
  for (let k = 0; k < n; k++) x = encolher(x);
  for (let k = 0; k < n; k++) x = encolher(x);  // tira ponta
  x = engordar(x, n);
  return x;
}

/**
 * Joga fora os traços que encostam na borda da figura.
 *
 * O contorno do desenho também é um traço escuro, e ele já virou a lâmina do
 * cortador. Se sobrar na máscara de detalhe, vira um relevo que dá a volta na
 * peça inteira. Encolher a silhueta não basta: traço grosso atravessa a erosão.
 * Aqui some qualquer pedaço que toque a faixa da borda.
 */
export function semBorda(det, silhueta, recuoCel) {
  // Corta o que cai DENTRO da faixa colada na lâmina, e só isso.
  //
  // Antes eu jogava fora o componente inteiro que encostasse na faixa. Serve
  // quando o contorno do desenho é um laço solto, mas num boneco de corpo preto
  // o traço interno é a MESMA peça conectada do contorno externo — e ia metade
  // do desenho junto. No Mickey sobrava 2,6% de tinta, tudo picotado.
  const L = det.length, C = det[0].length;
  let miolo = silhueta;
  for (let k = 0; k < recuoCel; k++) miolo = encolher(miolo);
  const saida = [];
  let algum = false;
  for (let j = 0; j < L; j++) {
    const linha = new Uint8Array(C);
    for (let i = 0; i < C; i++) if (det[j][i] && miolo[j][i]) { linha[i] = 1; algum = true; }
    saida.push(linha);
  }
  return algum ? saida : null;
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
   A montagem pela grade foi retirada em 09/08.
   Ela extrudava célula por célula e deixava a borda em escada; a "aba cheia",
   único lugar que ainda a usava, saiu junto porque o dono não gostou do
   resultado. Tudo sai do contorno traçado agora.
   ================================================================ */

/* ================================================================
   Contorno traçado: a lâmina deixa de seguir a grade
   ================================================================ */

/**
 * Borra a máscara pra virar um campo contínuo.
 *
 * É o que dá precisão abaixo da célula: numa máscara de 0 e 1 a borda só pode
 * cair na linha da grade, e a peça sai serrilhada. Borrada, a borda vira uma
 * rampa e o contorno pode cruzar a metade em qualquer ponto dentro da célula.
 */
export function borrar(m, raio) {
  const L = m.length, C = m[0].length;
  let campo = Array.from({ length: L }, (_, j) => Float32Array.from(m[j]));
  for (let passo = 0; passo < 2; passo++) {          // duas passadas = quase gaussiano
    const h = campo.map((linha) => {
      const s = new Float32Array(C);
      for (let i = 0; i < C; i++) {
        let soma = 0, n = 0;
        for (let d = -raio; d <= raio; d++) {
          const x = i + d;
          if (x < 0 || x >= C) continue;
          soma += linha[x]; n++;
        }
        s[i] = soma / n;
      }
      return s;
    });
    const v = [];
    for (let j = 0; j < L; j++) {
      const s = new Float32Array(C);
      for (let i = 0; i < C; i++) {
        let soma = 0, n = 0;
        for (let d = -raio; d <= raio; d++) {
          const y = j + d;
          if (y < 0 || y >= L) continue;
          soma += h[y][i]; n++;
        }
        s[i] = soma / n;
      }
      v.push(s);
    }
    campo = v;
  }
  return campo;
}

/**
 * Marching squares: devolve as linhas fechadas onde o campo cruza `iso`.
 *
 * Cada célula da grade vira 0, 1 ou 2 segmentos, com as pontas interpoladas em
 * cima da aresta — é daí que vem a precisão abaixo da célula. Depois os
 * segmentos são costurados pelas pontas até fechar cada laço.
 */
export function contornos(campo, iso = 0.5) {
  const L = campo.length, C = campo[0].length;
  const segmentos = [];
  const entre = (a, b, xa, ya, xb, yb) => {
    const t = Math.abs(b - a) < 1e-9 ? 0.5 : (iso - a) / (b - a);
    return [xa + (xb - xa) * t, ya + (yb - ya) * t];
  };

  for (let j = 0; j < L - 1; j++) {
    for (let i = 0; i < C - 1; i++) {
      const a = campo[j][i], b = campo[j][i + 1];
      const c = campo[j + 1][i + 1], d = campo[j + 1][i];
      let caso = (a > iso ? 1 : 0) | (b > iso ? 2 : 0) | (c > iso ? 4 : 0) | (d > iso ? 8 : 0);
      if (caso === 0 || caso === 15) continue;
      const cima = () => entre(a, b, i, j, i + 1, j);
      const dir  = () => entre(b, c, i + 1, j, i + 1, j + 1);
      const baixo= () => entre(d, c, i, j + 1, i + 1, j + 1);
      const esq  = () => entre(a, d, i, j, i, j + 1);
      // Nos dois casos ambíguos (cantos opostos) o meio da célula decide, senão
      // duas figuras que se tocam pela ponta podem virar uma só.
      const meio = (a + b + c + d) / 4;
      if (caso === 5 && meio <= iso) caso = 105;
      if (caso === 10 && meio <= iso) caso = 110;
      const por = (p, q) => segmentos.push([p, q]);
      switch (caso) {
        case 1: case 14: por(esq(), cima()); break;
        case 2: case 13: por(cima(), dir()); break;
        case 3: case 12: por(esq(), dir()); break;
        case 4: case 11: por(dir(), baixo()); break;
        case 6: case 9:  por(cima(), baixo()); break;
        case 7: case 8:  por(esq(), baixo()); break;
        case 5:  por(esq(), cima()); por(dir(), baixo()); break;
        case 105: por(cima(), dir()); por(esq(), baixo()); break;
        case 10: por(cima(), dir()); por(esq(), baixo()); break;
        case 110: por(esq(), cima()); por(dir(), baixo()); break;
      }
    }
  }

  // Costura pelas DUAS pontas. Pela ponta de saída só, um segmento com o giro
  // invertido interrompe o laço e a figura sai em pedaços — foi o que aconteceu.
  const chave = (p) => `${Math.round(p[0] * 2048)},${Math.round(p[1] * 2048)}`;
  const vizinhos = new Map();
  segmentos.forEach((s, idx) => {
    for (const ponta of [0, 1]) {
      const k = chave(s[ponta]);
      if (!vizinhos.has(k)) vizinhos.set(k, []);
      vizinhos.get(k).push(idx);
    }
  });

  const usado = new Uint8Array(segmentos.length);
  const laços = [];
  for (let inicio = 0; inicio < segmentos.length; inicio++) {
    if (usado[inicio]) continue;
    usado[inicio] = 1;
    const linha = [segmentos[inicio][0], segmentos[inicio][1]];
    let ponta = segmentos[inicio][1];
    while (true) {
      const lista = vizinhos.get(chave(ponta)) || [];
      const prox = lista.find((idx) => !usado[idx]);
      if (prox === undefined) break;
      usado[prox] = 1;
      const s = segmentos[prox];
      // o segmento pode estar guardado ao contrário; segue pela outra ponta
      ponta = chave(s[0]) === chave(ponta) ? s[1] : s[0];
      linha.push(ponta);
    }
    if (linha.length > 8) {
      if (chave(linha[0]) !== chave(linha[linha.length - 1])) linha.push(linha[0]);
      laços.push(linha);
    }
  }

  // Sentido de giro: o maior laço é o contorno de fora e gira positivo; todos os
  // outros são furo e giram ao contrário. Sem isso a normal do furo aponta pro
  // lado errado e a parede dele nasce virada do avesso.
  if (laços.length) {
    let maior = 0;
    for (let i = 1; i < laços.length; i++)
      if (Math.abs(areaComSinal(laços[i])) > Math.abs(areaComSinal(laços[maior]))) maior = i;
    laços.forEach((l, i) => {
      const quer = i === maior ? 1 : -1;
      if (Math.sign(areaComSinal(l)) !== quer) l.reverse();
    });
  }
  return laços;
}

/** Tira ponto que quase não muda nada: a curva fica igual com menos triângulo. */
export function decimar(linha, minimo) {
  if (linha.length < 4) return linha;
  const saida = [linha[0]];
  for (let i = 1; i < linha.length - 1; i++) {
    const u = saida[saida.length - 1];
    if (Math.hypot(linha[i][0] - u[0], linha[i][1] - u[1]) >= minimo) saida.push(linha[i]);
  }
  saida.push(saida[0]);
  return saida.length > 8 ? saida : linha;
}

/** Chaikin: corta os cantos, duas passadas deixam a curva macia. */
export function suavizarLinha(linha, passos = 2) {
  let p = linha;
  for (let k = 0; k < passos; k++) {
    const novo = [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      novo.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      novo.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    novo.push(novo[0]);
    p = novo;
  }
  return p;
}

/** Área com sinal: diz se o laço é contorno de fora ou de furo. */
export function areaComSinal(linha) {
  let a = 0;
  for (let i = 0; i < linha.length - 1; i++)
    a += linha[i][0] * linha[i + 1][1] - linha[i + 1][0] * linha[i][1];
  return a / 2;
}

/**
 * Monta a peça varrendo um perfil ao longo do contorno traçado.
 *
 * A parede de dentro é vertical do chão ao topo; o lado de fora é um perfil
 * escalonado — aba larga embaixo, lâmina no meio, fio afinado em cima. Como o
 * contorno tem precisão abaixo da célula, a borda sai lisa: nada de escada.
 */
export function montarPorContorno(op, laços) {
  const e = op.mmPorCelula;
  const meia = op.espessuraLamina / 2;
  const alturaFio = Math.min(op.fio || 0, op.altura - op.alturaAba - 0.6);
  const zFio = op.altura - Math.max(0, alturaFio);
  // (deslocamento pra fora, altura). Deslocamento negativo entra pra dentro.
  const perfil = [
    [meia + op.larguraAba, 0],
    [meia + op.larguraAba, op.alturaAba],
    [meia, op.alturaAba],
    [meia, zFio],
    [Math.max(meia * 0.3, 0.12), op.altura],
  ];
  const dentro = -meia;

  const tris = [];
  const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };

  for (const bruto of laços) {
    const linha = bruto.slice(0, -1);            // fechado: a última repete a primeira
    const n = linha.length;
    if (n < 8) continue;
    const fora = areaComSinal(bruto) > 0 ? 1 : -1;   // furo vira do avesso

    // normal de cada ponto, média das duas arestas vizinhas
    const nx = new Float64Array(n), ny = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = linha[(i - 1 + n) % n], b = linha[(i + 1) % n];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const c = Math.hypot(dx, dy) || 1;
      dx /= c; dy /= c;
      nx[i] = dy * fora; ny[i] = -dx * fora;      // perpendicular
    }
    // ponto do contorno deslocado de `d` mm, já em milímetros
    const P = (i, d, z) => {
      const p = linha[i];
      return [(p[0] + nx[i] * (d / e)) * e, (p[1] + ny[i] * (d / e)) * e, z];
    };

    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      // parede de dentro, do chão ao topo
      quad(P(i, dentro, 0), P(i, dentro, op.altura),
           P(k, dentro, op.altura), P(k, dentro, 0));
      // lado de fora, trecho a trecho do perfil
      for (let s = 0; s < perfil.length - 1; s++) {
        const [d0, z0] = perfil[s], [d1, z1] = perfil[s + 1];
        quad(P(k, d0, z0), P(k, d1, z1), P(i, d1, z1), P(i, d0, z0));
      }
      // tampas de baixo e de cima
      quad(P(i, dentro, 0), P(k, dentro, 0), P(k, perfil[0][0], 0), P(i, perfil[0][0], 0));
      const topo = perfil[perfil.length - 1][0];
      quad(P(i, dentro, op.altura), P(i, topo, op.altura),
           P(k, topo, op.altura), P(k, dentro, op.altura));
    }
  }

  // Volume EXATO, somado dos triângulos. A conta por comprimento do contorno
  // vezes área do perfil errava 19% — e esse número vai direto pro peso e pro
  // preço que o cliente vê.
  let comprimento = 0;
  for (const l of laços) for (let i = 0; i < l.length - 1; i++)
    comprimento += Math.hypot(l[i+1][0]-l[i][0], l[i+1][1]-l[i][1]) * e;
  return { tris, comprimento, volume: volume(tris) / 1000, laços: laços.length };
}

/**
 * Recorta um polígono em triângulos (corte de orelha).
 *
 * Precisa disso pra chapa maciça: a lâmina é um anel e sai de varredura, mas o
 * carimbo é preenchido, e preenchimento exige triangular de verdade. Vale só
 * pra polígono simples, sem furo — no carimbo os furos são fechados de
 * propósito, então basta.
 */
export function triangular(poli) {
  const p = poli.slice();
  if (p.length > 3 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
  const n = p.length;
  if (n < 3) return [];

  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  // anti-horário: o teste de orelha abaixo assume esse sentido
  const ordem = [];
  for (let i = 0; i < n; i++) ordem.push(area2 < 0 ? n - 1 - i : i);

  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const dentroDoTri = (a, b, c, q) =>
    cruz(a, b, q) >= 0 && cruz(b, c, q) >= 0 && cruz(c, a, q) >= 0;

  const restam = ordem.slice();
  const saida = [];
  let travas = 0;
  while (restam.length > 3 && travas < restam.length * 3) {
    let cortou = false;
    for (let i = 0; i < restam.length; i++) {
      const ia = restam[(i - 1 + restam.length) % restam.length];
      const ib = restam[i];
      const ic = restam[(i + 1) % restam.length];
      const a = p[ia], b = p[ib], c = p[ic];
      if (cruz(a, b, c) <= 0) continue;            // canto pra dentro, não é orelha
      let limpo = true;
      for (const k of restam) {
        if (k === ia || k === ib || k === ic) continue;
        if (dentroDoTri(a, b, c, p[k])) { limpo = false; break; }
      }
      if (!limpo) continue;
      saida.push([a, b, c]);
      restam.splice(i, 1);
      cortou = true; travas = 0;
      break;
    }
    if (!cortou) { travas++; restam.push(restam.shift()); }
  }
  if (restam.length === 3) saida.push([p[restam[0]], p[restam[1]], p[restam[2]]]);
  return saida;
}

/** Empurra uma malha inteira no plano, pra pôr duas peças lado a lado. */
export function mover(tris, dx, dy) {
  return tris.map((t) => t.map((v) => [v[0] + dx, v[1] + dy, v[2]]));
}

/** Empurra um contorno `d` mm pra dentro (negativo) ou pra fora (positivo). */
export function deslocarLinha(linha, d, e, paraFora = 1) {
  const p = linha.slice(0, -1);
  const n = p.length;
  const saida = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const c = Math.hypot(dx, dy) || 1;
    dx /= c; dy /= c;
    saida.push([p[i][0] + dy * paraFora * (d / e), p[i][1] - dx * paraFora * (d / e)]);
  }
  saida.push(saida[0]);
  return saida;
}

/**
 * Prisma fechado: paredes, tampa de baixo e tampa de cima.
 *
 * O contorno é virado pra anti-horário antes de qualquer coisa. `triangular`
 * já normaliza sozinho, então sem isso as tampas saíam num sentido e as paredes
 * no outro — a peça ficava com normal inconsistente e o fatiador podia ler o
 * dentro como fora.
 */
function prisma(tris, linha, e, z0, z1) {
  let p = linha.slice(0, -1);
  const n = p.length;
  if (n < 3) return;
  if (areaComSinal([...p, p[0]]) < 0) p = p.slice().reverse();
  const V = (i, z) => [p[i][0] * e, p[i][1] * e, z];
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    tris.push([V(i, z0), V(k, z0), V(k, z1)], [V(i, z0), V(k, z1), V(i, z1)]);
  }
  for (const [a, b, c] of triangular(linha)) {
    tris.push([[a[0]*e, a[1]*e, z1], [b[0]*e, b[1]*e, z1], [c[0]*e, c[1]*e, z1]]);
    tris.push([[a[0]*e, a[1]*e, z0], [c[0]*e, c[1]*e, z0], [b[0]*e, b[1]*e, z0]]);
  }
}

/** Cilindro fechado, pro botão de apertar. */
function cilindro(tris, cx, cy, raio, z0, z1, lados = 48) {
  const P = (i, z) => {
    const a = (i / lados) * Math.PI * 2;
    return [cx + raio * Math.cos(a), cy + raio * Math.sin(a), z];
  };
  for (let i = 0; i < lados; i++) {
    const k = (i + 1) % lados;
    tris.push([P(i, z0), P(k, z0), P(k, z1)], [P(i, z0), P(k, z1), P(i, z1)]);
    tris.push([[cx, cy, z1], P(i, z1), P(k, z1)]);
    tris.push([[cx, cy, z0], P(k, z0), P(i, z0)]);
  }
}

/**
 * Carimbo: a chapa que entra no biscoito já cortado e imprime os detalhes.
 *
 * Nasce do jeito que imprime: os detalhes de cara na mesa (primeira camada
 * perfeita), a chapa por cima amarrando tudo, e o botão de apertar no topo. Na
 * hora de usar é só virar.
 *
 * `laçosDetalhe` são os contornos dos detalhes, já no mesmo grid do contorno.
 */
export function montarCarimbo(op, contorno, laçosDetalhe) {
  const e = op.mmPorCelula;
  // A chapa desliza DENTRO da lâmina, não dentro do biscoito: ela é um êmbolo
  // que marca e empurra a massa pra fora. Por isso desconta meia lâmina antes
  // da folga — sem isso ela encosta na parede e trava.
  const chapa = deslocarLinha(contorno, -(op.espessuraLamina / 2 + op.folga), e, 1);
  const zRelevo = op.relevo;
  const zChapa = zRelevo + op.espessuraChapa;

  // Traço não pode passar da chapa. Passando, ele fica pendurado no ar e encosta
  // na parede da lâmina — o carimbo não entra na forma. O recorte anterior era
  // feito na máscara da silhueta, que é só uma aproximação: a suavização do
  // contorno move a borda, e sobrava traço para fora.
  //
  // Aqui os dois existem de verdade, então dá pra conferir ponto a ponto.
  const dentroDaChapa = (x, y) => {
    let dentro = false;
    for (let i = 0, j = chapa.length - 2; i < chapa.length - 1; j = i++) {
      const [xi, yi] = chapa[i], [xj, yj] = chapa[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };
  const cabem = laçosDetalhe.filter((l) => l.every(([x, y]) => dentroDaChapa(x, y)));

  const tris = [];
  const ov = 0.2;                                   // sólidos se sobrepõem, nunca encostam
  // Cada sólido é fechado por conta própria: assim não depende de eu acertar o
  // sentido de giro em cada face, e um contorno que veio ao contrário não
  // inverte a peça inteira.
  const solto = (montar) => { const t = []; montar(t); anexar(tris, fechar(t)); };

  for (const l of cabem) solto((t) => prisma(t, l, e, 0, zRelevo + ov));
  solto((t) => prisma(t, chapa, e, zRelevo, zChapa));

  if (op.botao > 0) {
    // centro pela média do contorno: cai dentro da chapa em qualquer formato
    let sx = 0, sy = 0;
    const p = chapa.slice(0, -1);
    for (const q of p) { sx += q[0]; sy += q[1]; }
    solto((t) => cilindro(t, (sx / p.length) * e, (sy / p.length) * e,
                          op.botao / 2, zChapa - ov, zChapa + op.alturaBotao));
  }

  return { tris, altura: zChapa + (op.botao > 0 ? op.alturaBotao : 0),
           volume: volume(tris) / 1000, detalhes: cabem.length,
           foraDaChapa: laçosDetalhe.length - cabem.length };
}

/**
 * Espelha a peça em X, em volta do próprio centro.
 *
 * Espelhar inverte o sentido de giro de toda face, então cada triângulo também
 * é invertido — senão a peça sai do avesso e o fatiador lê o dentro como fora.
 */
export function espelhar(tris) {
  let mn = Infinity, mx = -Infinity;
  for (const t of tris) for (const v of t) { if (v[0] < mn) mn = v[0]; if (v[0] > mx) mx = v[0]; }
  const eixo = mn + mx;
  return tris.map(([a, b, c]) => [
    [eixo - c[0], c[1], c[2]], [eixo - b[0], b[1], b[2]], [eixo - a[0], a[1], a[2]],
  ]);
}

/**
 * Descarta os pedaços pequenos demais de uma máscara de traço.
 *
 * Num desenho rico entram cílio, ruga de dedo e fio de cabelo: traços que nem
 * imprimem nem marcam massa, e que ainda deixam o carimbo frágil. O corte é por
 * tamanho do pedaço, não por espessura — traço fino e comprido fica.
 */
export function filtrarPequenos(m, minimoCelulas) {
  if (minimoCelulas <= 1) return m;
  const L = m.length, C = m[0].length;
  const visto = new Uint8Array(L * C);
  const saida = Array.from({ length: L }, () => new Uint8Array(C));
  const pilha = [];
  for (let j0 = 0; j0 < L; j0++) for (let i0 = 0; i0 < C; i0++) {
    if (!m[j0][i0] || visto[j0 * C + i0]) continue;
    const grupo = [];
    visto[j0 * C + i0] = 1; pilha.length = 0; pilha.push(j0 * C + i0);
    while (pilha.length) {
      const k = pilha.pop();
      grupo.push(k);
      const y = (k / C) | 0, x = k % C;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= C || ny >= L) continue;
        const kk = ny * C + nx;
        if (m[ny][nx] && !visto[kk]) { visto[kk] = 1; pilha.push(kk); }
      }
    }
    if (grupo.length >= minimoCelulas)
      for (const k of grupo) saida[(k / C) | 0][k % C] = 1;
  }
  return saida;
}

/**
 * Afina qualquer traço até virar uma linha de um ponto de largura.
 *
 * É o que transforma o desenho num traço de caneta: não importa se veio grosso,
 * fino ou como mancha, tudo sai com a mesma espessura depois de engordar de
 * volta. Sem isso o carimbo tinha traço gordo num lugar e sumido no outro, e o
 * jeito de compensar era ficar mexendo em três controles.
 *
 * Zhang-Suen: come o contorno em duas meias-passadas, mantendo o pixel que
 * romperia a linha se saísse. Roda até parar de mudar.
 */
export function afinar(m, limite = 40) {
  const L = m.length, C = m[0].length;
  let a = m.map((l) => Uint8Array.from(l));
  const em = (j, i) => (j < 0 || i < 0 || j >= L || i >= C ? 0 : a[j][i]);

  for (let passo = 0; passo < limite; passo++) {
    let mudou = false;
    for (const meia of [0, 1]) {
      const tirar = [];
      for (let j = 0; j < L; j++) for (let i = 0; i < C; i++) {
        if (!a[j][i]) continue;
        // vizinhos no sentido horário, começando pelo de cima
        const p = [em(j-1,i), em(j-1,i+1), em(j,i+1), em(j+1,i+1),
                   em(j+1,i), em(j+1,i-1), em(j,i-1), em(j-1,i-1)];
        let vizinhos = 0, viradas = 0;
        for (let k = 0; k < 8; k++) {
          vizinhos += p[k];
          if (!p[k] && p[(k + 1) % 8]) viradas++;
        }
        if (vizinhos < 2 || vizinhos > 6) continue;
        if (viradas !== 1) continue;      // tirar aqui partiria a linha
        const [n, ne, e, se, s, so, o, no] = p;
        if (meia === 0) {
          if (n * e * s !== 0 || e * s * o !== 0) continue;
        } else {
          if (n * e * o !== 0 || n * s * o !== 0) continue;
        }
        tirar.push(j * C + i);
      }
      if (tirar.length) {
        mudou = true;
        for (const k of tirar) a[(k / C) | 0][k % C] = 0;
      }
    }
    if (!mudou) break;
  }
  return a;
}

/** Amplia a máscara por um fator inteiro, repetindo célula. */
export function ampliar(m, k) {
  if (k <= 1) return m;
  const L = m.length, C = m[0].length;
  const saida = [];
  for (let j = 0; j < L * k; j++) {
    const linha = new Uint8Array(C * k);
    const src = m[(j / k) | 0];
    for (let i = 0; i < C * k; i++) linha[i] = src[(i / k) | 0];
    saida.push(linha);
  }
  return saida;
}

/**
 * Fecha as lacunas de um mapa de bordas: engorda e encolhe de volta.
 *
 * Borda achada por diferença de cor sai picotada onde o desenho tem
 * antisserrilhado ou sombra suave. Sem fechar antes de afinar, o traço vira
 * tracejado: os pedaços curtos caem no filtro de detalhe e sobram só riscos
 * soltos.
 */
export function fecharLacunas(m, n) {
  if (n <= 0) return m;
  let x = engordar(m, n);
  for (let k = 0; k < n; k++) x = encolher(x);
  return x;
}

/* ================================================================
   Descolorir: reduzir a poucas cores e pegar a divisa entre elas
   ================================================================ */

/**
 * Reduz a imagem a `k` cores chapadas (k-médias).
 *
 * É o "descolore" no sentido literal: sombra, degradê e antisserrilhado somem
 * dentro da cor mais próxima. Procurar onde a cor muda numa ilustração com
 * sombra acha ruído em todo lugar e o traço sai picotado; entre regiões
 * chapadas a divisa é fechada e contínua por construção.
 */
export function descolorir(d, C, L, k = 8, voltas = 12) {
  const n = C * L;
  // Sementes: a primeira é o primeiro pixel, e cada seguinte é a cor MAIS
  // LONGE das já escolhidas. Sem sorteio, então a mesma foto dá sempre o mesmo
  // resultado — e sem o furo de espalhar por posição, que numa imagem em faixas
  // verticais cai tudo na mesma faixa e as sementes nascem da mesma cor.
  const centros = [[d[0], d[1], d[2]]];
  const longe = new Float64Array(n).fill(Infinity);
  const pulo = Math.max(1, Math.floor(n / 40000));
  while (centros.length < k) {
    const q = centros[centros.length - 1];
    let alvo = 0, pior = -1;
    for (let i = 0; i < n; i += pulo) {
      const p = i * 4;
      const e = (d[p] - q[0]) ** 2 + (d[p+1] - q[1]) ** 2 + (d[p+2] - q[2]) ** 2;
      if (e < longe[i]) longe[i] = e;
      if (longe[i] > pior) { pior = longe[i]; alvo = p; }
    }
    if (pior <= 0) break;                    // imagem com menos cores que k
    centros.push([d[alvo], d[alvo + 1], d[alvo + 2]]);
  }
  k = centros.length;
  // As voltas rodam numa AMOSTRA. Achar a cor média não precisa de todo pixel,
  // e a grade do traço é fina de propósito — sem isso cada volta varre centenas
  // de milhares de pixels e a prévia trava a cada mexida de controle.
  const passo = Math.max(1, Math.floor(n / 40000));
  const rot = new Uint8Array(n);
  for (let volta = 0; volta < voltas; volta++) {
    const soma = centros.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i += passo) {
      const p = i * 4;
      let melhor = 0, dist = Infinity;
      for (let c = 0; c < k; c++) {
        const q = centros[c];
        const e = (d[p] - q[0]) ** 2 + (d[p+1] - q[1]) ** 2 + (d[p+2] - q[2]) ** 2;
        if (e < dist) { dist = e; melhor = c; }
      }
      rot[i] = melhor;
      const s = soma[melhor];
      s[0] += d[p]; s[1] += d[p+1]; s[2] += d[p+2]; s[3]++;
    }
    let mexeu = false;
    for (let c = 0; c < k; c++) {
      if (!soma[c][3]) continue;
      const novo = [soma[c][0] / soma[c][3], soma[c][1] / soma[c][3], soma[c][2] / soma[c][3]];
      if (Math.abs(novo[0] - centros[c][0]) + Math.abs(novo[1] - centros[c][1])
        + Math.abs(novo[2] - centros[c][2]) > 1) mexeu = true;
      centros[c] = novo;
    }
    if (!mexeu) break;
  }
  // e no fim cada pixel recebe a cor mais próxima, esse sim uma vez só
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let melhor = 0, dist = Infinity;
    for (let c = 0; c < k; c++) {
      const q = centros[c];
      const e = (d[p] - q[0]) ** 2 + (d[p+1] - q[1]) ** 2 + (d[p+2] - q[2]) ** 2;
      if (e < dist) { dist = e; melhor = c; }
    }
    rot[i] = melhor;
  }
  return { rot, centros };
}

/**
 * Junta os pedaços pequenos demais na cor do vizinho maior e devolve a divisa
 * entre as regiões que sobraram.
 *
 * Filtrar por tamanho de REGIÃO, e não por comprimento de traço, é o que faz o
 * controle de detalhe ter sentido: mancha de sombra some inteira, junto com o
 * contorno dela, em vez de virar risquinho solto.
 */
export function divisasDeRegiao(rot, C, L, minimoCelulas) {
  const n = C * L;
  const reg = new Int32Array(n).fill(-1);
  const tam = [];
  const cor = [];
  const pilha = [];
  for (let p = 0; p < n; p++) {
    if (reg[p] >= 0) continue;
    const id = tam.length;
    let q = 0;
    reg[p] = id; pilha.length = 0; pilha.push(p);
    while (pilha.length) {
      const a = pilha.pop(); q++;
      const y = (a / C) | 0, x = a % C;
      if (x + 1 < C && reg[a + 1] < 0 && rot[a + 1] === rot[a]) { reg[a + 1] = id; pilha.push(a + 1); }
      if (x > 0 && reg[a - 1] < 0 && rot[a - 1] === rot[a]) { reg[a - 1] = id; pilha.push(a - 1); }
      if (y + 1 < L && reg[a + C] < 0 && rot[a + C] === rot[a]) { reg[a + C] = id; pilha.push(a + C); }
      if (y > 0 && reg[a - C] < 0 && rot[a - C] === rot[a]) { reg[a - C] = id; pilha.push(a - C); }
    }
    tam.push(q); cor.push(rot[p]);
  }

  // Quem faz vizinhança com quem. Guardado por região, não por célula: o que
  // interessa é fundir região inteira, e não descascar anel por anel — num
  // campo todo pontilhado o descascamento nunca fecha, e sobrava sujeira.
  const viz = tam.map(() => new Set());
  for (let p = 0; p < n; p++) {
    const y = (p / C) | 0, x = p % C;
    if (x + 1 < C && reg[p + 1] !== reg[p]) { viz[reg[p]].add(reg[p + 1]); viz[reg[p + 1]].add(reg[p]); }
    if (y + 1 < L && reg[p + C] !== reg[p]) { viz[reg[p]].add(reg[p + C]); viz[reg[p + C]].add(reg[p]); }
  }

  const pai = tam.map((_, i) => i);
  const raiz = (a) => { while (pai[a] !== a) a = pai[a] = pai[pai[a]]; return a; };
  // do menor pro maior: pedaço pequeno é engolido pelo vizinho mais graúdo
  const ordem = tam.map((_, i) => i).sort((a, b) => tam[a] - tam[b]);
  for (const i of ordem) {
    let r = raiz(i);
    if (tam[r] >= minimoCelulas) continue;
    let alvo = -1, maior = -1;
    for (const v of viz[r]) {
      const w = raiz(v);
      if (w !== r && tam[w] > maior) { maior = tam[w]; alvo = w; }
    }
    if (alvo < 0) continue;                     // imagem de uma cor só
    pai[r] = alvo;
    tam[alvo] += tam[r];
    for (const v of viz[r]) viz[alvo].add(v);
  }
  for (let p = 0; p < n; p++) rot[p] = cor[raiz(reg[p])];

  const m = [];
  for (let j = 0; j < L; j++) {
    const linha = new Uint8Array(C);
    for (let i = 0; i < C; i++) {
      const p = j * C + i;
      if ((i + 1 < C && rot[p + 1] !== rot[p]) || (j + 1 < L && rot[p + C] !== rot[p])) linha[i] = 1;
    }
    m.push(linha);
  }
  return m;
}

/**
 * A tinta do desenho: o que um lápis teria traçado.
 *
 * Só pegar a divisa entre regiões não serve pra arte de linha. Um traço preto é
 * ele mesmo uma região, e região tem divisa dos DOIS lados — então cada contorno
 * do desenho saía dobrado, em anel, e bolinha virava donut.
 *
 * A separação certa é por espessura da região, não por cor:
 *
 *   região FINA (traço, bolinha, cílio)  ->  vira a linha de centro dela
 *   região GORDA (rosto, cabelo, vestido) ->  vira a divisa com a vizinha gorda
 *
 * E divisa de região fina não conta: onde um traço preto separa dois campos, a
 * linha de centro dele já é a marca — botar as divisas junto é que dobrava.
 */
export function tintaDoDesenho(rot, C, L, minimoCelulas, magrezaCelulas) {
  const n = C * L;
  const reg = new Int32Array(n).fill(-1);
  const tam = [], cor = [], pilha = [];
  for (let p = 0; p < n; p++) {
    if (reg[p] >= 0) continue;
    const id = tam.length;
    let q = 0;
    reg[p] = id; pilha.length = 0; pilha.push(p);
    while (pilha.length) {
      const a = pilha.pop(); q++;
      const y = (a / C) | 0, x = a % C;
      if (x + 1 < C && reg[a+1] < 0 && rot[a+1] === rot[a]) { reg[a+1] = id; pilha.push(a+1); }
      if (x > 0 && reg[a-1] < 0 && rot[a-1] === rot[a]) { reg[a-1] = id; pilha.push(a-1); }
      if (y + 1 < L && reg[a+C] < 0 && rot[a+C] === rot[a]) { reg[a+C] = id; pilha.push(a+C); }
      if (y > 0 && reg[a-C] < 0 && rot[a-C] === rot[a]) { reg[a-C] = id; pilha.push(a-C); }
    }
    tam.push(q); cor.push(rot[p]);
  }

  // funde o pedaço pequeno na vizinha maior (união-e-busca: descascar anel por
  // anel não converge num campo pontilhado)
  const viz = tam.map(() => new Set());
  for (let p = 0; p < n; p++) {
    const y = (p / C) | 0, x = p % C;
    if (x + 1 < C && reg[p+1] !== reg[p]) { viz[reg[p]].add(reg[p+1]); viz[reg[p+1]].add(reg[p]); }
    if (y + 1 < L && reg[p+C] !== reg[p]) { viz[reg[p]].add(reg[p+C]); viz[reg[p+C]].add(reg[p]); }
  }
  const pai = tam.map((_, i) => i);
  const raiz = (a) => { while (pai[a] !== a) a = pai[a] = pai[pai[a]]; return a; };
  for (const i of tam.map((_, i) => i).sort((a, b) => tam[a] - tam[b])) {
    const r = raiz(i);
    if (tam[r] >= minimoCelulas) continue;
    let alvo = -1, maior = -1;
    for (const v of viz[r]) { const w = raiz(v); if (w !== r && tam[w] > maior) { maior = tam[w]; alvo = w; } }
    if (alvo < 0) continue;
    pai[r] = alvo; tam[alvo] += tam[r];
    for (const v of viz[r]) viz[alvo].add(v);
  }
  const fim = new Int32Array(n);
  for (let p = 0; p < n; p++) fim[p] = raiz(reg[p]);

  // Quão gorda é cada região: distância de cada célula até sair da região, por
  // duas varreduras. Meia largura do traço, em outras palavras.
  const dist = new Int32Array(n);
  const bordaAqui = (p, x, y) =>
    x === 0 || y === 0 || x === C - 1 || y === L - 1 ||
    fim[p+1] !== fim[p] || fim[p-1] !== fim[p] || fim[p+C] !== fim[p] || fim[p-C] !== fim[p];
  for (let y = 0; y < L; y++) for (let x = 0; x < C; x++) {
    const p = y * C + x;
    if (bordaAqui(p, x, y)) { dist[p] = 0; continue; }
    dist[p] = Math.min(dist[p - 1], dist[p - C]) + 1;
  }
  const gordura = new Int32Array(tam.length);
  for (let y = L - 1; y >= 0; y--) for (let x = C - 1; x >= 0; x--) {
    const p = y * C + x;
    if (dist[p]) dist[p] = Math.min(dist[p],
      (x + 1 < C && fim[p+1] === fim[p] ? dist[p+1] : 0) + 1,
      (y + 1 < L && fim[p+C] === fim[p] ? dist[p+C] : 0) + 1);
    if (dist[p] > gordura[fim[p]]) gordura[fim[p]] = dist[p];
  }
  const magra = (r) => gordura[r] <= magrezaCelulas;
  // Bolinha não é traço curto: é mancha redonda. Reduzi-la ao esqueleto joga
  // fora o tamanho dela — a bolinha do laço da Minnie virava um ponto de uma
  // célula. Disco tem área ≈ 3,14 × gordura²; traço comprido tem MUITO mais.
  // Até 6× ainda é redondo, e vale cheia, do tamanho que é.
  const ponto = (r) => magra(r) && gordura[r] >= 2 && tam[r] <= 6 * gordura[r] * gordura[r];

  const finas = [], linhas = [], cheias = [];
  for (let j = 0; j < L; j++) {
    finas.push(new Uint8Array(C)); linhas.push(new Uint8Array(C)); cheias.push(new Uint8Array(C));
  }
  for (let p = 0; p < n; p++) if (magra(fim[p]) && !ponto(fim[p])) finas[(p / C) | 0][p % C] = 1;
  const centro = afinar(finas);

  for (let j = 0; j < L; j++) for (let i = 0; i < C; i++) {
    const p = j * C + i;
    if (ponto(fim[p])) { cheias[j][i] = 1; continue; }
    if (centro[j][i]) { linhas[j][i] = 1; continue; }
    if (magra(fim[p])) continue;                       // divisa de traço não conta
    const dir = i + 1 < C && fim[p+1] !== fim[p] && !magra(fim[p+1]);
    const bai = j + 1 < L && fim[p+C] !== fim[p] && !magra(fim[p+C]);
    if (dir || bai) linhas[j][i] = 1;
  }
  // separadas de propósito: a linha ainda vai engordar até a espessura da
  // caneta, e a mancha cheia não — ela já tem o tamanho que tem no desenho
  return { linhas, cheias };
}
