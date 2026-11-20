// Africa's Talking Voice API.
// Docs: https://developers.africastalking.com/docs/voice/overview
//
// Flow:
//  1. POST /call starts an outbound call; the response holds a sessionId.
//  2. When the callee answers, AT POSTs the number's callback URL
//     (configure it in the AT dashboard as
//     {PUBLIC_API_URL}/api/v1/webhooks/voice/events?token={VOICE_WEBHOOK_SECRET})
//     with isActive=1 and expects XML: we <Play> the recording, then
//     optionally <GetDigits> for "press 9 to opt out".
//  3. When the call ends AT POSTs the same URL with isActive=0, the final
//     durationInSeconds and hangupCause.

const xmlEscape = (s) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

const HANGUP_TO_OUTCOME = {
  NO_ANSWER: 'unanswered',
  NO_USER_RESPONSE: 'unanswered',
  ORIGINATOR_CANCEL: 'unanswered',
  ALLOTTED_TIMEOUT: 'unanswered',
  RECOVERY_ON_TIMER_EXPIRE: 'unanswered',
  USER_BUSY: 'busy',
  CALL_REJECTED: 'busy',
  SUBSCRIBER_ABSENT: 'unanswered',
};

export function createAfricasTalkingProvider({ username, apiKey, phoneNumber }, fetchImpl = fetch) {
  const base =
    username === 'sandbox'
      ? 'https://voice.sandbox.africastalking.com'
      : 'https://voice.africastalking.com';

  return {
    name: 'africastalking',

    async placeCall({ attemptId, to }) {
      if (!apiKey || !phoneNumber) throw new Error('AT_API_KEY and AT_PHONE_NUMBER must be set');
      const res = await fetchImpl(`${base}/call`, {
        method: 'POST',
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ username, from: phoneNumber, to, clientRequestId: attemptId }),
      });
      const data = await res.json().catch(() => ({}));
      const entry = data.entries?.[0];
      if (!res.ok || !entry || entry.status !== 'Queued' || !entry.sessionId) {
        throw new Error(`AT call rejected: ${entry?.status || data.errorMessage || res.status}`);
      }
      return { providerCallId: entry.sessionId };
    },

    buildAnswerResponse({ audioUrl, optOut, orgName, dtmfUrl }) {
      let xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play url="${xmlEscape(audioUrl)}"/>`;
      if (optOut) {
        xml +=
          `<GetDigits timeout="6" numDigits="1" callbackUrl="${xmlEscape(dtmfUrl)}">` +
          `<Say>Press 9 to stop receiving calls from ${xmlEscape(orgName)}.</Say></GetDigits>`;
      }
      xml += '</Response>';
      return { contentType: 'application/xml', body: xml };
    },

    buildDtmfResponse({ optedOut, orgName }) {
      const msg = optedOut
        ? `You will no longer receive calls from ${xmlEscape(orgName)}. Goodbye.`
        : 'Thank you. Goodbye.';
      return {
        contentType: 'application/xml',
        body: `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${msg}</Say></Response>`,
      };
    },

    parseEvent(body) {
      const active = String(body.isActive) === '1';
      const durationSec = Number(body.durationInSeconds) || 0;
      let outcome = null;
      if (!active) {
        const cause = String(body.hangupCause || '').toUpperCase();
        if (durationSec > 0 && (body.status === 'Success' || cause === 'NORMAL_CLEARING')) {
          outcome = 'answered'; // engine upgrades to "played" when the full message was heard
        } else if (HANGUP_TO_OUTCOME[cause]) {
          outcome = HANGUP_TO_OUTCOME[cause];
        } else {
          outcome = 'failed';
        }
      }
      return {
        providerCallId: body.sessionId,
        active,
        durationSec,
        outcome,
        dtmf: body.dtmfDigits || null,
        error: !active && outcome === 'failed' ? body.hangupCause || body.status : null,
      };
    },
  };
}
