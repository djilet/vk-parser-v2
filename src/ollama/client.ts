type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OllamaChatRequest = {
  model: string;
  stream: false;
  messages: OllamaChatMessage[];
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4';

export async function generateOllamaReply(messages: OllamaChatMessage[]): Promise<string> {
  const payload: OllamaChatRequest = {
    model: OLLAMA_MODEL,
    stream: false,
    messages,
  };

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Ollama is not running. Start it with: ollama serve');
  }

  let data: OllamaChatResponse;
  try {
    data = (await response.json()) as OllamaChatResponse;
  } catch {
    throw new Error('Invalid response from Ollama');
  }

  if (!response.ok) {
    throw new Error(data.error ?? `Ollama request failed (${response.status})`);
  }

  const content = data.message?.content?.trim();
  if (!content) {
    throw new Error('Ollama returned an empty suggestion');
  }

  return content;
}
