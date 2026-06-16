const config = require('../config');

function buildSystemPrompt(context) {
  return `You are SkyCast's weather and map assistant for an interactive map dashboard.
Always reply in the SAME language the user used (Arabic or English). If mixed, prefer the dominant language.
Understand informal wording, typos, dialect, and transliteration (e.g. "mataren", "ezay", "hows the weather").
Be concise, friendly, and practical. Use bullet points when helpful.
Topics you know: weather (temp, rain, wind, air quality/AOD), clothing advice, outdoor activities, map usage (right-click menu),
Weather Information + NASA POWER charts, markers, saved locations, compare two locations, export CSV/JSON/KML/PDF,
map layers, location tracking, search, login/signup/sync.
If the user asks something unclear, suggest 2–3 example questions in their language.
${context ? `\nCurrent weather/location context from the app:\n${context}` : ''}`;
}

async function chatWithLLM(message, context = '') {
  if (!config.openaiApiKey) {
    return null;
  }

  const baseUrl = config.openaiBaseUrl.replace(/\/$/, '');
  const model = config.openaiModel;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        { role: 'user', content: message },
      ],
      max_tokens: 700,
      temperature: 0.65,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

module.exports = { chatWithLLM, buildSystemPrompt };
