const { callOpenAI, DEFAULT_MODEL } = require('./openai-client');

async function draftBrokerEmail({ driver, broker }) {
  const text = await callOpenAI({
    maxCompletionTokens: 220,
    temperature: 0.3,
    system: `You are a helpful assistant using model ${DEFAULT_MODEL} that drafts professional but casual freight industry emails. Keep them short and practical.`,
    user: `Draft a short email from truck driver ${driver.name} to freight broker ${broker.name} at ${broker.company}. Driver is currently in ${driver.currentCity}, available ${driver.availableTime}, has a ${driver.trailerType}, wants loads going toward ${driver.preferredDirection}. They worked together before on ${broker.lastLoadDetails}. Under 100 words. Skip the \"hope this finds you well\" crap.`
  });

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
