export const BOARD_KEY = "ye-board";
export const BOARD_CAP = 60;

export type BoardState = { v: 1; ids: string[]; updated: string };

function empty(): BoardState {
  return { v: 1, ids: [], updated: new Date().toISOString() };
}

export function readBoard(): BoardState {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as BoardState;
    if (parsed?.v !== 1 || !Array.isArray(parsed.ids)) return empty();
    return { v: 1, ids: parsed.ids.slice(0, BOARD_CAP), updated: parsed.updated };
  } catch {
    return empty();
  }
}

export function writeBoard(state: BoardState): BoardState {
  const next = { ...state, ids: state.ids.slice(0, BOARD_CAP), updated: new Date().toISOString() };
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(next));
  } catch {
    // session-only if storage throws
  }
  return next;
}

export function toggleBoardId(ids: string[], id: string): { ids: string[]; added: boolean } {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), added: false };
  if (ids.length >= BOARD_CAP) return { ids, added: false };
  return { ids: [...ids, id], added: true };
}
