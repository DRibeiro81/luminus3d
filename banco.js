// Guarda os projetos no banco do próprio navegador (IndexedDB).
//
// Por que não localStorage, que é mais simples: ele só guarda texto e o limite
// é de uns poucos megabytes NO TOTAL do site. Com foto da peça junto, dois ou
// três projetos já estouram — foi o que aconteceu no Retrato em Linhas. O
// IndexedDB guarda o arquivo da imagem como arquivo mesmo e tem espaço de sobra.
//
// Nada disso sai da máquina de quem usa. Quando existir servidor, a troca é
// aqui dentro: quem chama não precisa mudar.

const NOME = 'luminus3d';
const LOJA = 'projetos';
const VERSAO = 1;

let aberto = null;

function abrir() {
  if (aberto) return aberto;
  aberto = new Promise((ok, erro) => {
    const p = indexedDB.open(NOME, VERSAO);
    p.onupgradeneeded = () => {
      const bd = p.result;
      if (!bd.objectStoreNames.contains(LOJA)) {
        const loja = bd.createObjectStore(LOJA, { keyPath: 'id', autoIncrement: true });
        loja.createIndex('atualizadoEm', 'atualizadoEm');
      }
    };
    p.onsuccess = () => ok(p.result);
    p.onerror = () => erro(p.error);
  });
  return aberto;
}

function transacao(modo) {
  return abrir().then((bd) => bd.transaction(LOJA, modo).objectStore(LOJA));
}

const pedir = (req) => new Promise((ok, erro) => {
  req.onsuccess = () => ok(req.result);
  req.onerror = () => erro(req.error);
});

/** Salva um projeto novo ou atualiza o de `id`. Devolve o id. */
export async function salvar(projeto) {
  const loja = await transacao('readwrite');
  const agora = Date.now();
  const registro = { ...projeto, atualizadoEm: agora };
  if (!registro.criadoEm) registro.criadoEm = agora;
  if (registro.id == null) delete registro.id;
  return pedir(loja.put(registro));
}

/** Todos os projetos, do mais recente pro mais antigo. */
export async function listar() {
  const loja = await transacao('readonly');
  const tudo = await pedir(loja.getAll());
  return tudo.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

export async function ler(id) {
  const loja = await transacao('readonly');
  return pedir(loja.get(id));
}

export async function apagar(id) {
  const loja = await transacao('readwrite');
  return pedir(loja.delete(id));
}

/** Quanto espaço o navegador já deu e quanto está em uso, quando ele conta. */
export async function espaco() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usado: usage || 0, total: quota || 0 };
}
