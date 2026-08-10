// Visor 3D compartilhado: WebGL puro, sem biblioteca. Arrasta pra girar, rola
// pra aproximar.
//
// Dois modos. `solido` é o vaso: ouro fosco, forma lida pela luz batendo.
// `luz` é a litofania: a peça tem espessura variável e o que interessa é a luz
// ATRAVESSANDO — então a cor vem da espessura em cada ponto, não da normal.
// Sem isso, a cúpula apareceria como um cilindro liso e a foto sumiria.

export function criarVisor(canvas, opcoes = {}) {
  const fundo = opcoes.fundo || [0.086, 0.094, 0.110];
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) return { ok: false, enviar() {}, desenhar() {}, ajustar() {} };

  const vs = `
    attribute vec3 pos; attribute vec3 nor; attribute float esp; attribute vec3 tinta;
    uniform mat4 mvp, mv;
    varying vec3 vn, vp, vt; varying float ve;
    void main() {
      vn = mat3(mv) * nor; vp = (mv * vec4(pos, 1.0)).xyz; ve = esp; vt = tinta;
      gl_Position = mvp * vec4(pos, 1.0);
    }`;

  const fs = `
    precision mediump float;
    varying vec3 vn, vp, vt; varying float ve;
    uniform int modo;          // 0 sólido, 1 acesa, 2 apagada, 3 duas cores, 4 cor por peça
    uniform float espMin, espMax;
    void main() {
      vec3 n = normalize(vn);
      if (!gl_FrontFacing) n = -n;
      float d = max(dot(n, normalize(vec3(0.35, 0.5, 0.9))), 0.0);
      float c = max(dot(n, normalize(vec3(-0.6, -0.3, 0.4))), 0.0);
      float borda = pow(1.0 - max(dot(n, normalize(-vp)), 0.0), 3.5);

      if (modo == 3) {
        // Duas cores: o atributo de espessura chega como 1 no relevo da letra
        // e 0 no corpo. É só pra tela — a peça sai numa malha só, e quem separa
        // as cores é a troca de filamento na impressora.
        // (nada de crase aqui dentro: o shader mora num template literal)
        vec3 base = mix(vec3(0.86, 0.42, 0.16), vec3(0.94, 0.94, 0.92), step(0.5, ve));
        vec3 cor = base * (0.34 + 0.66 * d)
                 + vec3(0.10, 0.11, 0.14) * c
                 + vec3(0.12, 0.12, 0.12) * borda;
        gl_FragColor = vec4(cor, 1.0);
        return;
      }

      if (modo == 4) {
        // mesma luz do sólido, com a cor que a peça carrega
        vec3 cor = vt * (0.34 + 0.66 * d)
                 + vec3(0.13, 0.16, 0.22) * c
                 + vt * 0.22 * borda;
        gl_FragColor = vec4(cor, 1.0);
        return;
      }

      if (modo == 0) {
        vec3 cor = vec3(0.86, 0.70, 0.40) * (0.32 + 0.68 * d)
                 + vec3(0.14, 0.17, 0.24) * c
                 + vec3(0.16, 0.14, 0.10) * borda;
        gl_FragColor = vec4(cor, 1.0);
        return;
      }

      // quanto mais grossa, menos luz passa
      float f = clamp((ve - espMin) / max(0.001, espMax - espMin), 0.0, 1.0);
      // a borda vira de lado: a luz atravessa mais material e o brilho cai
      float face = pow(max(dot(n, normalize(-vp)), 0.0), 0.6);
      if (modo == 1) {
        float luz = pow(1.0 - f, 1.1) * face;
        gl_FragColor = vec4(vec3(1.0, 0.965, 0.882) * luz, 1.0);
      } else {
        // apagada é PLA branco: quase tudo igual, com relevo de leve
        float v = (0.84 - f * 0.10) * (0.45 + 0.55 * (0.32 + 0.68 * d));
        gl_FragColor = vec4(v, v, v * 0.99, 1.0);
      }
    }`;

  const compilar = (tipo, src) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compilar(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.enable(gl.DEPTH_TEST);

  const bufPos = gl.createBuffer(), bufNor = gl.createBuffer(), bufEsp = gl.createBuffer();
  const bufTinta = gl.createBuffer();
  let nVerts = 0, alcance = 100, centro = [0, 0, 0], tamanho = [100, 100, 100];
  let modo = 0, espMin = 0, espMax = 1;
  // Giro inicial: o vaso abre num três-quartos; a litofania precisa nascer
  // olhando o MEIO da foto, senão o rosto fica atrás e parece que não funcionou.
  let giro = opcoes.giroInicial !== undefined ? opcoes.giroInicial : -0.6;
  // `dist` é múltiplo da maior medida da peça. Peça alta e estreita cabe com 3;
  // peça larga e baixa, como um nome deitado, some na tela nessa distância.
  let inclina = opcoes.inclinaInicial !== undefined ? opcoes.inclinaInicial : -1.15;
  let dist = opcoes.distInicial !== undefined ? opcoes.distInicial : 3.0;
  let arrastando = false, ax = 0, ay = 0;

  /* matrizes 4x4 em coluna: o mínimo pra montar a câmera */
  const mult = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + l] * b[c * 4 + k];
      o[c * 4 + l] = s;
    }
    return o;
  };
  const perspectiva = (fov, asp, n, f) => {
    const t = 1 / Math.tan(fov / 2);
    return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]);
  };
  const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
  const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
  const mover = (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);

  /**
   * Normal média por ponto, mas só entre faces que quase se alinham: a curva
   * fica lisa e a quina continua sendo quina.
   * `espessuras` é opcional — um valor por vértice, na ordem dos triângulos.
   */
  function enviar(tris, espessuras, tintas) {
    const n = tris.length;
    const pos = new Float32Array(n * 9);
    const nor = new Float32Array(n * 9);
    const esp = new Float32Array(n * 3);
    // cor por TRIÂNGULO, repetida nos três vértices. Sem isso o modelador só
    // sabia mostrar a peça inteira de uma cor, e o modo em que a cor manda na
    // altura não tinha como ser conferido no 3D.
    const tin = new Float32Array(n * 9);
    const faceN = new Float32Array(n * 3);
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];

    // chave numérica: com centenas de milhares de vértices, string domina o tempo
    const K = 100, D = 65536, M = 32768;   // cobre ±327 mm
    const chave = (p) => ((Math.round(p[0] * K) + M) * D + (Math.round(p[1] * K) + M)) * D
                       + (Math.round(p[2] * K) + M);
    const soma = new Map();

    for (let t = 0; t < n; t++) {
      const [a, b, c] = tris[t];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
      const m = Math.hypot(nx, ny, nz) || 1;
      nx /= m; ny /= m; nz /= m;
      faceN[t * 3] = nx; faceN[t * 3 + 1] = ny; faceN[t * 3 + 2] = nz;
      for (const p of [a, b, c]) {
        const ch = chave(p);
        const s = soma.get(ch);
        if (s) { s[0] += nx; s[1] += ny; s[2] += nz; }
        else soma.set(ch, [nx, ny, nz]);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
    }

    let i = 0, e = 0;
    for (let t = 0; t < n; t++) {
      const fx = faceN[t * 3], fy = faceN[t * 3 + 1], fz = faceN[t * 3 + 2];
      for (const p of tris[t]) {
        const s = soma.get(chave(p));
        let mx = s[0], my = s[1], mz = s[2];
        const mm = Math.hypot(mx, my, mz) || 1;
        mx /= mm; my /= mm; mz /= mm;
        // 0,85 ≈ 32°. Com 0,55 (57°) uma quina reta passava por curva: o
        // vértice do canto da face da frente misturava a normal dela com a da
        // parede lateral, e a peça de texto — que é toda quina reta — saía
        // parecendo um monte de tubos empilhados em vez de uma frente lisa.
        if (mx * fx + my * fy + mz * fz < 0.85) { mx = fx; my = fy; mz = fz; }
        pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
        nor[i] = mx; nor[i + 1] = my; nor[i + 2] = mz;
        esp[e] = espessuras ? espessuras[e] : 0;
        if (tintas) { const c = tintas[t]; tin[i] = c[0]; tin[i + 1] = c[1]; tin[i + 2] = c[2]; }
        i += 3; e += 1;
      }
    }

    nVerts = n * 3;
    alcance = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 100;
    // Centra nos TRÊS eixos. O vaso já nasce em volta do eixo, mas peça montada
    // a partir de imagem nasce no canto — sem isso ela gira em torno de um
    // ponto fora dela e sai da tela ao primeiro arrasto.
    centro = [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2];
    tamanho = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor); gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufEsp); gl.bufferData(gl.ARRAY_BUFFER, esp, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufTinta); gl.bufferData(gl.ARRAY_BUFFER, tin, gl.STATIC_DRAW);
  }

  function ajustar(cfg) {
    if (cfg.modo !== undefined) modo = cfg.modo;
    if (cfg.espMin !== undefined) espMin = cfg.espMin;
    if (cfg.espMax !== undefined) espMax = cfg.espMax;
  }

  function desenhar() {
    if (!nVerts) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(fundo[0], fundo[1], fundo[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Enquadrar de verdade: a distância vem da largura E da altura da peça
    // contra a abertura da lente. Sem isso, peça comprida e baixa (um nome
    // deitado) fica minúscula no meio da tela, porque a conta usava só a maior
    // medida dela.
    // Lente. 0,6 rad é o padrão do vaso. Peça comprida precisa de lente mais
    // fechada: com a aberta, a abertura horizontal passa de 90° e a perspectiva
    // estica as pontas a ponto da gente enxergar por dentro das letras.
    const fov = opcoes.fov || 0.6;
    const t = Math.tan(fov / 2);
    const asp = canvas.width / canvas.height;
    const base = opcoes.enquadrar
      ? Math.max(tamanho[0] / 2 / (t * asp), tamanho[2] / 2 / t) * 1.12
      : alcance;
    const camera = base * dist;

    const mv = mult(mover(0, 0, -camera),
                mult(rotX(inclina), mult(rotZ(giro), mover(-centro[0], -centro[1], -centro[2]))));
    // Perto e longe colados na peça. Com near = 5% e far = 20× da medida, a
    // precisão do buffer de profundidade some e superfícies que se encostam na
    // mesma profundidade piscam uma por cima da outra — na peça de texto isso
    // saía como uma listra por faixa da malha.
    const raio = Math.hypot(tamanho[0], tamanho[1], tamanho[2]) / 2;
    const perto = Math.max(camera * 0.02, camera - raio * 1.2);
    const longe = camera + raio * 2.5;
    const mvp = mult(perspectiva(fov, asp, perto, longe), mv);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'mvp'), false, mvp);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'mv'), false, mv);
    gl.uniform1i(gl.getUniformLocation(prog, 'modo'), modo);
    gl.uniform1f(gl.getUniformLocation(prog, 'espMin'), espMin);
    gl.uniform1f(gl.getUniformLocation(prog, 'espMax'), espMax);

    for (const [nome, buf, tam] of [['pos', bufPos, 3], ['nor', bufNor, 3], ['esp', bufEsp, 1],
                                    ['tinta', bufTinta, 3]]) {
      const loc = gl.getAttribLocation(prog, nome);
      if (loc < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, tam, gl.FLOAT, false, 0, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, nVerts);
  }

  canvas.addEventListener('pointerdown', (e) => {
    arrastando = true; ax = e.clientX; ay = e.clientY; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    arrastando = false; canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!arrastando) return;
    giro += (e.clientX - ax) * 0.01;
    inclina = Math.max(-Math.PI, Math.min(0, inclina + (e.clientY - ay) * 0.01));
    ax = e.clientX; ay = e.clientY;
    desenhar();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    dist = Math.max(0.5, Math.min(8, dist * (1 + e.deltaY * 0.001)));
    desenhar();
  }, { passive: false });
  window.addEventListener('resize', desenhar);
  // O canvas mede o espaço na hora de desenhar. Se ele desenhou antes do layout
  // assentar, o buffer fica num tamanho e o CSS estica pra outro — a peça sai
  // achatada e cortada nas pontas, parecendo distorção de lente. Redesenhar
  // quando o espaço muda resolve, e é barato: só dispara quando muda mesmo.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => desenhar()).observe(canvas);
  }

  return { ok: true, enviar, desenhar, ajustar };
}
