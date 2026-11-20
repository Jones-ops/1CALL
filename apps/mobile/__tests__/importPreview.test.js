import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ImportCard } from '../src/screens/ContactsScreen';
import { renderScreen } from '../test-utils';
import { api } from '../src/api/client';

jest.mock('../src/api/client', () => ({
  api: jest.fn(),
  errorMessage: (e) => e.message,
}));

const isDisabled = (el) => !!el.props.accessibilityState?.disabled;

const preview = {
  groupName: 'Parents',
  counts: { total: 4, valid: 2, duplicate: 1, invalid: 1 },
  rows: [
    { line: 1, name: 'Jane', input: '0712345678', phone: '+254712345678', status: 'valid' },
    { line: 2, name: '', input: '0722000111', phone: '+254722000111', status: 'valid' },
    { line: 3, name: '', input: '+254712345678', phone: '+254712345678', status: 'duplicate' },
    { line: 4, name: '', input: 'abc', phone: null, status: 'invalid' },
  ],
};

test('previews on the server, shows counts and statuses, and requires the consent declaration', async () => {
  api.mockImplementation(async (path) => {
    if (path === '/contacts/import/preview') return preview;
    if (path === '/contacts/import/commit') return { imported: 2 };
    throw new Error(path);
  });
  const onImported = jest.fn();
  await renderScreen(() => <ImportCard onImported={onImported} />);

  expect(isDisabled(screen.getByTestId('import-preview'))).toBe(true);
  await fireEvent.changeText(
    screen.getByTestId('import-text'),
    'Jane,0712345678\n0722000111\n+254712345678\nabc',
  );
  // Instant client-side count uses the shared normalisation rules
  expect(screen.getByText(/2 look valid · 1 invalid/)).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('import-group'), 'Parents');
  await fireEvent.press(screen.getByTestId('import-preview'));

  const result = await screen.findByTestId('import-preview-result');
  expect(api).toHaveBeenCalledWith('/contacts/import/preview', {
    method: 'POST',
    body: { text: 'Jane,0712345678\n0722000111\n+254712345678\nabc', groupName: 'Parents' },
  });
  expect(result).toHaveTextContent(/2 valid · 1 duplicate · 1 invalid/);
  expect(screen.getAllByText('Valid')).toHaveLength(2);
  expect(screen.getByText('Duplicate')).toBeTruthy();
  expect(screen.getByText('Invalid')).toBeTruthy();

  const commit = screen.getByTestId('import-commit');
  expect(commit).toHaveTextContent('Add 2 contacts');
  expect(isDisabled(commit)).toBe(true);
  await fireEvent.press(screen.getByTestId('import-declaration'));
  expect(isDisabled(screen.getByTestId('import-commit'))).toBe(false);
  await fireEvent.press(screen.getByTestId('import-commit'));

  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/contacts/import/commit', {
      method: 'POST',
      body: {
        groupName: 'Parents',
        consentSource: 'web_form',
        declarationAccepted: true,
        source: 'paste',
        rows: [
          { name: 'Jane', phone: '+254712345678' },
          { name: '', phone: '+254722000111' },
        ],
      },
    }),
  );
  expect(await screen.findByText(/2 contacts added to “Parents”/)).toBeTruthy();
  expect(onImported).toHaveBeenCalled();
});

test('"Add N contacts" stays disabled when nothing is valid', async () => {
  api.mockResolvedValue({
    groupName: 'X',
    counts: { total: 1, valid: 0, duplicate: 0, invalid: 1 },
    rows: [preview.rows[3]],
  });
  await renderScreen(() => <ImportCard />);
  await fireEvent.changeText(screen.getByTestId('import-text'), 'abc');
  await fireEvent.press(screen.getByTestId('import-preview'));
  await screen.findByTestId('import-preview-result');
  await fireEvent.press(screen.getByTestId('import-declaration'));
  expect(isDisabled(screen.getByTestId('import-commit'))).toBe(true);
});
