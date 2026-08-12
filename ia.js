// Integração com a API da OpenAI — usada pra gerar rascunhos de Cabeça e
// Texto Adaptado (Site/Instagram/YouTube) a partir dos OFFs já escritos
// na Lauda (ver materia.js). Chamada HTTP direta (fetch nativo do Node
// 18+), sem o SDK oficial da OpenAI — é só um POST simples, não precisa
// de mais uma dependência no projeto pra isso.
//
// Chave da API: primeiro tenta process.env.OPENAI_API_KEY; se não
// existir, cai pro arquivo local .openai_key (mesmo padrão já usado pro
// segredo do JWT em auth.js) — os dois fora do git (.gitignore).
const fs = require('fs');
const path = require('path');

const CAMINHO_CHAVE = path.join(__dirname, '.openai_key');

function obterChaveOpenAI() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    return fs.readFileSync(CAMINHO_CHAVE, 'utf8').trim();
  } catch (e) {
    return null;
  }
}

const MODELO = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Remove tags/entidades HTML básicas — os textos dos itens da Lauda são
// guardados como HTML gerado pelo editor Quill, mas o prompt pra IA
// precisa só do texto puro.
function textoPuro(html) {
  return String(html || '')
    .replace(/<\/(p|div|li|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Chama a OpenAI com um prompt pronto, devolve só o texto gerado (string).
// Lança erro com mensagem amigável em português se a chave não estiver
// configurada ou a chamada falhar — quem chama decide o status HTTP.
async function gerarTexto(prompt) {
  const chave = obterChaveOpenAI();
  if (!chave) {
    throw new Error(
      'Chave da OpenAI não configurada. Defina OPENAI_API_KEY como variável de ambiente, ' +
      'ou crie o arquivo .openai_key na raiz do projeto com a chave dentro.'
    );
  }

  const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + chave,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error('A OpenAI recusou a chamada (HTTP ' + resposta.status + '). ' + detalhe.slice(0, 300));
  }

  const dados = await resposta.json();
  const texto = dados.choices?.[0]?.message?.content;
  if (!texto) throw new Error('A OpenAI respondeu sem nenhum texto gerado.');
  return texto.trim();
}

module.exports = { gerarTexto, textoPuro };
