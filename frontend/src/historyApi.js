import { sessionFetch } from './sessionApi';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:5000';

function historyUrl(scanId, suffix = '') {
  return `${API_BASE}/api/scans/${encodeURIComponent(scanId)}/history${suffix}`;
}

export function toPersistedActions(entries) {
  if (!Array.isArray(entries)) return [];

  return entries.map((entry) => {
    if (entry?.type === 'cut') {
      return {
        type: 'cut',
        start: Array.from(entry.start || []),
        end: Array.from(entry.end || []),
        depthDirection: Array.from(entry.depthDirection || []),
        thickness: entry.thickness,
        emptyValue: entry.emptyValue ?? -1000,
      };
    }

    if (entry?.type === 'markerStroke') {
      return {
        type: 'markerStroke',
        strokeId: entry.strokeId,
        color: entry.color,
        points: (entry.points || []).map((point) => Array.from(point)),
        markers: (entry.markers || []).map((marker) => ({
          id: marker.id,
          strokeId: marker.strokeId,
          coordinates: {
            x: marker.coordinates.x,
            y: marker.coordinates.y,
            z: marker.coordinates.z,
          },
          color: marker.color,
        })),
      };
    }

    throw new Error(`Unsupported history action type: ${entry?.type}`);
  });
}

async function readHistoryError(response) {
  const data = await response.json().catch(() => ({}));
  const error = new Error(
    data.error || `History request failed (${response.status})`
  );
  error.status = response.status;
  error.code = data.code;
  error.body = data;
  return error;
}

export async function fetchHistory(scanId) {
  const response = await sessionFetch(historyUrl(scanId, '/list'), {
    method: 'POST',
    body: {},
  });
  if (!response.ok) throw await readHistoryError(response);
  const data = await response.json();
  return {
    revision: data.revision ?? 0,
    cursor: data.cursor ?? 0,
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
}

export async function saveHistory(scanId, { revision, cursor, actions }) {
  const response = await sessionFetch(historyUrl(scanId), {
    method: 'PUT',
    body: { revision, cursor, actions },
  });
  if (!response.ok) throw await readHistoryError(response);
  const data = await response.json();
  return {
    revision: data.revision,
    cursor: data.cursor,
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
}
