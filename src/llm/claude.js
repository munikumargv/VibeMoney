// Optional Claude client. When ANTHROPIC_API_KEY (or another credential the
// SDK resolves) is present, the audit asks Claude the same questions a
// customer would and scores the real answers.
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export function createClaude({ model = process.env.VIBEMONEY_MODEL || DEFAULT_MODEL, enabled } = {}) {
  const on = enabled ?? Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (!on) return { enabled: false, model, ask: async () => { throw new Error('Claude is not configured'); } };
  const client = new Anthropic();
  return {
    enabled: true,
    model,
    async ask({ system, prompt }) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // re-run a declined request on Anthropic's recommended fallback model
        output_config: { effort: 'low' }, // a short consumer-style answer, like an assistant would give
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.stop_reason === 'refusal') throw new Error('the model declined to answer');
      return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    },
  };
}
