const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateMatchExplanation({ leg, driver }) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 150,
    system: 'You are a freight dispatcher AI. Be specific and concise.',
    messages: [
      {
        role: 'user',
        content: `Explain in exactly 2 sentences why this driver is the best match for this leg. Be specific about the numbers.

Leg: ${leg.origin} → ${leg.destination}, ${leg.miles} miles, pickup at ${leg.pickupTime}
Driver: ${driver.name}, currently ${driver.distanceFromPickup} miles from pickup, ${driver.hosRemaining} hours HOS remaining, rating ${driver.rating}/5`,
      },
    ],
  });

  return response.content[0].text;
}

module.exports = { generateMatchExplanation };
