export const CONSENT_SOURCES = [
  'web_form',
  'sms_optin',
  'event_signup',
  'paper_form',
  'existing_customer',
];

export const CONSENT_SOURCE_LABELS = {
  web_form: 'Web form',
  sms_optin: 'SMS opt-in',
  event_signup: 'Event sign-up',
  paper_form: 'Paper form',
  existing_customer: 'Existing customer',
};

export const CAMPAIGN_CATEGORIES = ['informational', 'transactional', 'promotional', 'political'];
export const APPROVAL_CATEGORIES = ['promotional', 'political'];

export const CAMPAIGN_STATUS_LABELS = {
  draft: 'DRAFT',
  pending_approval: 'PENDING APPROVAL',
  scheduled: 'SCHEDULED',
  running: 'RUNNING',
  paused: 'PAUSED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  rejected: 'REJECTED',
};

export const ACTIVE_CAMPAIGN_STATUSES = ['pending_approval', 'scheduled', 'running', 'paused'];

export const MOCK_BANNER_TEXT = 'MOCK MODE – no real phone calls and no real M-Pesa payments.';

export const DEFAULT_GROUP_NAME = 'Campaign Contacts';

export function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatKes(amount) {
  return `KES ${Math.round(Number(amount) || 0).toLocaleString('en-US')}`;
}
