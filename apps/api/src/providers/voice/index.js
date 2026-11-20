// Voice provider interface.
//
// A provider implements:
//   name: string
//   placeCall({ attemptId, to, campaign, report }) -> Promise<{ providerCallId }>
//       Starts an outbound call. Outcomes arrive later, either via the provider's
//       webhooks (real providers) or by calling `report(attemptId, result)`
//       directly (mock provider).
//   buildAnswerResponse({ audioUrl, optOut, orgName, dtmfUrl }) -> { contentType, body }
//       Response to the provider's "call answered" webhook (play + optional DTMF).
//   buildDtmfResponse({ optedOut, orgName }) -> { contentType, body }
//   parseEvent(body) -> { providerCallId, active, durationSec, outcome, dtmf }
//
// To add Twilio etc., implement the same shape and register it below.
import { config } from '../../config.js';
import { createMockVoiceProvider } from './mock.js';
import { createAfricasTalkingProvider } from './africastalking.js';

let instance = null;

export function getVoiceProvider() {
  if (instance) return instance;
  switch (config.voice.provider) {
    case 'africastalking':
      instance = createAfricasTalkingProvider(config.voice.at);
      break;
    case 'mock':
      instance = createMockVoiceProvider();
      break;
    default:
      throw new Error(`Unknown VOICE_PROVIDER "${config.voice.provider}"`);
  }
  return instance;
}

/** For tests: inject a provider. */
export function setVoiceProvider(p) {
  instance = p;
}
