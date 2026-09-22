import { mockQuery, mockConnect, mockClientQuery, mockRelease, mockClient } from './__mocks__/db';

jest.mock('../scenarios/registry', () => ({
  getExecutor: jest.fn().mockReturnValue({
    execute: jest.fn().mockResolvedValue({ output: 'ok' }),
  }),
}));
jest.mock('../modules/connections/connections.service', () => ({
  getConnectionById: jest.fn().mockResolvedValue(null),
}));
jest.mock('../integrations/marketplace/factory', () => ({
  createAdapter: jest.fn(),
}));
jest.mock('../modules/webhooks/webhooks.service', () => ({
  dispatchWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

import { processScenarioJob } from '../queue/workers/scenario.worker';
import type { Job } from 'bullmq';

function makeJob(overrides: Record<string, any> = {}): Job<any> {
  return {
    data: {
      runId: 'run-1',
      userId: 'user-1',
      scenarioSlug: 'card-generator',
      connectionId: null,
      inputData: {},
      ...overrides,
    },
  } as Job<any>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  mockClientQuery.mockResolvedValue({ rows: [] });
});

describe('processScenarioJob', () => {
  it('deducts balance and marks run as success', async () => {
    // scenario price lookup
    mockQuery
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE status='running'
      .mockResolvedValueOnce({ rows: [{ price: '9.90' }] });      // SELECT price
    // inside transaction: FOR UPDATE → has enough balance, then success writes
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                         // BEGIN
      .mockResolvedValueOnce({ rows: [{ balance: '100.00' }] })   // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE scenario_runs
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE users balance
      .mockResolvedValueOnce({ rows: [] })                         // INSERT transactions
      .mockResolvedValueOnce({ rows: [] });                        // COMMIT

    await processScenarioJob(makeJob());

    // Balance was deducted
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET balance = balance -'),
      [9.9, 'user-1'],
    );
    // Run marked success
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'success'"),
      expect.arrayContaining([expect.any(String), 9.9, 'run-1']),
    );
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('throws and marks run as error when balance is insufficient', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE status='running'
      .mockResolvedValueOnce({ rows: [{ price: '50.00' }] });     // SELECT price
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                         // BEGIN
      .mockResolvedValueOnce({ rows: [{ balance: '10.00' }] });   // SELECT FOR UPDATE → insufficient

    await expect(processScenarioJob(makeJob())).rejects.toThrow('Insufficient balance');

    // Run must be marked error
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'error'"),
      [expect.stringContaining('Insufficient'), 'run-1'],
    );
    // ROLLBACK must have been called
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('releases the client even when commit fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ price: '9.90' }] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                         // BEGIN
      .mockResolvedValueOnce({ rows: [{ balance: '100.00' }] })   // FOR UPDATE
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE scenario_runs
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE users
      .mockResolvedValueOnce({ rows: [] })                         // INSERT transactions
      .mockRejectedValueOnce(new Error('network error'));           // COMMIT fails

    await expect(processScenarioJob(makeJob())).rejects.toThrow('network error');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('FOR UPDATE query is issued inside the transaction (not before it)', async () => {
    // Verifies that the SELECT...FOR UPDATE is inside BEGIN/COMMIT, ensuring atomicity.
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ price: '9.90' }] });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                         // BEGIN
      .mockResolvedValueOnce({ rows: [{ balance: '100.00' }] })   // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE scenario_runs
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE users
      .mockResolvedValueOnce({ rows: [] })                         // INSERT transactions
      .mockResolvedValueOnce({ rows: [] });                        // COMMIT

    await processScenarioJob(makeJob());

    const calls: string[] = mockClientQuery.mock.calls.map((c: any[]) => c[0] as string);
    const beginIdx = calls.indexOf('BEGIN');
    const forUpdateIdx = calls.findIndex((c: string) => c.includes('FOR UPDATE'));
    const commitIdx = calls.indexOf('COMMIT');

    // FOR UPDATE must come strictly after BEGIN and before COMMIT
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(forUpdateIdx).toBeGreaterThan(beginIdx);
    expect(commitIdx).toBeGreaterThan(forUpdateIdx);
  });

  it('second run on exhausted balance fails (simulating post-FOR UPDATE state)', async () => {
    // After the first run deducts 9.90, a second run against the same user
    // sees balance = 0 and must fail — proving the balance check is re-evaluated
    // inside the transaction (where FOR UPDATE would have serialized it in prod).
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT price')) return { rows: [{ price: '9.90' }] };
      return { rows: [] };
    });
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                         // BEGIN
      .mockResolvedValueOnce({ rows: [{ balance: '0.00' }] });    // FOR UPDATE → 0 after first run

    await expect(processScenarioJob(makeJob({ runId: 'run-2' }))).rejects.toThrow('Insufficient balance');
  });
});
