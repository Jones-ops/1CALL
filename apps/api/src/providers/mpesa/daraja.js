// Safaricom Daraja – Lipa Na M-Pesa Online (STK Push).
// Docs: https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate

/** yyyyMMddHHmmss in East Africa Time. */
export function darajaTimestamp(date = new Date()) {
  const d = new Date(date.getTime() + 3 * 3600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function createDarajaProvider(cfg, fetchImpl = fetch) {
  const base =
    cfg.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  let token = null;
  let tokenExp = 0;

  async function accessToken() {
    if (token && Date.now() < tokenExp) return token;
    const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
    const res = await fetchImpl(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) throw new Error(`Daraja OAuth failed (${res.status})`);
    const data = await res.json();
    token = data.access_token;
    tokenExp = Date.now() + (Number(data.expires_in) - 60) * 1000;
    return token;
  }

  return {
    name: `daraja-${cfg.env}`,
    async stkPush({ amount, phone, accountReference, description, callbackUrl }) {
      if (!cfg.consumerKey || !cfg.passkey)
        throw new Error('Daraja credentials are not configured');
      const timestamp = darajaTimestamp();
      const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${timestamp}`).toString('base64');
      const msisdn = phone.replace(/^\+/, '');
      const res = await fetchImpl(`${base}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: cfg.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: cfg.transactionType,
          Amount: Math.round(amount),
          PartyA: msisdn,
          PartyB: cfg.shortcode,
          PhoneNumber: msisdn,
          CallBackURL: callbackUrl,
          AccountReference: accountReference.slice(0, 12),
          TransactionDesc: description.slice(0, 13),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || String(data.ResponseCode) !== '0') {
        throw new Error(
          data.errorMessage || data.ResponseDescription || `STK push failed (${res.status})`,
        );
      }
      return {
        merchantRequestId: data.MerchantRequestID,
        checkoutRequestId: data.CheckoutRequestID,
        customerMessage: data.CustomerMessage,
      };
    },
  };
}
