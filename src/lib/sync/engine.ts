// Pending operations are persisted to IndexedDB.
// The sync engine is responsible for pushing pending operations to the server
// and for pulling operations from the server.
// It runs in the background and executes periodically.
// For pushing pending operations:
// 1. Executed every X seconds
// 2. Executed when we come online
// 3. Executed when the visibility changes

import { db } from '@/lib/db/persistence';
import { getClientId, getSeqNo } from '@/lib/sync/meta';
import { applyServerOperations } from '@/lib/sync/operation';
import { pullFromServer, pushToServer } from '@/lib/sync/server';

// Note: we don't have to handle race conditions as the operations being sent
// to the server are idempotent.

const SYNC_TO_SERVER_INTERVAL = 10000;
const SYNC_FROM_SERVER_INTERVAL = 30000;
let started = false;

let syncToServerInProgress = false;
async function syncToServer() {
  if (syncToServerInProgress) {
    return;
  }

  syncToServerInProgress = true;

  try {
    if (!navigator.onLine) {
      return;
    }

    const pendingOperations = await db.pendingOperations.toArray();
    if (pendingOperations.length === 0) {
      return;
    }

    const clientId = await getClientId();
    if (!clientId) {
      return;
    }

    const { success } = await pushToServer(clientId, pendingOperations);
    if (!success) {
      console.error('Failed to push operations to server');
    }

    await db.pendingOperations.bulkDelete(pendingOperations.map((op) => op.id));
  } finally {
    syncToServerInProgress = false;
  }
}

let syncFromServerInProgress = false;
// We sync from server more infrequently as we don't want to overload the server
async function syncFromServer() {
  if (syncFromServerInProgress) {
    return;
  }

  syncFromServerInProgress = true;

  try {
    const clientId = await getClientId();
    if (!clientId) {
      return;
    }

    const seqNo = await getSeqNo();

    const operations = await pullFromServer(clientId, seqNo);
    if (operations.length === 0) {
      return;
    }

    await applyServerOperations(operations);
  } finally {
    syncFromServerInProgress = false;
  }
}

function start() {
  if (started) {
    return;
  }

  started = true;

  syncToServer();
  syncFromServer();

  // Sync to server
  setInterval(syncToServer, SYNC_TO_SERVER_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      syncToServer();
    }
  });
  document.addEventListener('online', () => {
    syncToServer();
  });

  // Sync from server
  setInterval(syncFromServer, SYNC_FROM_SERVER_INTERVAL);
  document.addEventListener('online', () => {
    syncFromServer();
  });
}

const SyncEngine = {
  syncToServer,
  start,
};

export default SyncEngine;
