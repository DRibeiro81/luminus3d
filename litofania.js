// Foto na Luz: painel de espessura variável. Fino onde a foto é clara, grosso
// onde é escura. Apagado parece uma placa branca; com luz atrás, a foto aparece
// em tom contínuo — diferente do quadro de linhas, que lê de longe sem luz.
//
// A peça é um CAMPO DE ALTURA: frente lisa, e a espessura variando ponto a ponto
// no verso. Vira uma malha só, fechada — não precisa da montagem por adição que
// os outros módulos usam.
//
// Nasce em pé, como deve ser impressa: largura no X, altura no Z, espessura no Y.
// Deitada, a foto sairia com a resolução da camada em vez da do bico.

import { quad, fechar, anexar, volume } from './geometria.js';

/** Ponto do painel. `u` atravessa a largura, `v` sobe, `t` é a espessura ali. */
function ponto(op, u, v, t) {
  const z = v * op.altura;
  if (op.arco > 0) {
    // Curvo: dobrado em volta de um eixo vertical. Além de bonito, a curva dá
    // rigidez — painel plano e fino empena ao esfriar.
    const raio = op.largura / op.arco;
    const a = (u - 0.5) * op.arco;
    const r = raio + t;
    return [r * Math.sin(a), r * Math.cos(a) - raio, z];
  }
  return [(u - 0.5) * op.largura, t, z];
}

/**
 * Espessura em cada ponto, já com a moldura.
 *
 * escuridao[linha][coluna], 0 = claro. Claro tem que ficar FINO pra luz passar,
 * então a espessura acompanha a escuridão direto.
 */
function campoDeEspessura(op, escuridao, nU, nV) {
  const linhas = escuridao.length, colunas = escuridao[0].length;
  const t = new Float64Array((nU + 1) * (nV + 1));
  const m = op.moldura;
  const utilL = op.largura - 2 * m, utilA = op.altura - 2 * m;

  for (let j = 0; j <= nV; j++) {
    const z = (j / nV) * op.altura;
    for (let i = 0; i <= nU; i++) {
      const x = (i / nU) * op.largura;
      const idx = j * (nU + 1) + i;

      if (m > 0 && (x < m || x > op.largura - m || z < m || z > op.altura - m)) {
        t[idx] = op.espMax;                      // moldura: cheia e opaca
        continue;
      }
      // dentro da janela, a foto
      const fu = utilL > 0 ? (x - m) / utilL : 0;
      const fv = utilA > 0 ? (z - m) / utilA : 0;
      const cc = Math.min(colunas - 1, Math.max(0, Math.round(fu * (colunas - 1))));
      // a imagem vem com a primeira linha em cima; o painel cresce de baixo pra cima
      const ll = Math.min(linhas - 1, Math.max(0, Math.round((1 - fv) * (linhas - 1))));
      t[idx] = op.espMin + (op.espMax - op.espMin) * escuridao[ll][cc];
    }
  }
  return t;
}

export function painelDeLuz(op, escuridao) {
  // Uma célula por ~0,3 mm: abaixo disso o bico não expressa a diferença, e o
  // arquivo dobra de tamanho à toa.
  const passo = op.passoMalha || 0.3;
  const nU = Math.max(20, Math.min(1200, escuridao[0].length, Math.round(op.largura / passo)));
  const nV = Math.max(20, Math.min(1200, escuridao.length, Math.round(op.altura / passo)));
  const t = campoDeEspessura(op, escuridao, nU, nV);
  const T = (i, j) => t[j * (nU + 1) + i];

  const p = [];
  const P = (i, j, esp) => ponto(op, i / nU, j / nV, esp);

  for (let j = 0; j < nV; j++) {
    for (let i = 0; i < nU; i++) {
      // verso: a superfície que carrega a imagem
      quad(p, P(i, j, T(i, j)), P(i, j + 1, T(i, j + 1)),
              P(i + 1, j + 1, T(i + 1, j + 1)), P(i + 1, j, T(i + 1, j)));
    }
  }
  // frente lisa: uma faixa por coluna basta (é plana na vertical)
  for (let i = 0; i < nU; i++) {
    quad(p, P(i, 0, 0), P(i + 1, 0, 0), P(i + 1, nV, 0), P(i, nV, 0));
  }
  // bordas
  for (let i = 0; i < nU; i++) {
    quad(p, P(i, 0, 0), P(i, 0, T(i, 0)), P(i + 1, 0, T(i + 1, 0)), P(i + 1, 0, 0));
    quad(p, P(i, nV, 0), P(i + 1, nV, 0), P(i + 1, nV, T(i + 1, nV)), P(i, nV, T(i, nV)));
  }
  // Laterais em LEQUE, não em faixa: a frente é uma faixa por coluna e não tem
  // vértice no meio da altura, enquanto o verso tem um a cada célula. Ligar os
  // dois com quadriláteros deixava arestas soltas e a malha não fechava.
  // O leque parte do canto de baixo da frente e alcança todos os vértices do
  // verso — e como a lateral inteira é plana, não introduz erro nenhum.
  {
    const Fe0 = P(0, 0, 0), Fe1 = P(0, nV, 0);
    const Fd0 = P(nU, 0, 0), Fd1 = P(nU, nV, 0);
    for (let j = 0; j < nV; j++) {
      p.push([Fe0, P(0, j + 1, T(0, j + 1)), P(0, j, T(0, j))]);
      p.push([Fd0, P(nU, j, T(nU, j)), P(nU, j + 1, T(nU, j + 1))]);
    }
    p.push([Fe0, Fe1, P(0, nV, T(0, nV))]);
    p.push([Fd0, P(nU, nV, T(nU, nV)), Fd1]);
  }

  const tris = fechar(p);
  let fina = Infinity, grossa = 0;
  for (const v of t) { if (v < fina) fina = v; if (v > grossa) grossa = v; }

  return {
    tris, nU, nV,
    espessuraMin: fina, espessuraMax: grossa,
    volume: volume(tris) / 1000,
  };
}

/**
 * Pé de apoio: peça separada, com uma fenda onde o painel encaixa.
 * Montado como três caixas — o fundo inteiro e duas paredes deixando a fenda.
 */
export function peDeApoio(op) {
  const fenda = op.espMax + op.folgaPe;
  const larg = op.larguraPe;
  const prof = fenda + 2 * op.paredePe;
  const alt = op.alturaPe;
  const base = Math.max(1.6, alt * 0.35);
  const tris = [];

  const caixa = (x0, y0, z0, x1, y1, z1) => {
    const p = [];
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const P = (i, z) => [c[i][0], c[i][1], z];
    p.push([P(0, z1), P(1, z1), P(2, z1)], [P(0, z1), P(2, z1), P(3, z1)]);
    p.push([P(0, z0), P(2, z0), P(1, z0)], [P(0, z0), P(3, z0), P(2, z0)]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(p, P(i, z0), P(j, z0), P(j, z1), P(i, z1));
    }
    anexar(tris, fechar(p));
  };

  const ov = 0.01;   // as partes se sobrepõem: encostadas dividiriam face
  caixa(-larg / 2, -prof / 2, 0, larg / 2, prof / 2, base);
  caixa(-larg / 2, -prof / 2, base - ov, larg / 2, -fenda / 2, alt);
  caixa(-larg / 2, fenda / 2, base - ov, larg / 2, prof / 2, alt);

  return { tris, fenda, prof, volume: volume(tris) / 1000 };
}

/* ================================================================
   Cúpula: a mesma foto, fechada em volta, virando abajur
   ================================================================ */

/**
 * Cúpula de luz. Por dentro é um cilindro liso — a espessura cresce pra FORA,
 * então é na face externa que a foto aparece. Era o contrário até 07/08; o dono
 * apontou que a foto ficava virada pro interior da peça.
 *
 * As faixas cheias de cima e de baixo continuam com a espessura máxima, então
 * ali o diâmetro externo é exatamente `op.diametro` — é por elas que a peça
 * assenta na base, e por isso o encaixe não mudou. Elas também dão a rigidez.
 *
 * escuridao[linha][coluna]: a coluna dá a volta, a linha sobe.
 */
export function cupulaDeLuz(op, escuridao) {
  const linhas = escuridao.length, colunas = escuridao[0].length;
  const R = op.diametro / 2;
  const passo = op.passoMalha || 0.4;
  // Nunca mais células do que a foto tem detalhe: passar disso só engorda o
  // arquivo. Numa cúpula isso importa muito — a área aberta é a circunferência
  // inteira, e a malha explode fácil pro dobro do necessário.
  const nU = Math.max(60, Math.min(1400, colunas, Math.round((Math.PI * op.diametro) / passo)));
  const nV = Math.max(20, Math.min(1200, linhas, Math.round(op.altura / passo)));

  const bandaB = Math.max(op.bandaBase || 0, 0);
  const bandaT = Math.max(op.bandaTopo || 0, 0);
  const utilA = Math.max(1, op.altura - bandaB - bandaT);

  const esp = (i, j) => {
    const z = (j / nV) * op.altura;
    if (z < bandaB || z > op.altura - bandaT) return op.espMax;
    const fv = (z - bandaB) / utilA;
    const cc = Math.min(colunas - 1, Math.max(0, Math.round((i % nU) / nU * (colunas - 1))));
    const ll = Math.min(linhas - 1, Math.max(0, Math.round((1 - fv) * (linhas - 1))));
    return op.espMin + (op.espMax - op.espMin) * escuridao[ll][cc];
  };

  // O `% nU` fecha a emenda no mesmo ponto, sem resíduo de arredondamento.
  const P = (i, j, r) => {
    const a = (2 * Math.PI * (i % nU)) / nU;
    const z = (j / nV) * op.altura;
    return [r * Math.cos(a), r * Math.sin(a), z];
  };

  // A foto fica na face de FORA. A parede interna é um cilindro liso no raio
  // menor possível (o da parte mais grossa), e a espessura cresce pra fora a
  // partir dele. Nas faixas de cima e de baixo a espessura é a máxima, então o
  // diâmetro externo ali volta a ser exatamente `op.diametro` — é isso que
  // encaixa na base, e por isso o encaixe não muda.
  const Ri = R - op.espMax;
  const rExt = (i, j) => Ri + esp(i, j);

  const p = [];
  for (let i = 0; i < nU; i++) {
    // dentro: cilindro liso, uma faixa por coluna
    quad(p, P(i, 0, Ri), P(i, nV, Ri), P(i + 1, nV, Ri), P(i + 1, 0, Ri));
    for (let j = 0; j < nV; j++) {
      // fora: a superfície que carrega a imagem
      quad(p, P(i, j, rExt(i, j)), P(i + 1, j, rExt(i + 1, j)),
              P(i + 1, j + 1, rExt(i + 1, j + 1)), P(i, j + 1, rExt(i, j + 1)));
    }
    // bordas de cima e de baixo
    quad(p, P(i, nV, Ri), P(i, nV, rExt(i, nV)),
            P(i + 1, nV, rExt(i + 1, nV)), P(i + 1, nV, Ri));
    quad(p, P(i, 0, Ri), P(i + 1, 0, Ri),
            P(i + 1, 0, rExt(i + 1, 0)), P(i, 0, rExt(i, 0)));
  }

  const tris = fechar(p);
  let fina = Infinity, grossa = 0;
  for (let i = 0; i < nU; i++) for (let j = 0; j <= nV; j++) {
    const v = esp(i, j);
    if (v < fina) fina = v;
    if (v > grossa) grossa = v;
  }
  return {
    tris, nU, nV,
    espessuraMin: fina, espessuraMax: grossa,
    // o que digitar na aba Base pra o encaixe fechar
    encaixeDiametro: op.diametro, encaixeParede: op.espMax,
    volume: volume(tris) / 1000,
  };
}

// A prévia em 3D (`previaDaCupula`) foi retirada em 07/08: o dono achou o
// abajur na tela pior que a foto plana. A tela agora mostra o retângulo.
