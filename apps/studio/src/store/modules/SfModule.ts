// Renderer-side state for the Salesforce connection — Task 2.5.
//
// Thin wrapper over the sf:* IPC channels exposed on window.main.sf by the
// preload bridge. One active connection at a time (PRD Open Question Q2
// default); multi-org tabs are a later milestone.

import { Module } from 'vuex';
import { State as RootState } from '../index';
import { SfAuthError } from '@/lib/sf/errors';
import { SObjectSummary, SfConnectInfo } from '@/lib/sf/ipcTypes';

interface State {
  // saved_connection.id of the active SF connection, null when disconnected
  connectionId: Nullable<number>;
  connecting: boolean;
  info: Nullable<SfConnectInfo>;
  sobjects: SObjectSummary[];
  loadingSObjects: boolean;
  lastError: Nullable<SfAuthError>;
}

export const SfModule: Module<State, RootState> = {
  namespaced: true,
  state: () => ({
    connectionId: null,
    connecting: false,
    info: null,
    sobjects: [],
    loadingSObjects: false,
    lastError: null,
  }),
  getters: {
    isConnected(state): boolean {
      return state.connectionId != null;
    },
    orgId(state): Nullable<string> {
      return state.info?.orgId ?? null;
    },
  },
  mutations: {
    connecting(state, value: boolean) {
      state.connecting = value;
    },
    connected(state, payload: { connectionId: number; info: SfConnectInfo }) {
      state.connectionId = payload.connectionId;
      state.info = payload.info;
      state.lastError = null;
    },
    disconnected(state) {
      state.connectionId = null;
      state.info = null;
      state.sobjects = [];
    },
    sobjects(state, sobjects: SObjectSummary[]) {
      state.sobjects = sobjects;
    },
    loadingSObjects(state, value: boolean) {
      state.loadingSObjects = value;
    },
    error(state, error: SfAuthError) {
      state.lastError = error;
    },
  },
  actions: {
    // Resolves true on success. Errors land in state.lastError; the dialog
    // (Task 2.3) branches on lastError.kind for its modal / toast copy.
    async connect(context, savedConnectionId: number): Promise<boolean> {
      context.commit('connecting', true);
      try {
        const result = await window.main.sf.connect(savedConnectionId);
        if (result.ok !== false) {
          context.commit('connected', {
            connectionId: savedConnectionId,
            info: {
              orgId: result.orgId,
              userId: result.userId,
              instanceUrl: result.instanceUrl,
            },
          });
          await context.dispatch('loadSObjects');
          return true;
        }
        context.commit('error', result.error);
        return false;
      } finally {
        context.commit('connecting', false);
      }
    },

    async disconnect(context): Promise<void> {
      const id = context.state.connectionId;
      if (id == null) return;
      await window.main.sf.disconnect(id);
      context.commit('disconnected');
    },

    async loadSObjects(context): Promise<void> {
      const id = context.state.connectionId;
      if (id == null) return;
      context.commit('loadingSObjects', true);
      try {
        const result = await window.main.sf.listSObjects(id);
        if (result.ok !== false) {
          context.commit('sobjects', result.sobjects);
        } else {
          context.commit('error', result.error);
        }
      } finally {
        context.commit('loadingSObjects', false);
      }
    },

    // Re-sync after events that can drop main-process state under the
    // renderer (e.g. main reload in dev).
    async refreshStatus(context): Promise<void> {
      const id = context.state.connectionId;
      if (id == null) return;
      const { connected } = await window.main.sf.status(id);
      if (!connected) {
        context.commit('disconnected');
      }
    },
  },
};
