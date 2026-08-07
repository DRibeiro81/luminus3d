// Geometria do quadro plano: desenho em linhas em linhas, pontos ou pontilhado.
// Não toca em DOM — roda no navegador e no Node (é assim que dá pra testar).
//
// Convenção: as formas são calculadas no sistema da TELA (y cresce pra baixo,
// igual ao SVG) e viram triângulos já no sistema do STL (y pra cima), pela
// função Y(). Assim o SVG e o STL saem da mesma conta, sem espelhamento tardio.

import { quad, fechar, anexar, volume } from './geometria.js';

// Decisão do dono em 2026-08-06: o app oferece SÓ linhas. Pontos e pontilhado
// continuam implementados abaixo (funcionam e passam nos testes), mas ficaram
// fora do seletor — dependem de fundo sólido e não servem pra luminária.
export const ESTILOS = ['linhas'];

/**
 * Piso da largura da linha: UMA passada de bico.
 *
 * É o mínimo pra o fatiador depositar o filete — abaixo disso ele pula o trecho
 * e a linha sai com buraco. A RESISTÊNCIA não vem daqui: vem das travessas, que
 * encurtam o vão livre. Foi assim que deu pra manter a linha fina (e portanto o
 * detalhe e a peça pequena) sem ela arrebentar.
 */
export function larguraMinima(bico) {
  return bico || 0.4;
}

/** Peça de referência: a que quebrou ao descolar em 06/08. */
const REFERENCIA = { largura: 0.42, altura: 1.2, vao: 170 };

/**
 * Índice de resistência da linha, comparado com a que quebrou.
 *
 * A flecha de uma viga apoiada nas pontas vai com vão³ / (largura × altura³).
 * Ou seja: encurtar o vão pela metade rende 8×, enquanto dobrar a largura rende
 * só 2×. É por isso que travessa fina bate engrossar a linha inteira — e ainda
 * sai mais barato em filamento e não come detalhe.
 */
export function rigidezRelativa(largura, altura, vao) {
  const r = REFERENCIA;
  const alvo = (largura * altura ** 3) / (vao || r.vao) ** 3;
  const base = (r.largura * r.altura ** 3) / r.vao ** 3;
  return alvo / base;
}

/** Abaixo disso o bico não consegue depositar o ponto — melhor não imprimir. */
const RAIO_MINIMO_IMPRIMIVEL = 0.22;

/* ================================================================
   Quanto a imagem precisa ser amostrada, por estilo
   ================================================================ */

export function gradeNecessaria(op) {
  const utilL = op.largura - 2 * op.moldura;
  const utilA = op.altura - 2 * op.moldura;

  if (op.estilo === 'pontos') {
    // Malha hexagonal: linha ímpar entra meio passo, que é o encaixe mais
    // apertado possível e some com o aspecto de grade quadriculada.
    const colunas = Math.max(4, Math.floor(utilL / op.passo));
    const linhas = Math.max(4, Math.floor(utilA / (op.passo * 0.866)));
    return { colunas, linhas };
  }
  if (op.estilo === 'pontilhado') {
    const colunas = Math.max(8, Math.round(utilL / op.passo));
    const linhas = Math.max(8, Math.round(utilA / op.passo));
    return { colunas, linhas };
  }
  const vertical = op.direcao === 'vertical';
  const transv = vertical ? utilL : utilA;
  const long = vertical ? utilA : utilL;
  const linhas = Math.max(4, Math.round(transv / op.passo));
  const colunas = Math.min(1200, Math.max(200, Math.round(long * 2)));
  return { colunas, linhas };
}

/* ================================================================
   Formas 2D (em mm, sistema da tela)
   ================================================================ */

/** Fitas de espessura variável — o desenho em linhas de sempre. */
export function fitasDeLinhas(op, escuridao) {
  const nLinhas = escuridao.length;
  const nAmostras = escuridao[0].length;
  const vertical = op.direcao === 'vertical';
  const utilTransv = (vertical ? op.largura : op.altura) - 2 * op.moldura;
  const utilLong = (vertical ? op.altura : op.largura) - 2 * op.moldura;

  const passo = utilTransv / nLinhas;

  // FOLGA entre linhas vizinhas: medida física, não proporção. Antes eu deixava
  // 8% do passo — a 2 mm isso dá 0,16 mm, bem menos que o filete do bico, e nas
  // áreas escuras as duas linhas se encostavam e fundiam na impressão.
  // Uma folga de um bico inteiro sai separada de verdade.
  const folga = Math.max(op.folgaMin || 0, op.bico || 0.4);
  const espMax = Math.min(op.espMax || passo - folga, passo - folga);

  // A linha NUNCA afina abaixo do que o bico deposita. Este piso é o que
  // garante que ela sai inteira: sem ele, o trecho fino some na fatiação e a
  // linha aparece partida na peça, mesmo com a malha contínua.
  const piso = larguraMinima(op.bico);
  const espMin = Math.max(op.espMin, piso);
  // Passo apertado demais pro bico: não cabe variação nenhuma entre o piso e o
  // teto. Devolve o aviso em vez de afinar a linha abaixo do piso.
  const passoInsuficiente = espMax < espMin;

  const invasao = op.moldura > 0 ? Math.min(op.moldura * 0.6, 0.8) : 0;
  const ini = op.moldura - invasao;
  const fim = op.moldura + utilLong + invasao;

  // Se a espessura empatar EXATAMENTE com o passo, as linhas vizinhas ficam
  // tangentes e dividem vértice: malha não-manifold. Empurra pra sobreposição,
  // que o fatiador une sem reclamar. (Só acontece no caso degenerado acima.)
  const encosta = (v) => (Math.abs(v - passo) < 0.01 ? passo * 1.02 : v);
  const espTeto = encosta(Math.max(espMax, espMin));
  const fitas = [];
  let maisFina = Infinity;
  for (let i = 0; i < nLinhas; i++) {
    const centro = op.moldura + passo * (i + 0.5);
    const topo = [], base = [];
    for (let j = 0; j < nAmostras; j++) {
      const t = espMin + (espTeto - espMin) * escuridao[i][j];
      if (t < maisFina) maisFina = t;
      const pos = ini + (fim - ini) * (j / (nAmostras - 1));
      if (vertical) {
        topo.push([centro + t / 2, pos]);
        base.push([centro - t / 2, pos]);
      } else {
        topo.push([pos, centro - t / 2]);
        base.push([pos, centro + t / 2]);
      }
    }
    fitas.push([topo, base]);
  }
  return { fitas, passo, espMin, espMax: espTeto, maisFina, piso, passoInsuficiente,
           folga, folgaReal: passo - espTeto };
}

/**
 * Travessas de reforço: barras finas cruzando TODAS as linhas.
 *
 * Sem elas, cada linha é um vão livre da moldura à moldura e arrebenta ao
 * descolar. Com duas, o vão cai a um terço — e como a flecha vai com vão³, isso
 * é 27× menos deflexão sem engrossar nada. Ficam perpendiculares às linhas, na
 * mesma altura delas, e são unidas pelo fatiador no cruzamento.
 */
export function travessasDeReforco(op, oy, escuridao) {
  const n = Math.max(0, Math.round(op.travessas || 0));
  const vertical = op.direcao === 'vertical';
  const utilLong = (vertical ? op.altura : op.largura) - 2 * op.moldura;
  const vao = utilLong / (n + 1);
  if (n === 0) return { barras: [], vao: utilLong, largura: 0, escondidas: 0 };

  // Travessa também é parede fina: precisa de pelo menos duas passadas, porque
  // ela é quem segura o resto.
  const larg = Math.max(op.travessaLargura || 0, (op.bico || 0.4) * 2);
  const invasao = op.moldura > 0 ? Math.min(op.moldura * 0.6, 0.8) : 0;
  const ini = op.moldura - invasao;
  const fim = op.moldura + (vertical ? op.largura : op.altura) - 2 * op.moldura + invasao;

  // Escuridão média de cada amostra ao longo do comprimento: é o perfil que diz
  // onde a travessa se esconde. Coluna escura = linhas já grossas e quase se
  // tocando, então a barra some ali dentro em vez de riscar a imagem.
  let perfil = null;
  if (escuridao?.length) {
    const nAm = escuridao[0].length;
    perfil = new Float64Array(nAm);
    for (const linha of escuridao) for (let j = 0; j < nAm; j++) perfil[j] += linha[j];
    for (let j = 0; j < nAm; j++) perfil[j] /= escuridao.length;
  }

  const barras = [];
  let escondidas = 0;
  const usados = [];
  for (let i = 1; i <= n; i++) {
    const ideal = op.moldura + vao * i;
    let pos = ideal;

    if (perfil) {
      // Procura a coluna mais escura numa janela de ±25% do vão. Sair mais que
      // isso do lugar ideal desequilibraria os vãos e devolveria o problema.
      const folga = vao * 0.25;
      const nAm = perfil.length;
      const daPos = (j) => op.moldura + (utilLong * j) / (nAm - 1);
      let melhor = -1, melhorPos = ideal;
      for (let j = 0; j < nAm; j++) {
        const x = daPos(j);
        if (Math.abs(x - ideal) > folga) continue;
        if (usados.some((u) => Math.abs(u - x) < larg * 2)) continue;
        if (perfil[j] > melhor) { melhor = perfil[j]; melhorPos = x; }
      }
      pos = melhorPos;
      // Só conta como escondida se de fato foi parar numa faixa escura.
      if (melhor > 0.65) escondidas++;
    }
    usados.push(pos);

    barras.push(
      vertical
        ? [ini, oy + pos - larg / 2, fim, oy + pos + larg / 2]      // barra horizontal
        : [pos - larg / 2, oy + ini, pos + larg / 2, oy + fim],     // barra vertical
    );
  }

  // O vão que importa pro cálculo é o MAIOR, não o médio: é ele que quebra.
  const cortes = [op.moldura, ...usados, op.moldura + utilLong];
  let maior = 0;
  for (let k = 0; k < cortes.length - 1; k++) maior = Math.max(maior, cortes[k + 1] - cortes[k]);

  return { barras, vao: maior, largura: larg, escondidas };
}

/**
 * Pontes escondidas: em vez de uma barra atravessando a imagem inteira, ligações
 * curtas entre CADA par de linhas vizinhas, cada uma no ponto escuro da região.
 *
 * Barra contínua sempre aparece: ela cruza a altura toda e, por mais escura que
 * seja a coluna na média, em algum trecho ela passa por área clara. A ponte é
 * local — procura o lugar onde as DUAS linhas já estão grossas e some ali.
 *
 * O efeito mecânico é o mesmo: cada linha deixa de ser um vão livre da moldura à
 * moldura e passa a ter apoio a cada `vão`. A diferença é que o apoio é o
 * vizinho, e não uma barra — o conjunto vira uma malha em vez de tiras soltas.
 */
export function pontesEscondidas(op, escuridao, oy) {
  const n = Math.max(0, Math.round(op.travessas || 0));
  const nLinhas = escuridao.length;
  const nAm = escuridao[0].length;
  const vertical = op.direcao === 'vertical';
  const utilTransv = (vertical ? op.largura : op.altura) - 2 * op.moldura;
  const utilLong = (vertical ? op.altura : op.largura) - 2 * op.moldura;
  const passo = utilTransv / nLinhas;
  const vao = utilLong / (n + 1);
  if (n === 0 || nLinhas < 2) return { pontes: [], vao: utilLong, largura: 0 };

  const larg = Math.max(op.travessaLargura || 0, (op.bico || 0.4) * 2);
  const folga = vao * 0.4;
  const daPos = (j) => op.moldura + (utilLong * j) / (nAm - 1);

  const pontes = [];
  for (let i = 0; i < nLinhas - 1; i++) {
    const c1 = op.moldura + passo * (i + 0.5);
    const c2 = op.moldura + passo * (i + 1.5);
    for (let k = 1; k <= n; k++) {
      const ideal = op.moldura + vao * k;
      // O ponto bom é onde as DUAS linhas estão escuras: usa o menor dos dois
      // tons, senão a ponte cai num lugar escuro só de um lado e aparece.
      let melhor = -1, pos = ideal;
      for (let j = 0; j < nAm; j++) {
        const x = daPos(j);
        if (Math.abs(x - ideal) > folga) continue;
        const t = Math.min(escuridao[i][j], escuridao[i + 1][j]);
        if (t > melhor) { melhor = t; pos = x; }
      }
      // Estica um pouco além dos centros: pontes de pares vizinhos costumam
      // cair no MESMO ponto escuro, e encostadas face a face virariam malha
      // não-manifold. Sobrepostas, o fatiador une sem reclamar.
      const e = passo * 0.06;
      pontes.push(
        vertical
          ? [c1 - e, oy + pos - larg / 2, c2 + e, oy + pos + larg / 2]
          : [pos - larg / 2, oy + c1 - e, pos + larg / 2, oy + c2 + e],
      );
    }
  }
  return { pontes, vao, largura: larg };
}

/** Pontos redondos em malha hexagonal, raio conforme a escuridão. */
export function pontosRedondos(op, escuridao) {
  const nLinhas = escuridao.length;
  const nCols = escuridao[0].length;
  const p = op.passo;
  // 0,55 do passo faz o preto encostar e fundir — sem isso, área escura fica
  // com buraquinho entre os pontos em vez de virar massa cheia.
  const rMax = p * 0.55;
  const pontos = [];
  let omitidos = 0;

  for (let i = 0; i < nLinhas; i++) {
    for (let j = 0; j < nCols; j++) {
      let r = rMax * escuridao[i][j];
      if (r < RAIO_MINIMO_IMPRIMIVEL) { omitidos++; continue; }
      // Numa região de tom uniforme, os vizinhos podem cair exatamente tangentes
      // (raio = metade do passo) e aí dividem vértice: malha não-manifold.
      // Empurra pra sobreposição, que o fatiador resolve sem problema.
      if (Math.abs(2 * r - p) < 0.01) r = p / 2 + 0.01;
      const x = op.moldura + p * (j + 0.5 + (i % 2) * 0.5);
      const y = op.moldura + p * 0.866 * (i + 0.5);
      // O deslocamento da linha ímpar joga o último ponto pra fora: descarta.
      if (x + r > op.largura - op.moldura) continue;
      pontos.push([x, y, r]);
    }
  }
  return { pontos, rMax, omitidos };
}

/**
 * Pontilhado: pontos todos do mesmo tamanho, o que muda é a densidade.
 * Difusão de erro (Floyd–Steinberg) em vez de sorteio — dá o granulado clássico
 * e, por ser determinístico, a mesma foto sai sempre igual.
 */
export function pontilhado(op, escuridao) {
  const nLinhas = escuridao.length;
  const nCols = escuridao[0].length;
  const buf = escuridao.map((l) => Float64Array.from(l));
  const pontos = [];
  // O ponto é medido EM RELAÇÃO ao passo, não em mm soltos. Ponto pequeno demais
  // pro espaçamento arruína o contraste: com 0,6 mm numa grade de 1,2 mm, mesmo
  // a densidade máxima cobre só 20% da área e o preto sai cinza claro.
  // Teto em 0,49 do passo: em 0,50 os pontos vizinhos ficam EXATAMENTE tangentes,
  // dividem o mesmo vértice e a malha vira não-manifold. A folga que sobra é
  // menor que o filete do bico, então na peça impressa eles encostam do mesmo jeito.
  const r = Math.min(op.passo * 0.49, Math.max(RAIO_MINIMO_IMPRIMIVEL, (op.pontoRel * op.passo) / 2));

  for (let i = 0; i < nLinhas; i++) {
    for (let j = 0; j < nCols; j++) {
      const antigo = buf[i][j];
      const novo = antigo > 0.5 ? 1 : 0;
      const erro = antigo - novo;
      if (j + 1 < nCols) buf[i][j + 1] += (erro * 7) / 16;
      if (i + 1 < nLinhas) {
        if (j > 0) buf[i + 1][j - 1] += (erro * 3) / 16;
        buf[i + 1][j] += (erro * 5) / 16;
        if (j + 1 < nCols) buf[i + 1][j + 1] += erro / 16;
      }
      if (novo === 1) {
        pontos.push([
          op.moldura + op.passo * (j + 0.5),
          op.moldura + op.passo * (i + 0.5),
          r,
        ]);
      }
    }
  }
  // Cobertura na densidade máxima: é o "preto" que essa combinação consegue.
  return { pontos, raio: r, cobertura: (Math.PI * r * r) / (op.passo * op.passo) };
}

/* ================================================================
   Sólidos
   ================================================================ */

function fita3d(topo, base, Y, z0, z1, saida) {
  const p = [];
  const n = topo.length;
  const P = (pt, z) => [pt[0], Y(pt[1]), z];
  for (let j = 0; j < n - 1; j++) {
    const a = topo[j], b = topo[j + 1], c = base[j], d = base[j + 1];
    quad(p, P(a, z1), P(b, z1), P(d, z1), P(c, z1));     // topo
    quad(p, P(a, z0), P(c, z0), P(d, z0), P(b, z0));     // fundo
    quad(p, P(a, z0), P(b, z0), P(b, z1), P(a, z1));     // parede de um lado
    quad(p, P(c, z0), P(c, z1), P(d, z1), P(d, z0));     // parede do outro
  }
  const t0 = topo[0], b0 = base[0], tn = topo[n - 1], bn = base[n - 1];
  quad(p, P(t0, z0), P(t0, z1), P(b0, z1), P(b0, z0));   // tampa inicial
  quad(p, P(tn, z0), P(bn, z0), P(bn, z1), P(tn, z1));   // tampa final
  anexar(saida, fechar(p));
}

function cilindro(cx, cy, r, Y, z0, z1, saida) {
  const nSeg = Math.max(10, Math.min(28, Math.round((2 * Math.PI * r) / 0.35)));
  const p = [];
  const P = (ang, z) => [cx + r * Math.cos(ang), Y(cy + r * Math.sin(ang)), z];
  const c1 = [cx, Y(cy), z1], c0 = [cx, Y(cy), z0];
  for (let a = 0; a < nSeg; a++) {
    const t0 = (2 * Math.PI * a) / nSeg, t1 = (2 * Math.PI * (a + 1)) / nSeg;
    p.push([c1, P(t0, z1), P(t1, z1)]);
    p.push([c0, P(t1, z0), P(t0, z0)]);
    quad(p, P(t0, z0), P(t1, z0), P(t1, z1), P(t0, z1));
  }
  anexar(saida, fechar(p));
}

function caixa(x0, y0, x1, y1, Y, z0, z1, saida) {
  const p = [];
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const P = (i, z) => [c[i][0], Y(c[i][1]), z];
  p.push([P(0, z1), P(1, z1), P(2, z1)], [P(0, z1), P(2, z1), P(3, z1)]);
  p.push([P(0, z0), P(2, z0), P(1, z0)], [P(0, z0), P(3, z0), P(2, z0)]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(p, P(i, z0), P(j, z0), P(j, z1), P(i, z1));
  }
  anexar(saida, fechar(p));
}

/** Anel da moldura, cantos em meia-esquadria. */
function anelMoldura(L, A, f, oy, Y, z0, z1, saida) {
  const ext = [[0, oy], [L, oy], [L, oy + A], [0, oy + A]];
  const int = [[f, oy + f], [L - f, oy + f], [L - f, oy + A - f], [f, oy + A - f]];
  const p = [];
  const E = (i, z) => [ext[i][0], Y(ext[i][1]), z];
  const I = (i, z) => [int[i][0], Y(int[i][1]), z];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(p, E(i, z1), E(j, z1), I(j, z1), I(i, z1));   // topo do anel
    quad(p, E(i, z0), I(i, z0), I(j, z0), E(j, z0));   // base do anel
    quad(p, E(i, z0), E(j, z0), E(j, z1), E(i, z1));   // parede externa
    quad(p, I(i, z0), I(i, z1), I(j, z1), I(j, z0));   // parede interna
  }
  anexar(saida, fechar(p));
}

/**
 * Aba de pendurar: uma arruela soldada no topo da moldura.
 *
 * Ela fica PRA FORA da peça de propósito. O furo precisa de vazio em volta, e
 * qualquer sólido sobreposto ali seria unido pelo fatiador — o furo entupiria.
 */
function abaDePendurar(L, furo, sobrep, Y, z0, z1, saida) {
  const rFuro = furo / 2;
  const rExt = rFuro + 3.5;
  const cx = L / 2;
  // No sistema já deslocado, a arruela ocupa de 0 a 2*rExt: o centro é rExt.
  // O deslocamento (oy = 2*rExt - sobrep) foi escolhido pra que a base dela
  // entre `sobrep` mm dentro da moldura, e o furo fique todo acima dela.
  const cy = rExt;
  const nSeg = 48;
  const p = [];
  const O = (a, z) => [cx + rExt * Math.cos(a), Y(cy + rExt * Math.sin(a)), z];
  const I = (a, z) => [cx + rFuro * Math.cos(a), Y(cy + rFuro * Math.sin(a)), z];
  for (let k = 0; k < nSeg; k++) {
    const t0 = (2 * Math.PI * k) / nSeg, t1 = (2 * Math.PI * (k + 1)) / nSeg;
    quad(p, O(t0, z1), O(t1, z1), I(t1, z1), I(t0, z1));   // face de cima
    quad(p, O(t0, z0), I(t0, z0), I(t1, z0), O(t1, z0));   // face de baixo
    quad(p, O(t0, z0), O(t1, z0), O(t1, z1), O(t0, z1));   // borda externa
    quad(p, I(t0, z0), I(t0, z1), I(t1, z1), I(t1, z0));   // parede do furo
  }
  anexar(saida, fechar(p));
  return { cx, cy, rExt, rFuro };
}

/* ================================================================
   Monta o quadro inteiro
   ================================================================ */

export function montarQuadro(op, escuridao) {
  const precisaPlaca = op.estilo !== 'linhas';
  const placa = precisaPlaca ? Math.max(0.4, op.placa) : op.placa;

  // Com aba, tudo desce pra abrir espaço em cima; a peça fica mais alta.
  const rExtAba = op.furo / 2 + 3.5;
  const sobrepAba = Math.min(3, op.moldura || 3);
  const oy = op.aba ? 2 * rExtAba - sobrepAba : 0;
  const alturaTotal = op.altura + oy;
  const Y = (y) => alturaTotal - y;

  const profMoldura = op.profMoldura || op.profundidade + 1.5;
  const zBase = placa > 0 ? placa * 0.5 : 0;
  const zTopo = placa + op.profundidade;

  const tris = [];
  const formas = { fitas: [], pontos: [], barras: [] };
  let info = {};

  if (op.estilo === 'linhas') {
    const r = fitasDeLinhas(op, escuridao);
    info = {
      passo: r.passo, espMin: r.espMin, espMax: r.espMax, qtd: r.fitas.length,
      maisFina: r.maisFina, piso: r.piso, passoInsuficiente: r.passoInsuficiente,
      folga: r.folga, folgaReal: r.folgaReal,
    };
    for (const [topo, base] of r.fitas) {
      const t = topo.map(([x, y]) => [x, y + oy]);
      const b = base.map(([x, y]) => [x, y + oy]);
      formas.fitas.push([t, b]);
      fita3d(t, b, Y, zBase, zTopo, tris);
    }
  } else {
    const r = op.estilo === 'pontos' ? pontosRedondos(op, escuridao) : pontilhado(op, escuridao);
    info = op.estilo === 'pontos'
      ? { rMax: r.rMax, qtd: r.pontos.length, omitidos: r.omitidos }
      : { raio: r.raio, qtd: r.pontos.length, cobertura: r.cobertura };
    for (const [x, y, raio] of r.pontos) {
      formas.pontos.push([x, y + oy, raio]);
      cilindro(x, y + oy, raio, Y, zBase, zTopo, tris);
    }
  }

  // Travessas depois das linhas: sobrepõem no cruzamento e o fatiador une.
  // Decisão do dono em 06/08: NENHUMA ligação entre linhas. A peça é moldura
  // mais linhas soltas. `travessasDeReforco` e `pontesEscondidas` continuam
  // implementadas acima, mas fora do caminho — quem segura a linha agora é só a
  // moldura, nas duas pontas, e a altura do relevo.
  info.vaoLivre = (op.direcao === 'vertical' ? op.altura : op.largura) - 2 * op.moldura;
  info.qtdReforco = 0;

  if (op.moldura > 0) anelMoldura(op.largura, op.altura, op.moldura, oy, Y, 0, profMoldura, tris);

  if (placa > 0) {
    // A placa entra 0,5 mm na moldura. Encostar exatamente na face deixaria a
    // malha não-manifold (mesmo motivo do fundo do vaso).
    const rec = Math.max(op.moldura - 0.5, 0);
    caixa(rec, oy + rec, op.largura - rec, oy + op.altura - rec, Y, 0, placa, tris);
  }

  let aba = null;
  if (op.aba) aba = abaDePendurar(op.largura, op.furo, sobrepAba, Y, 0, profMoldura, tris);

  return {
    tris,
    formas,
    aba,
    info,
    largura: op.largura,
    alturaTotal,
    oy,
    placa,
    profMoldura,
    volume: volume(tris) / 1000,
  };
}

/* ================================================================
   SVG (mesmas formas, pro Bambu Studio)
   ================================================================ */

export function svgDoQuadro(r, op) {
  const L = r.largura, A = r.alturaTotal, f = op.moldura, oy = r.oy;
  const p = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L}mm" height="${A}mm" ` +
      `viewBox="0 0 ${L.toFixed(3)} ${A.toFixed(3)}">`,
    '<g fill="#000000" stroke="none" fill-rule="evenodd">',
  ];

  if (r.placa > 0) {
    // Cinza de propósito: no mesmo preto do resto ela taparia o desenho.
    // Atenção: um SVG só sabe uma altura de extrusão, então a placa aqui sai
    // com a mesma altura dos pontos. Pra peça com fundo, use o STL.
    const rec = Math.max(f - 0.5, 0);
    p.push(`<rect fill="#cccccc" x="${rec.toFixed(3)}" y="${(oy + rec).toFixed(3)}" ` +
           `width="${(L - 2 * rec).toFixed(3)}" height="${(op.altura - 2 * rec).toFixed(3)}"/>`);
  }
  if (f > 0) {
    p.push(`<path d="M0,${oy.toFixed(3)} H${L.toFixed(3)} V${(oy + op.altura).toFixed(3)} H0 Z ` +
           `M${f.toFixed(3)},${(oy + f).toFixed(3)} V${(oy + op.altura - f).toFixed(3)} ` +
           `H${(L - f).toFixed(3)} V${(oy + f).toFixed(3)} Z"/>`);
  }
  if (r.aba) {
    p.push(`<path d="M${(r.aba.cx - r.aba.rExt).toFixed(3)},${r.aba.cy.toFixed(3)} ` +
           `a${r.aba.rExt},${r.aba.rExt} 0 1,0 ${(2 * r.aba.rExt).toFixed(3)},0 ` +
           `a${r.aba.rExt},${r.aba.rExt} 0 1,0 ${(-2 * r.aba.rExt).toFixed(3)},0 Z ` +
           `M${(r.aba.cx - r.aba.rFuro).toFixed(3)},${r.aba.cy.toFixed(3)} ` +
           `a${r.aba.rFuro},${r.aba.rFuro} 0 1,0 ${(2 * r.aba.rFuro).toFixed(3)},0 ` +
           `a${r.aba.rFuro},${r.aba.rFuro} 0 1,0 ${(-2 * r.aba.rFuro).toFixed(3)},0 Z"/>`);
  }
  for (const [topo, base] of r.formas.fitas) {
    const pts = topo.concat(base.slice().reverse());
    p.push(`<path d="M${pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' L')} Z"/>`);
  }
  for (const [x, y, raio] of r.formas.pontos) {
    p.push(`<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${raio.toFixed(3)}"/>`);
  }
  for (const [x0, y0, x1, y1] of r.formas.barras) {
    p.push(`<rect x="${x0.toFixed(3)}" y="${y0.toFixed(3)}" ` +
           `width="${(x1 - x0).toFixed(3)}" height="${(y1 - y0).toFixed(3)}"/>`);
  }
  p.push('</g></svg>');
  return p.join('\n');
}
