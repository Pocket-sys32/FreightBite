const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function draftBrokerEmail({ driver, broker }) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system:
      'You are a helpful assistant that drafts professional but casual freight industry emails. Keep them short and practical.',
    messages: [
      {
        role: 'user',
        content: `Draft a short email from truck driver ${driver.name} to freight broker ${broker.name} at ${broker.company}. Driver is currently in ${driver.currentCity}, available ${driver.availableTime}, has a ${driver.trailerType}, wants loads going toward ${driver.preferredDirection}. They worked together before on ${broker.lastLoadDetails}. Under 100 words. Skip the "hope this finds you well" crap.`,
      },
    ],
  });

  const text = response.content[0].text;

  if (/^Subject:/im.test(text)) {
    const lines = text.split('\n');
    const subjectLineIndex = lines.findIndex((line) =>
      /^Subject:/i.test(line.trim())
    );
    const subject = lines[subjectLineIndex].replace(/^Subject:\s*/i, '').trim();
    const body = lines
      .slice(subjectLineIndex + 1)
      .join('\n')
      .trim();
    return { subject, body };
  }

  return {
    subject: `Available for loads - ${driver.name}`,
    body: text,
  };
}

module.exports = { draftBrokerEmail };
