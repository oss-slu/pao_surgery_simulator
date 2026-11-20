import { fetchHistory, saveHistory, toPersistedActions } from '../historyApi';
import { sessionFetch } from '../sessionApi';

jest.mock('../sessionApi', () => ({ sessionFetch: jest.fn() }));

const API_BASE = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:5000';

test('toPersistedActions strips live cut buffers and keeps geometry', () => {
  const actions = toPersistedActions([
    {
      type: 'cut',
      imageData: { id: 'volume' },
      indices: Uint32Array.from([1, 2]),
      previousValues: Float32Array.from([10, 20]),
      emptyValue: -1000,
      start: [0, 0, 0],
      end: [1, 0, 0],
      depthDirection: [0, 0, -1],
      thickness: 3,
    },
    {
      type: 'markerStroke',
      strokeId: 'stroke-1',
      color: '#ff0000',
      points: [Float32Array.from([1, 2, 3])],
      markers: [
        {
          id: 'm1',
          strokeId: 'stroke-1',
          coordinates: { x: 1, y: 2, z: 3 },
          color: '#ff0000',
        },
      ],
    },
  ]);

  expect(actions).toEqual([
    {
      type: 'cut',
      start: [0, 0, 0],
      end: [1, 0, 0],
      depthDirection: [0, 0, -1],
      thickness: 3,
      emptyValue: -1000,
    },
    {
      type: 'markerStroke',
      strokeId: 'stroke-1',
      color: '#ff0000',
      points: [[1, 2, 3]],
      markers: [
        {
          id: 'm1',
          strokeId: 'stroke-1',
          coordinates: { x: 1, y: 2, z: 3 },
          color: '#ff0000',
        },
      ],
    },
  ]);
  expect(actions[0].indices).toBeUndefined();
  expect(actions[0].imageData).toBeUndefined();
});

test('fetchHistory posts to the list endpoint', async () => {
  sessionFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      revision: 2,
      cursor: 1,
      actions: [{ type: 'cut', start: [0, 0, 0], end: [1, 0, 0], depthDirection: [0, 0, -1], thickness: 2 }],
    }),
  });

  const history = await fetchHistory('scan-9');

  expect(sessionFetch).toHaveBeenCalledWith(
    `${API_BASE}/api/scans/scan-9/history/list`,
    { method: 'POST', body: {} }
  );
  expect(history.revision).toBe(2);
  expect(history.cursor).toBe(1);
  expect(history.actions).toHaveLength(1);
});

test('saveHistory surfaces revision conflicts', async () => {
  sessionFetch.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({
      error: 'History revision conflict',
      code: 'REVISION_CONFLICT',
      revision: 4,
      cursor: 0,
      actions: [],
    }),
  });

  await expect(
    saveHistory('scan-9', { revision: 3, cursor: 1, actions: [] })
  ).rejects.toMatchObject({
    status: 409,
    code: 'REVISION_CONFLICT',
  });
});
