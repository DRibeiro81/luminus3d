// Escreve um PDF na mão, sem biblioteca nenhuma.
//
// Por que na mão: o site é servido como arquivo estático e não carrega nada de
// fora. E `window.print()` obrigaria o cliente a passar pela caixa de impressão
// do sistema e escolher "salvar como PDF" — aqui o arquivo baixa num clique.
//
// O que dá pra fazer: texto em Helvetica (normal e negrito), linha, retângulo e
// imagem JPEG. Só isso, que é o que um orçamento precisa.
//
// Fonte da base do PDF não precisa ser embutida: Helvetica é uma das 14 que todo
// leitor tem. Com WinAnsiEncoding ela cobre acento português inteiro.

const A4 = { largura: 595.28, altura: 841.89 };   // em pontos, 72 por polegada

/** Latin-1 (WinAnsi) byte a byte, com escape do que o PDF trata como sintaxe. */
function textoPdf(s) {
  let saida = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') saida += '\\' + ch;
    else if (c < 256) saida += ch;
    else saida += '?';                 // fora do Latin-1: não dá pra representar
  }
  return saida;
}

function bytesDeTexto(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

/**
 * Monta o documento. Uso:
 *   const p = novoPdf();
 *   p.texto('Olá', 40, 800, { tamanho: 14, negrito: true });
 *   p.baixar('orcamento.pdf');
 */
export function novoPdf(pagina = A4) {
  const ops = [];            // fluxo de conteúdo
  const imagens = [];        // {nome, bytes, largura, altura}
  let corAtual = null;

  const y = (v) => pagina.altura - v;   // conta de cima pra baixo, que é como se pensa

  function cor(hex) {
    if (hex === corAtual) return;
    corAtual = hex;
    const n = parseInt(hex.replace('#', ''), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  }

  return {
    pagina,
    texto(txt, x, topo, op = {}) {
      const tam = op.tamanho || 11;
      cor(op.cor || '#000000');
      ops.push('BT', `/${op.negrito ? 'F2' : 'F1'} ${tam} Tf`,
               `1 0 0 1 ${x.toFixed(2)} ${y(topo).toFixed(2)} Tm`,
               `(${textoPdf(txt)}) Tj`, 'ET');
    },
    /** Texto encostado à direita de `x`. Serve pra coluna de valores. */
    textoDireita(txt, x, topo, op = {}) {
      const tam = op.tamanho || 11;
      // Helvetica tem largura variável; 0,5 do tamanho é a média que basta pra
      // alinhar coluna de dinheiro sem embutir a tabela de larguras da fonte.
      const largura = String(txt).length * tam * (op.negrito ? 0.54 : 0.5);
      this.texto(txt, x - largura, topo, op);
    },
    linha(x1, topo1, x2, topo2, op = {}) {
      cor(op.cor || '#cccccc');
      ops.push(`${(op.espessura || 0.7).toFixed(2)} w`,
               `${x1.toFixed(2)} ${y(topo1).toFixed(2)} m`,
               `${x2.toFixed(2)} ${y(topo2).toFixed(2)} l`, 'S');
    },
    retangulo(x, topo, larg, alt, op = {}) {
      cor(op.cor || '#eeeeee');
      ops.push(`${x.toFixed(2)} ${y(topo + alt).toFixed(2)} ${larg.toFixed(2)} ${alt.toFixed(2)} re`,
               op.contorno ? 'S' : 'f');
    },
    /** `jpeg` é um Uint8Array com o arquivo JPEG inteiro. */
    imagem(jpeg, larguraPx, alturaPx, x, topo, larg, alt) {
      const nome = `Im${imagens.length + 1}`;
      imagens.push({ nome, bytes: jpeg, largura: larguraPx, altura: alturaPx });
      ops.push('q', `${larg.toFixed(2)} 0 0 ${alt.toFixed(2)} ${x.toFixed(2)} ${y(topo + alt).toFixed(2)} cm`,
               `/${nome} Do`, 'Q');
      corAtual = null;      // `q`/`Q` devolve a cor anterior; força reescrever
    },

    montar() {
      const conteudo = bytesDeTexto(ops.join('\n'));
      const objetos = [];   // cada um vira "N 0 obj ... endobj"

      // 1..5 são catálogo, páginas, página e as duas fontes; 6 é o conteúdo.
      // As imagens começam no 7 — apontar pro 6 aqui faz o leitor procurar a
      // imagem no fluxo de conteúdo e não desenhar nada, sem erro nenhum.
      const PRIMEIRA_IMAGEM = 7;
      const recImg = imagens.length
        ? '/XObject<<' + imagens.map((im, i) => `/${im.nome} ${PRIMEIRA_IMAGEM + i} 0 R`).join('') + '>>'
        : '';
      objetos.push('<</Type/Catalog/Pages 2 0 R>>');
      objetos.push('<</Type/Pages/Kids[3 0 R]/Count 1>>');
      objetos.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pagina.largura} ${pagina.altura}]`
                 + `/Resources<</Font<</F1 4 0 R/F2 5 0 R>>${recImg}>>/Contents 6 0 R>>`);
      objetos.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>');
      objetos.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>');

      // O fluxo de conteúdo e as imagens carregam dados binários, então não dá
      // pra montar tudo como texto: vai pedaço a pedaço, contando os bytes.
      const pedacos = [];
      let tam = 0;
      const por = (x) => {
        const b = typeof x === 'string' ? bytesDeTexto(x) : x;
        pedacos.push(b); tam += b.length; return b.length;
      };

      por('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const desvios = [];

      objetos.forEach((corpo, i) => {
        desvios.push(tam);
        por(`${i + 1} 0 obj\n${corpo}\nendobj\n`);
      });

      // 6: o conteúdo
      desvios.push(tam);
      por(`${objetos.length + 1} 0 obj\n<</Length ${conteudo.length}>>\nstream\n`);
      por(conteudo);
      por('\nendstream\nendobj\n');

      // 7 em diante: as imagens
      imagens.forEach((im, i) => {
        desvios.push(tam);
        por(`${objetos.length + 2 + i} 0 obj\n<</Type/XObject/Subtype/Image`
          + `/Width ${im.largura}/Height ${im.altura}/ColorSpace/DeviceRGB`
          + `/BitsPerComponent 8/Filter/DCTDecode/Length ${im.bytes.length}>>\nstream\n`);
        por(im.bytes);
        por('\nendstream\nendobj\n');
      });

      const n = desvios.length + 1;
      const inicioXref = tam;
      let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
      for (const d of desvios) xref += String(d).padStart(10, '0') + ' 00000 n \n';
      por(xref);
      por(`trailer\n<</Size ${n}/Root 1 0 R>>\nstartxref\n${inicioXref}\n%%EOF\n`);

      const fim = new Uint8Array(tam);
      let p = 0;
      for (const b of pedacos) { fim.set(b, p); p += b.length; }
      return fim;
    },

    baixar(nome) {
      const url = URL.createObjectURL(new Blob([this.montar()], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = nome; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
}

/** Converte qualquer imagem carregada num JPEG, que é o formato que o PDF lê direto. */
export async function paraJpeg(fonte, maiorLado = 900, qualidade = 0.85) {
  const bitmap = await createImageBitmap(fonte);
  const escala = Math.min(1, maiorLado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  // JPEG não tem transparência: fundo branco, senão o transparente vira preto
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
  c.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', qualidade));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), largura: w, altura: h, blob };
}
