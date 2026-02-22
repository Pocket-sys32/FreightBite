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

async function answerOutreachQuestion({ question, contacts, gapLeg, driver }) {
  const text = await callOpenAI({
    maxCompletionTokens: 420,
    temperature: 0.25,
    system: `You are a practical freight outreach copilot using model ${DEFAULT_MODEL}. Give concise, useful dispatch guidance. Prefer ranking who to contact first and why.`,
    user: `Driver: ${driver?.name || "Unknown"} in ${driver?.currentCity || "Unknown"}.
Open lane: ${laneSummary(gapLeg)}

Contacts:
${topContactsText(contacts)}

Question: ${question}

Answer format:
1) Best contact(s) now (max 3) with one-line reasons.
2) Suggested message angle.
3) Risk/watchout in one line.
Keep total under 180 words.`,
  });

  return text.trim();
}

module.exports = { answerOutreachQuestion };
