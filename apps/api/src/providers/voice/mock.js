// Mock voice provider: no real calls. Simulates outcomes at a steady pace:
// ≈55% answered (of which ~90% "message played"), ≈25% unanswered,
// ≈10% busy, ≈10% failed. Played calls with opt-out enabled press 9 ~3% of the time.
import crypto from 'node:crypto';
import { config } from '../../config.js';

export function simulateOutcome(rand = Math.random, { messageSec = 15, optOut = true } = {}) {
  const r = rand();
  if (r < 0.55) {
    const played = rand() < 0.9;
    if (played) {
      const pressed9 = optOut && rand() < 0.03;
      return {
        outcome: 'played',
        durationSec: Math.ceil(messageSec) + (optOut ? 4 : 1),
        dtmf: pressed9 ? '9' : null,
      };
    }
    return { outcome: 'answered', durationSec: Math.max(1, Math.floor(rand() * messageSec)) };
  }
  if (r < 0.8) return { outcome: 'unanswered', durationSec: 0 };
  if (r < 0.9) return { outcome: 'busy', durationSec: 0 };
  return { outcome: 'failed', durationSec: 0, error: 'Simulated network failure' };
}

export function createMockVoiceProvider({ rand = Math.random } = {}) {
  const { mockMinMs, mockMaxMs } = config.voice;
  return {
    name: 'mock',
    async placeCall({ attemptId, campaign, report }) {
      const providerCallId = `mock_${crypto.randomUUID()}`;
      const delay = mockMinMs + rand() * Math.max(0, mockMaxMs - mockMinMs);
      setTimeout(() => {
        const result = simulateOutcome(rand, {
          messageSec: campaign?.recording?.durationSec ?? 15,
          optOut: campaign?.optOutEnabled ?? true,
        });
        Promise.resolve(report(attemptId, result)).catch((err) =>
          console.error('[mock-voice] report failed', err),
        );
      }, delay).unref?.();
      return { providerCallId };
    },
    buildAnswerResponse() {
      return { contentType: 'application/xml', body: '<Response/>' };
    },
    buildDtmfResponse() {
      return { contentType: 'application/xml', body: '<Response/>' };
    },
    parseEvent(body) {
      return {
        providerCallId: body.providerCallId,
        active: body.active === true,
        durationSec: Number(body.durationSec) || 0,
        outcome: body.outcome,
        dtmf: body.dtmf || null,
      };
    },
  };
}
