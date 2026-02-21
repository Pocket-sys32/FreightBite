const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getRecommendation({ driver, nearbyLoads }) {
  const prompt = `Truck driver just finished a leg. They're in ${driver.currentCity}.
Home is ${driver.homeMilesAway} miles away in ${driver.homeCity}.
Available loads near them:
${JSON.stringify(nearbyLoads, null, 2)}

Should they drive home (is there a load going that direction?) or stay on the road (is there a high-paying load nearby)?
Return JSON: { "recommendation": "HOME" or "STAY", "topLoad": <the best load object or null>, "reasoning": "1-2 sentence explanation" }`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: 'You are a freight logistics AI. Always respond with valid JSON only, no markdown.',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const text = response.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    return { recommendation: 'UNKNOWN', topLoad: null, reasoning: text };
  }
}

module.exports = { getRecommendation };
