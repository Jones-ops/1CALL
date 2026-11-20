import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import PayScreen from '../src/screens/account/PayScreen';
import { renderScreen } from '../test-utils';
import { api } from '../src/api/client';

jest.mock('../src/api/client', () => ({
  api: jest.fn(),
  errorMessage: (e) => e.message,
}));

const plan = { id: 'p2', name: 'Basic', priceKes: 3500, credits: 2000, days: 30 };
const isDisabled = (el) => !!el.props.accessibilityState?.disabled;

function serverWith(statusAfterMock) {
  let status = 'pending';
  api.mockImplementation(async (path, opts) => {
    if (path === '/payments/stk-push')
      return { payment: { id: 'pay1', status: 'pending', phone: '+254712000111' } };
    if (path === '/payments/pay1')
      return {
        payment: {
          id: 'pay1',
          status,
          phone: '+254712000111',
          mpesaReceipt: status === 'succeeded' ? 'MOCKAB12' : null,
          resultDesc: status === 'failed' ? 'Request cancelled by user' : null,
        },
      };
    if (path.startsWith('/mock/mpesa/pay1/') && opts.method === 'POST') {
      status = statusAfterMock;
      return { ok: true, status };
    }
    throw new Error(path);
  });
}

beforeEach(() => api.mockReset());

test('validates the Kenyan M-Pesa number before enabling Pay', async () => {
  serverWith('succeeded');
  await renderScreen(PayScreen, { params: { plan } });
  expect(screen.getByTestId('pay-button')).toHaveTextContent('PAY KES 3,500');
  await fireEvent.changeText(screen.getByTestId('mpesa-phone'), '+447911123456');
  expect(isDisabled(screen.getByTestId('pay-button'))).toBe(true);
  expect(screen.getByText(/Enter a Safaricom number/)).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('mpesa-phone'), '0712 000 111');
  expect(isDisabled(screen.getByTestId('pay-button'))).toBe(false);
});

test('shows "Check your phone", then success only once the server reports it', async () => {
  serverWith('succeeded');
  await renderScreen(PayScreen, { params: { plan } });
  await fireEvent.press(screen.getByTestId('pay-button'));
  expect(await screen.findByTestId('check-phone')).toHaveTextContent(/Check your phone/);
  expect(api).toHaveBeenCalledWith('/payments/stk-push', {
    method: 'POST',
    body: { planId: 'p2', phone: '0712000111' },
  });
  expect(screen.queryByTestId('pay-success')).toBeNull();

  await fireEvent.press(screen.getByTestId('mock-pin'));
  expect(await screen.findByTestId('pay-success')).toHaveTextContent(/MOCKAB12/);
  // The app asked the server; it did not decide on its own.
  expect(api).toHaveBeenCalledWith('/mock/mpesa/pay1/complete', { method: 'POST' });
  expect(api).toHaveBeenCalledWith('/payments/pay1');
});

test('cancel shows a failure state', async () => {
  serverWith('failed');
  await renderScreen(PayScreen, { params: { plan } });
  await fireEvent.press(screen.getByTestId('pay-button'));
  await screen.findByTestId('check-phone');
  await fireEvent.press(screen.getByTestId('mock-cancel'));
  expect(await screen.findByTestId('pay-failed')).toHaveTextContent(/Request cancelled by user/);
});

test('polls the payment status every few seconds while waiting', async () => {
  jest.useFakeTimers();
  let n = 0;
  api.mockImplementation(async (path) => {
    if (path === '/payments/stk-push')
      return { payment: { id: 'pay1', status: 'pending', phone: '+254712000111' } };
    if (path === '/payments/pay1') {
      n += 1;
      return {
        payment: { id: 'pay1', status: n >= 2 ? 'succeeded' : 'pending', mpesaReceipt: 'QWE1' },
      };
    }
    throw new Error(path);
  });
  await renderScreen(PayScreen, { params: { plan } });
  await fireEvent.press(screen.getByTestId('pay-button'));
  await screen.findByTestId('check-phone');
  await act(async () => {
    jest.advanceTimersByTime(3100);
  });
  await act(async () => {
    jest.advanceTimersByTime(3100);
  });
  await waitFor(() => expect(screen.getByTestId('pay-success')).toBeTruthy());
  jest.useRealTimers();
});
