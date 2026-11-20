// M-Pesa provider interface:
//   stkPush({ amount, phone, accountReference, description, callbackUrl })
//     -> Promise<{ merchantRequestId, checkoutRequestId, customerMessage }>
// Credits are NEVER granted from this response — only from the callback.
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { createDarajaProvider } from './daraja.js';

let instance = null;

export function getMpesaProvider() {
  if (instance) return instance;
  if (config.mpesa.env === 'mock') {
    instance = {
      name: 'mock',
      async stkPush() {
        const id = crypto.randomUUID().slice(0, 8);
        return {
          merchantRequestId: `mock-mr-${id}`,
          checkoutRequestId: `ws_CO_MOCK_${Date.now()}_${id}`,
          customerMessage: 'Mock STK push sent',
        };
      },
    };
  } else {
    instance = createDarajaProvider(config.mpesa);
  }
  return instance;
}

export function setMpesaProvider(p) {
  instance = p;
}
