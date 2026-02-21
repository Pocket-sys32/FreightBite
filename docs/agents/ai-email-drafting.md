# Agent Task: AI Email Drafting

## Goal
Add an endpoint to draft broker outreach emails for drivers using Claude.

## Context
This feature demonstrates the driver outreach loop. It should work with
either real Gmail contacts or demo contacts.

## Status
Pending implementation.

## Endpoint
POST `/api/ai/email-draft`
Payload:
```
{
  "driverId": "...",
  "contactId": "...",
  "context": {
    "currentCity": "...",
    "availableDate": "...",
    "trailerType": "...",
    "preferredDirection": "..."
  }
}
```

Response:
```
{
  "draft": "..."
}
```

Errors:
- `400` when required fields are missing or invalid.
- `404` when driver or contact not found.
- `502` when Claude fails or times out.

## Behavior
- Load driver + contact data from DB.
- Compose prompt from `relay_haul_1day.md` (<= 100 words).
- Call Claude and return the draft string.
- Optionally store the draft on the contact record for demo reuse.

## Data Requirements
- Driver record fields: `id`, `name`, `homeBaseCity` (fallback for `currentCity`), `trailerType`.
- Contact record fields: `id`, `name`, `company`, `lastLoadDetails`.
- Optional: `contact.lastDraftEmail` for demo reuse.

## Prompt Inputs
- `driverName`: from driver record.
- `brokerName`: from contact record.
- `brokerCompany`: from contact record.
- `currentCity`: from payload `context.currentCity` (fallback to driver home base city).
- `availableDate`: from payload.
- `trailerType`: from payload `context.trailerType` (fallback to driver trailer type).
- `preferredDirection`: from payload.
- `lastLoadDetails`: from contact record (fallback to "a prior load").

## Claude Request
- Model: match repo standard (do not introduce a new model name here).
- System: use existing Claude system prompt (if present) for outbound email tone.
- User prompt: use the template below plus the example in `relay_haul_1day.md`.
- Max tokens: small (draft is < 100 words).
- Temperature: low (0.2-0.4) for consistency.

## Prompt Template
```
Draft a short email from truck driver ${driverName} to freight broker
${brokerName} at ${brokerCompany}. Driver is currently in ${currentCity},
available ${availableDate}, has a ${trailerType}, wants loads going toward
${preferredDirection}. They worked together before on ${lastLoadDetails}.
Under 100 words. Skip the "hope this finds you well" crap.
```

## Word Count Validation
- Split on whitespace and count tokens.
- If > 100 words, retry once with a shorter constraint appended:
  "Under 90 words. Be more concise." If still > 100, truncate safely at the last
  sentence boundary and return the draft.

## Acceptance Criteria
- Draft is < 100 words.
- Draft includes driver + broker names.
- Claude errors return 502.

## Implementation Notes
- Use the same data access patterns as other `/api/ai/*` routes.
- Ensure demo contacts work without Gmail auth.
- Log Claude errors with request ids, but do not log user PII in error output.
- If storing drafts for demo, only write in non-production or when a `demo` flag
  exists on the contact record.

## Testing
- Use demo contacts to validate drafting quickly.
- Validate word count and tone.
- Add a unit test to ensure missing fields return 400.
