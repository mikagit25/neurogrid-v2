import { mockQuery, mockConnect, mockClientQuery, mockRelease, mockClient } from './__mocks__/db';

// Mock heavy dependencies before importing the module under test
jest.mock('../integrations/webpay/webpay.client', () => ({
  verifyWebpaySignature: jest.fn().mockReturnValue(true),
  createWebpayForm: jest.fn().mockReturnValue({ formUrl: 'http://pay.test', fields: {} }),
}));
jest.mock('../config', () => ({
  config: {
    webpay: { storeId: 'store1', secretKey: 'secret', currency: 'BYN', sandbox: true },
  },
}));

import { processWebhook } from '../modules/billing/billing.service';

const VALID_BODY = {
  site_order_id: 'order-1',
  payment_type: '1',
  amount: '500.00',
  transaction_id: 'txn-1',
};

const PENDING_REQUEST = {
  id: 'order-1',
  user_id: 'user-1',
  amount: '500.00',
  currency: 'BYN',
  status: 'pending',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockRelease.mockReset();
});

describe('processWebhook', () => {
  it('credits balance and returns true for a valid payment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_REQUEST] });

    const result = await processWebhook(VALID_BODY);

    expect(result).toBe(true);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    // balance update
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET balance = balance +'),
      [PENDING_REQUEST.amount, PENDING_REQUEST.user_id],
    );
    // transaction insert
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO transactions"),
      [PENDING_REQUEST.user_id, PENDING_REQUEST.amount, 'txn-1'],
    );
    // topup status update
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'paid'"),
      ['order-1'],
    );
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — returns true without crediting if already paid', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...PENDING_REQUEST, status: 'paid' }] });

    const result = await processWebhook(VALID_BODY);

    expect(result).toBe(true);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('returns false and marks failed when payment_type is not success', async () => {
    const result = await processWebhook({ ...VALID_BODY, payment_type: '0' });

    expect(result).toBe(false);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      ['order-1'],
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('returns false when amount does not match the stored request', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_REQUEST] });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await processWebhook({ ...VALID_BODY, amount: '999.00' });

    expect(result).toBe(false);
    expect(mockConnect).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('releases the DB client even when the transaction throws', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_REQUEST] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('DB error')); // UPDATE users

    await expect(processWebhook(VALID_BODY)).rejects.toThrow('DB error');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('returns false when order id is missing', async () => {
    const result = await processWebhook({ payment_type: '1', amount: '500.00' });
    expect(result).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
