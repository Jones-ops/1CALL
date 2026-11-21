import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import CampaignWizardScreen from '../src/screens/campaigns/CampaignWizardScreen';
import { renderScreen } from '../test-utils';
import { api } from '../src/api/client';

jest.mock('../src/api/client', () => ({
  api: jest.fn(),
  errorMessage: (e) => e.message,
  getAccessToken: () => 'token',
}));

const estimate = (over = {}) => ({
  total: 40,
  optedOut: 3,
  recipients: 37,
  creditsPerCall: 1,
  estimatedCredits: 37,
  available: 2000,
  sufficient: true,
  subscriptionActive: true,
  planName: 'Basic',
  maxRecipients: 2000,
  overPlanLimit: false,
  ...over,
});

function mockApi(est = estimate()) {
  api.mockImplementation(async (path, opts) => {
    if (path === '/groups') return { items: [{ id: 'g1', name: 'Church Members', count: 40 }] };
    if (path === '/recordings')
      return { items: [{ id: 'r1', name: 'Sunday reminder', durationSec: 14, creditsPerCall: 1 }] };
    if (path === '/campaigns/estimate') return est;
    if (path === '/campaigns' && opts?.method === 'POST') return { campaign: { id: 'c1' } };
    throw new Error(`unexpected ${path}`);
  });
}

async function choose(selectId, value) {
  await fireEvent.press(await screen.findByTestId(selectId));
  await fireEvent.press(await screen.findByTestId(`${selectId}-option-${value}`));
}

const isDisabled = (el) => !!el.props.accessibilityState?.disabled;

beforeEach(() => api.mockReset());

test('walks the 4 steps and launches only after both declarations', async () => {
  mockApi();
  await renderScreen(CampaignWizardScreen, { extraScreens: { CampaignLive: () => null } });

  expect(screen.getByText(/Step 1 of 4/)).toBeTruthy();
  expect(isDisabled(screen.getByTestId('wizard-next'))).toBe(true);

  await choose('wizard-group', 'g1');
  const summary = await screen.findByTestId('recipient-summary');
  expect(summary).toHaveTextContent(/37/);
  expect(summary).toHaveTextContent(/40 contacts in this group/);
  expect(summary).toHaveTextContent(/3 opted out — will be skipped/);
  await waitFor(() => expect(isDisabled(screen.getByTestId('wizard-next'))).toBe(false));
  await fireEvent.press(screen.getByTestId('wizard-next'));

  // Step 2: recording required
  expect(isDisabled(screen.getByTestId('wizard-next'))).toBe(true);
  await choose('wizard-recording', 'r1');
  await fireEvent.press(screen.getByTestId('wizard-next'));

  // Step 3: details; promotional shows the approval warning
  await fireEvent.changeText(screen.getByTestId('wizard-name'), 'Easter invite');
  await choose('wizard-category', 'promotional');
  expect(screen.getByTestId('approval-warning')).toBeTruthy();
  await choose('wizard-category', 'informational');
  expect(screen.queryByTestId('approval-warning')).toBeNull();
  await fireEvent.press(screen.getByTestId('wizard-next'));

  // Step 4: review
  expect(screen.getByTestId('step-review')).toHaveTextContent(
    /Opt-out on · 08:00–19:00 · max 2 attempts/,
  );
  await fireEvent.press(screen.getByTestId('wizard-start'));

  const launch = await screen.findByTestId('confirm-launch');
  expect(isDisabled(launch)).toBe(true);
  await fireEvent.press(screen.getByTestId('decl-consent'));
  expect(isDisabled(screen.getByTestId('confirm-launch'))).toBe(true);
  await fireEvent.press(screen.getByTestId('decl-lawful'));
  expect(isDisabled(screen.getByTestId('confirm-launch'))).toBe(false);
  await fireEvent.press(screen.getByTestId('confirm-launch'));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/campaigns', {
      method: 'POST',
      body: expect.objectContaining({
        name: 'Easter invite',
        groupId: 'g1',
        recordingId: 'r1',
        category: 'informational',
        scheduledAt: null,
        optOutEnabled: true,
        declarations: { consent: true, lawful: true },
      }),
    }),
  );
});

test('start button is disabled when credits are insufficient', async () => {
  mockApi(estimate({ available: 10, sufficient: false }));
  await renderScreen(CampaignWizardScreen);
  await choose('wizard-group', 'g1');
  await waitFor(() => expect(isDisabled(screen.getByTestId('wizard-next'))).toBe(false));
  await fireEvent.press(screen.getByTestId('wizard-next'));
  await choose('wizard-recording', 'r1');
  await fireEvent.press(screen.getByTestId('wizard-next'));
  await fireEvent.changeText(screen.getByTestId('wizard-name'), 'Fees reminder');
  await fireEvent.press(screen.getByTestId('wizard-next'));
  expect(await screen.findByText(/Not enough credits/)).toBeTruthy();
  expect(isDisabled(screen.getByTestId('wizard-start'))).toBe(true);
});

test('Next is disabled when everyone in the group opted out', async () => {
  mockApi(estimate({ total: 3, optedOut: 3, recipients: 0 }));
  await renderScreen(CampaignWizardScreen);
  await choose('wizard-group', 'g1');
  expect(await screen.findByTestId('recipient-summary')).toHaveTextContent(
    /0will be called|0 will be called/,
  );
  expect(isDisabled(screen.getByTestId('wizard-next'))).toBe(true);
});
