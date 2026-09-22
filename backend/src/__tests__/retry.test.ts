import { withRetry } from '../utils/retry';

// Suppress jitter so tests run instantly
beforeAll(() => jest.spyOn(Math, 'random').mockReturnValue(0));
afterAll(() => jest.restoreAllMocks());

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, 3, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and eventually succeeds', async () => {
    const err5xx = Object.assign(new Error('Server error'), { response: { status: 503 } });
    const fn = jest.fn()
      .mockRejectedValueOnce(err5xx)
      .mockRejectedValueOnce(err5xx)
      .mockResolvedValueOnce('success');

    await expect(withRetry(fn, 3, 0)).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 400 (client error)', async () => {
    const err400 = Object.assign(new Error('Bad request'), { response: { status: 400 } });
    const fn = jest.fn().mockRejectedValue(err400);

    await expect(withRetry(fn, 3, 0)).rejects.toThrow('Bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 (rate limit)', async () => {
    const err429 = Object.assign(new Error('Rate limited'), { response: { status: 429 } });
    const fn = jest.fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce('ok');

    await expect(withRetry(fn, 3, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    const errNet = new Error('network error');
    const fn = jest.fn().mockRejectedValue(errNet);

    await expect(withRetry(fn, 3, 0)).rejects.toThrow('network error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 401', async () => {
    const err401 = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    const fn = jest.fn().mockRejectedValue(err401);

    await expect(withRetry(fn, 3, 0)).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
