// Do not load dotenv here. The server (server.js) must load .env.local from project root
// so OPENAI_API_KEY comes from there only. We read and cache the key once when this
// module is first required (after server.js has loaded env) so nothing can override it.
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const OPENAI_API_KEY_CACHED = process.env.OPENAI_API_KEY || null;

function requireApiKey() {
  if (!OPENAI_API_KEY_CACHED || typeof OPENAI_API_KEY_CACHED !== 'string' || !OPENAI_API_KEY_CACHED.trim()) {
    throw new Error('OPENAI_API_KEY is not set. Set it in the project root .env.local and restart the server.');
  }
  return OPENAI_API_KEY_CACHED.trim();
}

async function callOpenAI({
  system,
  user,
  maxCompletionTokens = 300,
  temperature = 0.2,
  jsonMode = false
}) {
  const apiKey = requireApiKey();

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    max_completion_tokens: maxCompletionTokens,
    temperature
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const rawMessage = payload?.error?.message || `OpenAI request failed with status ${response.status}`;
    const isKeyError = /incorrect.*api key|invalid.*api key|invalid_api_key/i.test(rawMessage);
    const message = isKeyError
      ? `${rawMessage} Ensure OPENAI_API_KEY in the project root .env.local is valid and the backend server is started from the project root. Get a key at https://platform.openai.com/account/api-keys`
      : rawMessage;
    throw new Error(message);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('OpenAI returned an empty response');
  }

  return text.trim();
}

module.exports = {
  callOpenAI,
  DEFAULT_MODEL
};
