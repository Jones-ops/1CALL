jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('expo-audio', () => {
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(async () => {}),
  };
  return {
    useAudioPlayer: () => player,
    useAudioPlayerStatus: () => ({ playing: false, duration: 0, currentTime: 0 }),
    useAudioRecorder: () => ({
      prepareToRecordAsync: jest.fn(),
      record: jest.fn(),
      pause: jest.fn(),
      stop: jest.fn(),
      uri: null,
    }),
    useAudioRecorderState: () => ({ durationMillis: 0, isRecording: false }),
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    setAudioModeAsync: jest.fn(async () => {}),
  };
});

jest.mock('socket.io-client', () => ({
  io: () => ({ on: jest.fn(), disconnect: jest.fn() }),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('expo-contacts', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getContactsAsync: jest.fn(async () => ({ data: [] })),
  Fields: { PhoneNumbers: 'phoneNumbers', Name: 'name' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }));
jest.mock('@react-native-community/datetimepicker', () => {
  const DateTimePicker = () => null;
  DateTimePicker.DateTimePickerAndroid = { open: jest.fn() };
  return { __esModule: true, default: DateTimePicker, DateTimePickerAndroid: { open: jest.fn() } };
});
