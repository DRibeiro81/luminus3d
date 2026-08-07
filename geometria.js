// Geometria dos vasos, luminárias e bases. Não toca em DOM: dá pra rodar
// no navegador e no Node (é o que o teste faz).

/* ================================================================
   Utilidades de malha
   ================================================================ */

const TAU = Math.PI * 2;

/** Ponto no cilindro: raio, ângulo, altura. */
export function pt(r, ang, z) {
  return [r * Math.cos(ang), r * Math.sin(ang), z];
}

/** Emite um quadrilátero como dois triângulos, mantendo o sentido de giro. */
export function quad(saida, a, b, c, d) {
  saida.push([a, b, c], [a, c, d]);
}

/** Volume com sinal. Negativo quer dizer malha virada do avesso. */
export function volume(tris) {
  let v = 0;
  for (const [a, b, c] of tris) {
    v += (a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

/** Cada peça é fechada por construção; se saiu com as normais pra dentro,
 *  vira todas de uma vez. Evita depender de acertar o sentido em cada face. */
export function fechar(tris) {
  if (volume(tris) < 0) for (const t of tris) t.reverse();
  return tris;
}

/** push(...outro) estoura a pilha com centenas de milhares de triângulos. */
export function anexar(destino, origem) {
  for (let i = 0; i < origem.length; i++) destino.push(origem[i]);
  return destino;
}

/* ================================================================
   Primitivas
   ================================================================ */

/** Tubo: parede entre dois raios, de z0 a z1. Raios podem variar com a altura.
 *  `giro` desloca a grade angular: com 0.5 os vértices do anel deixam de cair
 *  em cima dos vértices das costelas, o que tornaria a malha não-manifold. */
export function tubo(rExtDe, parede, z0, z1, nSeg, nZ, saida = [], giro = 0) {
  const p = [];
  const zs = [], rE = [], rI = [];
  for (let k = 0; k <= nZ; k++) {
    const z = z0 + (z1 - z0) * k / nZ;
    zs.push(z); rE.push(rExtDe(z)); rI.push(rExtDe(z) - parede);
  }
  for (let a = 0; a < nSeg; a++) {
    const t0 = TAU * (a + giro) / nSeg, t1 = TAU * (a + 1 + giro) / nSeg;
    for (let k = 0; k < nZ; k++) {
      quad(p, pt(rE[k], t0, zs[k]), pt(rE[k], t1, zs[k]),
              pt(rE[k + 1], t1, zs[k + 1]), pt(rE[k + 1], t0, zs[k + 1]));      // fora
      quad(p, pt(rI[k], t0, zs[k]), pt(rI[k + 1], t0, zs[k + 1]),
              pt(rI[k + 1], t1, zs[k + 1]), pt(rI[k], t1, zs[k]));              // dentro
    }
    quad(p, pt(rE[nZ], t0, z1), pt(rE[nZ], t1, z1),
            pt(rI[nZ], t1, z1), pt(rI[nZ], t0, z1));                            // topo
    quad(p, pt(rE[0], t0, z0), pt(rI[0], t0, z0),
            pt(rI[0], t1, z0), pt(rE[0], t1, z0));                              // base
  }
  anexar(saida, fechar(p));
  return saida;
}

/** Disco cheio, de z0 a z1, raio podendo variar com o ângulo. */
export function disco(raioDe, z0, z1, nSeg, saida = []) {
  const p = [];
  const c0 = [0, 0, z0], c1 = [0, 0, z1];
  for (let a = 0; a < nSeg; a++) {
    const t0 = TAU * a / nSeg, t1 = TAU * (a + 1) / nSeg;
    const r0 = raioDe(t0), r1 = raioDe(t1);
    p.push([c1, pt(r0, t0, z1), pt(r1, t1, z1)]);        // topo
    p.push([c0, pt(r1, t1, z0), pt(r0, t0, z0)]);        // base
    quad(p, pt(r0, t0, z0), pt(r1, t1, z0), pt(r1, t1, z1), pt(r0, t0, z1));  // lateral
  }
  anexar(saida, fechar(p));
  return saida;
}

/** Revolve um perfil fechado do plano (raio, altura) em volta do eixo.
 *  Serve pra qualquer peça simétrica com rebaixos e furo no meio. */
export function revolver(perfil, nSeg, saida = []) {
  const p = [];
  for (let a = 0; a < nSeg; a++) {
    const t0 = TAU * a / nSeg, t1 = TAU * (a + 1) / nSeg;
    for (let k = 0; k < perfil.length; k++) {
      const [r0, z0] = perfil[k];
      const [r1, z1] = perfil[(k + 1) % perfil.length];
      quad(p, pt(r0, t0, z0), pt(r0, t1, z0), pt(r1, t1, z1), pt(r1, t0, z1));
    }
  }
  anexar(saida, fechar(p));
  return saida;
}

/** Uma costela vertical: fatia de parede com largura variando com a altura.
 *  É a linha do desenho em linhas, só que enrolada. */
export function costela(rExtDe, parede, thetaC, meiaLargDe, z0, z1, nZ, nArc, saida = []) {
  const p = [];
  const ext = [], int = [];
  for (let k = 0; k <= nZ; k++) {
    const z = z0 + (z1 - z0) * k / nZ;
    const r = rExtDe(z), w = meiaLargDe(z);
    const le = [], li = [];
    for (let a = 0; a <= nArc; a++) {
      const ang = thetaC - w + 2 * w * a / nArc;
      le.push(pt(r, ang, z));
      li.push(pt(r - parede, ang, z));
    }
    ext.push(le); int.push(li);
  }
  for (let k = 0; k < nZ; k++) {
    for (let a = 0; a < nArc; a++) {
      quad(p, ext[k][a], ext[k][a + 1], ext[k + 1][a + 1], ext[k + 1][a]);      // fora
      quad(p, int[k][a], int[k + 1][a], int[k + 1][a + 1], int[k][a + 1]);      // dentro
    }
    quad(p, ext[k][0], ext[k + 1][0], int[k + 1][0], int[k][0]);                // lado
    quad(p, ext[k][nArc], int[k][nArc], int[k + 1][nArc], ext[k + 1][nArc]);    // outro lado
  }
  for (let a = 0; a < nArc; a++) {
    quad(p, ext[nZ][a], ext[nZ][a + 1], int[nZ][a + 1], int[nZ][a]);            // tampa de cima
    quad(p, ext[0][a], int[0][a], int[0][a + 1], ext[0][a + 1]);                // tampa de baixo
  }
  anexar(saida, fechar(p));
  return saida;
}

/* ================================================================
   Perfil comum: como o raio varia com a altura
   ================================================================ */

export function perfilRaio(op) {
  const rB = op.diametroBase / 2, rT = op.diametroTopo / 2;
  return z => {
    const t = op.altura > 0 ? z / op.altura : 0;
    return rB + (rT - rB) * t + op.barriga * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  };
}

/** Maior inclinação da parede, em graus a partir da vertical. Acima de uns 45°
 *  a impressora começa a imprimir no ar. */
export function inclinacaoMax(raioDe, altura) {
  let pior = 0;
  const n = 120;
  for (let k = 0; k < n; k++) {
    const z0 = altura * k / n, z1 = altura * (k + 1) / n;
    const d = Math.abs(raioDe(z1) - raioDe(z0)) / (z1 - z0);
    pior = Math.max(pior, d);
  }
  return Math.atan(pior) * 180 / Math.PI;
}

/* ================================================================
   1. Vaso / cúpula com a foto em desenho em linhas
   ================================================================ */

/** escuridao[i][j] = 0..1, i = costela (dá a volta), j = altura (de baixo pra cima) */
export function vasoComFoto(op, escuridao) {
  const raioDe = perfilRaio(op);
  const nCostelas = escuridao.length, nZ = escuridao[0].length - 1;

  // perímetro médio manda no espaçamento das costelas
  let soma = 0;
  for (let k = 0; k <= 20; k++) soma += raioDe(op.altura * k / 20);
  const rMedio = soma / 21;
  const passoArco = TAU * rMedio / nCostelas;
  const espMax = Math.min(op.espMax || passoArco * 0.88, passoArco * 0.92);
  const espMin = Math.min(op.espMin, espMax);

  const tris = [];
  // fatias ao longo da largura da costela: mais que isso não muda nada, a
  // costela tem poucos milímetros de arco
  const nArc = Math.max(2, Math.min(5, Math.round(espMax / 1.2)));

  for (let i = 0; i < nCostelas; i++) {
    const thetaC = TAU * i / nCostelas;
    const meiaLargDe = z => {
      const t = Math.min(1, Math.max(0, z / op.altura)) * nZ;
      const j = Math.min(nZ - 1, Math.floor(t)), f = t - j;
      const d = escuridao[i][j] * (1 - f) + escuridao[i][j + 1] * f;
      return (espMin + (espMax - espMin) * d) / 2 / raioDe(z);
    };
    costela(raioDe, op.parede, thetaC, meiaLargDe, 0, op.altura, nZ, nArc, tris);
  }

  const nSeg = Math.max(64, nCostelas * 2);
  if (op.anel > 0) {
    tubo(raioDe, op.parede, 0, op.anel, nSeg, 6, tris, 0.5);
    tubo(raioDe, op.parede, op.altura - op.anel, op.altura, nSeg, 6, tris, 0.5);
  }
  // o fundo afunda meia parede pra dentro: encostar exatamente na face externa
  // deixaria a malha não-manifold
  if (op.fundo > 0) disco(() => raioDe(0) - op.parede * 0.5, 0, op.fundo, nSeg, tris);

  return {
    tris,
    nCostelas,
    espMin, espMax,
    passoArco,
    inclinacao: inclinacaoMax(raioDe, op.altura),
    volume: volume(tris) / 1000,
  };
}

/* ================================================================
   2. Vaso paramétrico, sem foto
   ================================================================ */

export function vasoParametrico(op) {
  const base = perfilRaio(op);
  const torcaoRad = op.torcao * Math.PI / 180;

  // Forma da seção no ângulo de referência, ou seja, já descontada a torção.
  const formaDe = a => {
    let f = 1;
    if (op.facetas >= 3) {                       // corta em polígono regular
      const setor = TAU / op.facetas;
      const meio = ((a % setor) + setor) % setor - setor / 2;
      f *= Math.cos(Math.PI / op.facetas) / Math.cos(meio);
    }
    if (op.ondulacao > 0 && op.petalas > 0) {
      f *= 1 + op.ondulacao * Math.cos(op.petalas * a);
    }
    return f;
  };

  // Resolução vem do tamanho do arco, não de um número fixo: vaso grande precisa
  // de mais fatias que vaso pequeno. `detalhe` 0.5 é a prévia, 1 é o download.
  const det = op.detalhe || 1;
  let soma = 0;
  for (let k = 0; k <= 20; k++) soma += base(op.altura * k / 20);
  const perimetro = TAU * (soma / 21);

  // divisor: com facetas ou gomos, a grade tem que cair exatamente nas quinas,
  // senão as arestas saem serrilhadas
  const div = op.facetas >= 3 ? op.facetas
            : (op.ondulacao > 0 && op.petalas > 0 ? op.petalas : 0);

  // quantas fatias o círculo precisa pra que a corda erre menos de 0,02 mm
  const rMax = Math.max(op.diametroBase, op.diametroTopo) / 2 + Math.max(0, op.barriga);
  const nCirc = Math.PI / Math.sqrt(2 * 0.02 / Math.max(5, rMax));

  let nSeg = Math.round(Math.max(nCirc, div * 18) * det);
  nSeg = Math.max(48, Math.min(320, nSeg));
  if (div >= 3) nSeg = Math.max(1, Math.round(nSeg / div)) * div;
  const nZ = Math.max(24, Math.min(300, Math.round(op.altura * det)));
  const tris = [];
  const p = [];

  const z = k => op.altura * k / nZ;
  const kFundo = Math.max(1, Math.round(nZ * op.fundo / op.altura));

  // A grade angular acompanha a torção: assim a crista da onda cai sempre no
  // mesmo índice, em qualquer altura. Com grade fixa ela escorrega entre duas
  // fatias a cada nível e a aresta sai serrilhada.
  // O `% nSeg` faz o índice nSeg virar 0 exato, fechando a emenda sem fresta.
  const P = (a, zz, dr = 0) => {
    const i = a % nSeg;
    const ref = TAU * i / nSeg;
    const ang = ref - torcaoRad * (op.altura > 0 ? zz / op.altura : 0);
    return pt(Math.max(0.2, base(zz) * formaDe(ref) + dr), ang, zz);
  };

  const par = -op.parede;
  const H = op.altura, zc = z(kFundo);

  for (let a = 0; a < nSeg; a++) {
    for (let k = 0; k < nZ; k++)                                       // parede de fora
      quad(p, P(a, z(k)), P(a + 1, z(k)), P(a + 1, z(k + 1)), P(a, z(k + 1)));

    for (let k = kFundo; k < nZ; k++)                                  // parede de dentro
      quad(p, P(a, z(k), par), P(a, z(k + 1), par),
              P(a + 1, z(k + 1), par), P(a + 1, z(k), par));

    quad(p, P(a, H), P(a + 1, H), P(a + 1, H, par), P(a, H, par));     // borda de cima
    p.push([[0, 0, 0], P(a + 1, 0), P(a, 0)]);                         // fundo por fora
    p.push([[0, 0, zc], P(a, zc, par), P(a + 1, zc, par)]);            // fundo por dentro
  }

  anexar(tris, fechar(p));
  return {
    tris,
    inclinacao: inclinacaoMax(z => base(z), op.altura),
    volume: volume(tris) / 1000,
  };
}

/* ================================================================
   3. Base da luminária
   ================================================================ */

export function baseLuminaria(op) {
  const avisos = [];
  const rf = op.furoFio / 2;
  let rLed = op.diametroLed / 2;
  let encIn = op.diametroPeca / 2 - op.paredePeca - op.folga / 2;
  let encOut = op.diametroPeca / 2 + op.folga / 2;
  const rExt = encOut + op.bordaExterna;

  if (encIn <= rLed + 2) {          // o rebaixo do LED comeria a canaleta
    rLed = Math.max(rf + 3, encIn - 3);
    avisos.push("Diminuí o alojamento do LED pra caber antes da canaleta de encaixe.");
  }
  if (rLed <= rf + 1) {
    avisos.push("O furo do fio é grande demais pro alojamento do LED nessa peça.");
  }

  const H = op.alturaBase;
  const dEnc = Math.min(op.profundidadeEncaixe, H - 3);
  const dLed = Math.min(op.profundidadeLed, H - 3);

  // perfil fechado no plano (raio, altura), percorrido do centro pra fora
  const perfil = [
    [rf, 0], [rExt, 0],                        // face de baixo
    [rExt, H],                                 // parede externa
    [encOut, H],                               // topo, borda externa
    [encOut, H - dEnc], [encIn, H - dEnc],     // canaleta onde a peça encaixa
    [encIn, H],
    [rLed, H],                                 // topo, até o alojamento do LED
    [rLed, H - dLed], [rf, H - dLed],          // alojamento do anel de LED
  ];

  const tris = revolver(perfil, 180);
  return { tris, avisos, encIn, encOut, rExt, volume: volume(tris) / 1000 };
}

/* ================================================================
   STL binário
   ================================================================ */

export function escreverStl(tris, titulo = "luminus 3d") {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  const cab = new TextEncoder().encode(titulo);
  new Uint8Array(buf, 0, 80).set(cab.subarray(0, 80));
  dv.setUint32(80, tris.length, true);

  let off = 84;
  for (const t of tris) {
    const [a, b, c] = t;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1];
    let ny = u[2] * v[0] - u[0] * v[2];
    let nz = u[0] * v[1] - u[1] * v[0];
    const m = Math.hypot(nx, ny, nz);
    if (m > 1e-12) { nx /= m; ny /= m; nz /= m; } else { nx = 0; ny = 0; nz = 1; }
    dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true);
    off += 12;
    for (const p of t) {
      dv.setFloat32(off, p[0], true);
      dv.setFloat32(off + 4, p[1], true);
      dv.setFloat32(off + 8, p[2], true);
      off += 12;
    }
    dv.setUint16(off, 0, true); off += 2;
  }
  return buf;
}

/* ================================================================
   4. Luminárias: parede vazada, topo fechado e cúpulas
   ================================================================ */

/**
 * Raio da peça em função da altura e do ângulo de REFERÊNCIA (sem torção).
 * Separado do `vasoParametrico` pra a parede vazada usar exatamente a mesma
 * forma — facetas, ondulação e barriga valem igual nas duas.
 */
export function formaDaPeca(op) {
  const base = perfilRaio(op);
  const torcaoRad = (op.torcao || 0) * Math.PI / 180;

  const perfilAngular = (a) => {
    let f = 1;
    if (op.facetas >= 3) {
      const setor = TAU / op.facetas;
      const meio = ((a % setor) + setor) % setor - setor / 2;
      f *= Math.cos(Math.PI / op.facetas) / Math.cos(meio);
    }
    if (op.ondulacao > 0 && op.petalas > 0) f *= 1 + op.ondulacao * Math.cos(op.petalas * a);
    return f;
  };

  return {
    raio: (z, aRef) => base(z) * perfilAngular(aRef),
    // A grade acompanha a torção: assim a crista da onda cai sempre no mesmo
    // índice, em qualquer altura (ver lição da grade helicoidal).
    angulo: (z, aRef) => aRef - torcaoRad * (op.altura > 0 ? z / op.altura : 0),
    base,
  };
}

/** Faixa fechada de parede, de z0 a z1: dá a volta inteira. */
function faixa(fp, parede, z0, z1, nSeg, nZ, saida) {
  const p = [];
  const P = (i, k, dr) => {
    const aRef = TAU * (i % nSeg) / nSeg;
    const z = z0 + (z1 - z0) * k / nZ;
    return pt(Math.max(0.2, fp.raio(z, aRef) + dr), fp.angulo(z, aRef), z);
  };
  for (let i = 0; i < nSeg; i++) {
    for (let k = 0; k < nZ; k++) {
      quad(p, P(i, k, 0), P(i + 1, k, 0), P(i + 1, k + 1, 0), P(i, k + 1, 0));
      quad(p, P(i, k, -parede), P(i, k + 1, -parede), P(i + 1, k + 1, -parede), P(i + 1, k, -parede));
    }
    quad(p, P(i, nZ, 0), P(i + 1, nZ, 0), P(i + 1, nZ, -parede), P(i, nZ, -parede));   // topo
    quad(p, P(i, 0, 0), P(i, 0, -parede), P(i + 1, 0, -parede), P(i + 1, 0, 0));       // base
  }
  anexar(saida, fechar(p));
}

/**
 * Ripa: pedaço de parede entre dois ângulos, de z0 a z1. `desvio` gira o centro
 * conforme sobe — é o que faz a treliça diagonal.
 */
function ripa(fp, parede, aCentro, meiaLarg, z0, z1, desvio, nZ, nArc, saida) {
  const p = [];
  const P = (a, k, dr) => {
    const t = k / nZ;
    const z = z0 + (z1 - z0) * t;
    const aRef = aCentro - meiaLarg + 2 * meiaLarg * a / nArc + desvio * t;
    return pt(Math.max(0.2, fp.raio(z, aRef) + dr), fp.angulo(z, aRef), z);
  };
  for (let k = 0; k < nZ; k++) {
    for (let a = 0; a < nArc; a++) {
      quad(p, P(a, k, 0), P(a + 1, k, 0), P(a + 1, k + 1, 0), P(a, k + 1, 0));
      quad(p, P(a, k, -parede), P(a, k + 1, -parede), P(a + 1, k + 1, -parede), P(a + 1, k, -parede));
    }
    // Laterais da ripa. A ordem é o inverso do que parece natural: a face do
    // lado de ângulo MENOR aponta pra fora no sentido contrário ao do giro.
    quad(p, P(0, k, 0), P(0, k + 1, 0), P(0, k + 1, -parede), P(0, k, -parede));
    quad(p, P(nArc, k, 0), P(nArc, k, -parede), P(nArc, k + 1, -parede), P(nArc, k + 1, 0));
  }
  for (let a = 0; a < nArc; a++) {
    quad(p, P(a, nZ, 0), P(a + 1, nZ, 0), P(a + 1, nZ, -parede), P(a, nZ, -parede));
    quad(p, P(a, 0, 0), P(a, 0, -parede), P(a + 1, 0, -parede), P(a + 1, 0, 0));
  }
  anexar(saida, fechar(p));
}

/** Tampa plana no topo com furo no meio — pra luminária pendente. */
function tampaComFuro(fp, z, rFuro, nSeg, espessura, saida) {
  const p = [];
  const P = (i, dz, furo) => {
    const aRef = TAU * (i % nSeg) / nSeg;
    return furo
      ? pt(rFuro, TAU * (i % nSeg) / nSeg, z + dz)
      : pt(fp.raio(z, aRef), fp.angulo(z, aRef), z + dz);
  };
  for (let i = 0; i < nSeg; i++) {
    quad(p, P(i, espessura, false), P(i + 1, espessura, false), P(i + 1, espessura, true), P(i, espessura, true));
    quad(p, P(i, 0, false), P(i, 0, true), P(i + 1, 0, true), P(i + 1, 0, false));
    quad(p, P(i, 0, false), P(i + 1, 0, false), P(i + 1, espessura, false), P(i, espessura, false));
    quad(p, P(i, 0, true), P(i, espessura, true), P(i + 1, espessura, true), P(i + 1, 0, true));
  }
  anexar(saida, fechar(p));
}

/**
 * Luminária de parede vazada. Sem CSG: em vez de furar a parede, ela é montada
 * SÓ com o material — faixas fechadas em cima e embaixo, e entre elas as ripas.
 * O furo é o que sobra. É a mesma ideia do meio tom dos quadros.
 */
export function luminariaVazada(op) {
  const fp = formaDaPeca(op);
  const H = op.altura;
  const parede = op.parede;
  const det = op.detalhe || 1;

  const rMax = Math.max(op.diametroBase, op.diametroTopo) / 2 + Math.max(0, op.barriga);
  let nSeg = Math.round(Math.PI / Math.sqrt(2 * 0.02 / Math.max(5, rMax)) * det);
  const div = op.facetas >= 3 ? op.facetas : (op.ondulacao > 0 && op.petalas > 0 ? op.petalas : 0);
  nSeg = Math.max(48, Math.min(320, nSeg));
  if (div >= 3) nSeg = Math.max(1, Math.round(nSeg / div)) * div;

  const tris = [];
  const bandaB = Math.max(op.bandaBase ?? 8, parede);
  const bandaT = Math.max(op.bandaTopo ?? 8, parede);
  const zA = op.fundo > 0 ? op.fundo : 0;

  if (op.fundo > 0) disco((a) => fp.raio(0, a), 0, op.fundo, nSeg, tris);
  faixa(fp, parede, zA, zA + bandaB, nSeg, Math.max(2, Math.round(bandaB * det)), tris);
  faixa(fp, parede, H - bandaT, H, nSeg, Math.max(2, Math.round(bandaT * det)), tris);

  const z0 = zA + bandaB, z1 = H - bandaT;
  const vaoZ = Math.max(0, z1 - z0);
  const nZ = Math.max(6, Math.round(vaoZ * det));

  // Ripas verticais (ou inclinadas, na treliça). O perímetro médio manda na
  // quantidade, pra ripa e furo ficarem no mesmo tamanho em peça grande e pequena.
  let soma = 0;
  for (let k = 0; k <= 20; k++) soma += fp.base(H * k / 20);
  const perimetro = TAU * (soma / 21);
  const nRipas = Math.max(4, Math.round(perimetro / Math.max(op.passoVazado, parede * 2)));
  const meiaLarg = (op.largRipa / (soma / 21)) / 2;      // largura em mm -> radianos
  const nArc = 3;

  if (vaoZ > 1) {
    const desvio = (op.trelica ? 1 : 0) * (TAU / nRipas) * op.inclinacaoRipa;
    for (let i = 0; i < nRipas; i++) {
      const aC = TAU * i / nRipas;
      ripa(fp, parede, aC, meiaLarg, z0, z1, desvio, nZ, nArc, tris);
      // Treliça: a segunda família cruza a primeira e forma o losango. Ela sai
      // meio passo deslocada — nascendo no mesmo ângulo, as duas ficariam
      // ponto a ponto sobrepostas na base e a malha viraria não-manifold.
      if (op.trelica) {
        // 0,02 mm mais pra fora: no cruzamento as duas ripas têm o MESMO ângulo
        // e o mesmo raio, e as superfícies coincidiriam ponto a ponto. Afastadas,
        // elas se sobrepõem — que o fatiador une sem reclamar.
        const fora = { ...fp, raio: (z, a) => fp.raio(z, a) + 0.02 };
        ripa(fora, parede, aC + Math.PI / nRipas, meiaLarg, z0, z1, -desvio, nZ, nArc, tris);
      }
    }
    // Anéis intermediários fecham a grade (retângulos em vez de ranhuras longas).
    const nAneis = Math.max(0, Math.round(op.aneis || 0));
    for (let j = 1; j <= nAneis; j++) {
      const zc = z0 + (vaoZ * j) / (nAneis + 1);
      // Sem valor vindo de fora, o anel fica da mesma espessura da ripa: a grade
      // sai uniforme. Antes isto era Math.max(undefined, parede) = NaN, e malha
      // com NaN não desenha nada — some da tela sem erro nenhum.
      const h = Math.max(op.alturaAnel ?? op.largRipa, parede);
      faixa(fp, parede, zc - h / 2, zc + h / 2, nSeg, Math.max(2, Math.round(h * det)), tris);
    }
  }

  if (op.topoFechado) {
    tampaComFuro(fp, H - parede, Math.max(1, op.furoTopo / 2), nSeg, parede, tris);
  }

  return {
    tris,
    nRipas: nRipas * (op.trelica ? 2 : 1),
    vaoZ,
    inclinacao: inclinacaoMax((z) => fp.base(z), H),
    volume: volume(tris) / 1000,
  };
}
