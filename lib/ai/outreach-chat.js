const { callOpenAI, DEFAULT_MODEL } = require("./openai-client");

function topContactsText(contacts) {
  return (contacts || [])
    .slice(0, 12)
    .map((contact, index) => {
      return `${index + 1}. ${contact.name} (${contact.company}) - avg $${contact.avgRatePerMile}/mi, loads: ${contact.totalLoads}, lanes: ${contact.preferredLanes?.join(", ") || "N/A"}, last worked: ${contact.lastWorkedDate}`;
    })
    .join("\n");
}

function laneSummary(gapLeg) {
  if (!gapLeg) return "No open leg currently selected.";
  return `${gapLeg.origin} -> ${gapLeg.destination}, ${gapLeg.miles} miles, ${gapLeg.commodity}, est pickup ${gapLeg.estimatedPickup}, all-in $${Math.round((gapLeg.rateCents + gapLeg.fuelSurchargeCents) / 100)}`;
}

async function answerOutreachQuestion({ question, contacts, gapLeg, driver, supabaseContext = '' }) {
  const supabaseBlock = supabaseContext
    ? `\n\n${supabaseContext}\n\nUse the Supabase data above when relevant to answer the question.\n`
    : '';

  const systemPrompt = `You are a practical freight dispatch AI (DispAIch) using model ${DEFAULT_MODEL}.

CRITICAL: You must answer the user's specific question. Read their question carefully and tailor your entire response to what they actually asked. Do not give a generic reply or the same template every time.

- If they ask who to contact first → rank specific contacts with reasons.
- If they ask about message angle or how to pitch → focus on wording and angles.
- If they ask about rates, lanes, or broker comparison → focus on that.
- If they ask about risk or watchouts → focus on that.
- For open-ended questions, pick the most useful angle and be specific.

Use the driver, open lane, and contacts context only to make your answer concrete and actionable. Keep responses under 180 words and concise.`;

  const userMessage = `The driver is asking you this specific question — answer it directly:

"${question}"

Context (use only to support your answer):
- Driver: ${driver?.name || "Unknown"} in ${driver?.currentCity || "Unknown"}.
- Open lane: ${laneSummary(gapLeg)}

Contacts:
${topContactsText(contacts)}
${supabaseBlock}

Respond only to the question above. Do not repeat the question.`;

  const text = await callOpenAI({
    maxCompletionTokens: 520,
    temperature: 0.4,
    system: systemPrompt,
    user: userMessage,
  });

  return text.trim();
}

module.exports = { answerOutreachQuestion };
