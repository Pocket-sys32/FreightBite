const { callOpenAI, DEFAULT_MODEL } = require('./openai-client');

function stripCodeFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function summarizeLoad(load) {
  if (!load) return null;
  return {
    origin: load.origin,
    destination: load.destination,
    miles: load.miles,
    rateCents: load.rateCents,
    ratePerMile: load.ratePerMile,
    pickupTime: load.pickupTime,
  };
}

async function getRecommendation({ driver, nearbyLoads, distanceFromHomeMiles, stayLoad, homeLoad }) {
  const milesFromHome = distanceFromHomeMiles != null ? distanceFromHomeMiles : driver.homeMilesAway;
  const staySummary = summarizeLoad(stayLoad);
  const homeSummary = summarizeLoad(homeLoad);

  const prompt = `Truck driver just finished a leg. They're in ${driver.currentCity}. Home is in ${driver.homeCity}. They are ${milesFromHome} miles from home.

The app is showing the driver two options. Use these exact options in your reasoning:

OPTION A — STAY on the road: ${staySummary ? `${staySummary.origin} → ${staySummary.destination}, ${staySummary.miles} mi, $${(staySummary.rateCents / 100).toFixed(2)}, $${staySummary.ratePerMile?.toFixed(2) || '0'}/mi` : 'No stay load'}

OPTION B — HOME: ${homeSummary ? `${homeSummary.origin} → ${homeSummary.destination}, ${homeSummary.miles} mi, $${(homeSummary.rateCents / 100).toFixed(2)}, $${homeSummary.ratePerMile?.toFixed(2) || '0'}/mi` : 'No home load'}

Which option is better for the driver? Your reasoning MUST reference the STAY option (Option A) and the distance from home (${milesFromHome} mi). Do not mention other loads like Barstow unless they are the HOME option above.

Return JSON only: { "recommendation": "HOME" or "STAY", "topLoad": null, "reasoning": "1-2 sentence explanation referencing the STAY load and distance from home" }`;

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
