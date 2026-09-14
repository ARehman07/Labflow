import Anthropic from '@anthropic-ai/sdk';

/**
 * AI help for the person reviewing results: a short draft interpretation of a
 * test or a report, including change since earlier results. It is a draft for
 * a qualified person to read and edit — never released on its own.
 */
const SYSTEM = `You assist pathologists and lab technologists in a diagnostic laboratory in Pakistan.
You are given a patient's laboratory results, with units, reference ranges, flags and — when available — the same patient's earlier results.
Write a short draft interpretive comment for the reviewer:
- Start with what is abnormal or critical, then notable changes from earlier results.
- Mention likely clinical significance in cautious language ("may suggest", "consider") and suggest follow-up or repeat tests where appropriate.
- Point out values that look implausible or inconsistent with each other (possible sample or entry error).
- If everything is within range and stable, say so in one sentence.
Keep it under 120 words, plain text, no headings, no markdown. Do not state a diagnosis as fact. Do not invent values that are not given.`;

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_PROVIDER_KEY);
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI is not set up. Add ANTHROPIC_API_KEY to the server environment.');
  }
}

export async function draftInterpretation(resultsText: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_PROVIDER_KEY;
  if (!apiKey) throw new AiNotConfiguredError();
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    // A declined request is retried on a fallback model inside the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: resultsText }],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('The AI declined to comment on these results.');
  }
  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();
  if (!text) throw new Error('The AI returned no comment. Try again.');
  return text;
}
