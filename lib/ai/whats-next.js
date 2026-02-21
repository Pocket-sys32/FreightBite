const { callOpenAI, DEFAULT_MODEL } = require('./openai-client');

function stripCodeFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

async function getRecommendation({ driver, nearbyLoads }) {
  const prompt = `Truck driver just finished a leg. They're in ${driver.currentCity}.\nHome is ${driver.homeMilesAway} miles away in ${driver.homeCity}.\nAvailable loads near them:\n${JSON.stringify(nearbyLoads, null, 2)}\n\nShould they drive home (is there a load going that direction?) or stay on the road (is there a high-paying load nearby)?\nReturn JSON: { \"recommendation\": \"HOME\" or \"STAY\", \"topLoad\": <the best load object or null>, \"reasoning\": \"1-2 sentence explanation\" }`;

  const text = await callOpenAI({
    maxCompletionTokens: 320,
    temperature: 0.2,
    jsonMode: true,
    system: `You are a freight logistics AI using model ${DEFAULT_MODEL}. Always respond with valid JSON only, no markdown.`,
    user: prompt
  });

  const normalized = stripCodeFences(text);

  try {
    const parsed = JSON.parse(normalized);
    if (parsed?.recommendation !== 'HOME' && parsed?.recommendation !== 'STAY') {
      return { recommendation: 'UNKNOWN', topLoad: null, reasoning: parsed?.reasoning || normalized };
    }

    return {
      recommendation: parsed.recommendation,
      topLoad: parsed.topLoad ?? null,
      reasoning: parsed.reasoning || ''
    };
  } catch {
    return { recommendation: 'UNKNOWN', topLoad: null, reasoning: normalized };
  }
}

module.exports = { getRecommendation };
