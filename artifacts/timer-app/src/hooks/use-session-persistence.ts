import type { AudioClip } from "./use-voice-recorder";
import type { TimerMode, PomodoroPhase } from "./use-timer";

const STORAGE_KEY = "flow_state_session";
const DB_NAME = "flow_state_db";
const STORE_NAME = "clips";
const DB_VERSION = 1;

export interface PersistedSessionState {
  timer: {
    mode: TimerMode;
    phase: PomodoroPhase;
    isActive: boolean;
    startTimestamp: number | null;
    elapsedAtPause: number;
  };
  notes: string;
  selectedTask: { id: number; name: string; projectId: number | null; projectName: string | null } | null;
  clipsMeta: Array<{
    durationSeconds: number;
    offsetSeconds: number;
    label: string;
  }>;
}

export interface RestoredSession {
  timer: PersistedSessionState["timer"];
  notes: string;
  selectedTask: PersistedSessionState["selectedTask"];
  clips: AudioClip[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveBlobs(blobs: Blob[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  blobs.forEach((blob, i) => store.put(blob, i));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function loadBlobs(): Promise<Blob[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const blobs: Blob[] = [];
  for (const key of keys) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as Blob);
      req.onerror = () => reject(req.error);
    });
    blobs.push(blob);
  }
  db.close();
  return blobs;
}

async function clearBlobs(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}

export async function loadSession(): Promise<RestoredSession | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as PersistedSessionState;

    let clips: AudioClip[] = [];
    if (state.clipsMeta.length > 0) {
      try {
        const blobs = await loadBlobs();
        clips = state.clipsMeta
          .map((m, i) => {
            const blob = blobs[i];
            if (!blob) return null;
            return {
              blob,
              durationSeconds: m.durationSeconds,
              offsetSeconds: m.offsetSeconds,
              label: m.label,
              url: URL.createObjectURL(blob),
            } as AudioClip;
          })
          .filter(Boolean) as AudioClip[];
      } catch {
        // clips lost, timer/notes/task still restored
      }
    }

    return {
      timer: state.timer,
      notes: state.notes,
      selectedTask: state.selectedTask,
      clips,
    };
  } catch {
    return null;
  }
}

export function saveSession(state: PersistedSessionState, clips: AudioClip[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or unavailable
  }
  if (clips.length > 0) {
    saveBlobs(clips.map((c) => c.blob)).catch(() => {});
  } else {
    clearBlobs().catch(() => {});
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  clearBlobs().catch(() => {});
}

export function buildPersistedState(
  timer: PersistedSessionState["timer"],
  notes: string,
  selectedTask: PersistedSessionState["selectedTask"],
  clips: AudioClip[],
): PersistedSessionState {
  return {
    timer,
    notes,
    selectedTask,
    clipsMeta: clips.map((c) => ({
      durationSeconds: c.durationSeconds,
      offsetSeconds: c.offsetSeconds,
      label: c.label,
    })),
  };
}
