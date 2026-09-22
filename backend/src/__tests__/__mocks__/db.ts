// Shared mock for the pg Pool used across tests.
// Each test file overrides mockQuery / mockConnect as needed.

export const mockQuery = jest.fn();
export const mockRelease = jest.fn();
export const mockClientQuery = jest.fn();

export const mockClient = {
  query: mockClientQuery,
  release: mockRelease,
};

export const mockConnect = jest.fn().mockResolvedValue(mockClient);

export const db = {
  query: mockQuery,
  connect: mockConnect,
  end: jest.fn(),
};
