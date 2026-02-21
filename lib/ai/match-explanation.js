const { callOpenAI, DEFAULT_MODEL } = require('./openai-client');

async function generateMatchExplanation({ leg, driver }) {
  const text = await callOpenAI({
    maxCompletionTokens: 150,
    temperature: 0.2,
    system: `You are a freight dispatcher AI using model ${DEFAULT_MODEL}. Be specific and concise.`,
    user: `Explain in exactly 2 sentences why this driver is the best match for this leg. Be specific about the numbers.\n\nLeg: ${leg.origin} -> ${leg.destination}, ${leg.miles} miles, pickup at ${leg.pickupTime}\nDriver: ${driver.name}, currently ${driver.distanceFromPickup} miles from pickup, ${driver.hosRemaining} hours HOS remaining, rating ${driver.rating}/5`
  });

  return text;
}

module.exports = { generateMatchExplanation };
