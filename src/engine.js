export const SIZE = 4;
export const MIN_MOVES = 2;
export const TYPES = ['A', 'B', 'C', 'D'];
export const INITIAL = Object.freeze([
  'A', 'D', 'B', 'A',
  'C', 'B', 'A', 'B',
  'D', 'C', 'B', 'C',
  'C', 'D', 'A', 'D',
]);

const kind = (piece) => typeof piece === 'string' ? piece : piece?.type;

export function adjacent(a, b) {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 &&
    a < SIZE * SIZE && b < SIZE * SIZE &&
    Math.abs(a % SIZE - b % SIZE) + Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) === 1;
}

export function swap(board, a, b) {
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function matches(board) {
  const found = new Set();
  for (let axis = 0; axis < 2; axis++) {
    for (let line = 0; line < SIZE; line++) {
      const at = (n) => axis === 0 ? line * SIZE + n : n * SIZE + line;
      for (let start = 0; start < SIZE;) {
        let end = start + 1;
        const type = kind(board[at(start)]);
        while (end < SIZE && type && kind(board[at(end)]) === type) end++;
        if (type && end - start >= 3) {
          for (let n = start; n < end; n++) found.add(at(n));
        }
        start = end;
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

export function legalMoves(board) {
  const result = [];
  for (let a = 0; a < board.length; a++) {
    for (const b of [a + 1, a + SIZE]) {
      if (adjacent(a, b) && kind(board[a]) !== kind(board[b]) && matches(swap(board, a, b)).length) result.push([a, b]);
    }
  }
  return result;
}

// Surviving pieces retain their identity and column order; new pieces start above the board.
export function refill(board, removed, createPiece) {
  const next = Array(SIZE * SIZE);
  const excluded = new Set(removed);
  const arrivals = new Map();
  for (let col = 0; col < SIZE; col++) {
    const survivors = [];
    for (let row = 0; row < SIZE; row++) {
      const index = row * SIZE + col;
      if (!excluded.has(index) && board[index]) survivors.push(board[index]);
    }
    const missing = SIZE - survivors.length;
    for (let row = 0; row < SIZE; row++) {
      const piece = row < missing ? createPiece() : survivors[row - missing];
      next[row * SIZE + col] = piece;
      if (row < missing) arrivals.set(piece.id, { row: row - missing, col });
    }
  }
  return { board: next, arrivals };
}

export function playableBoard(createPiece, random = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const board = Array.from({ length: SIZE * SIZE }, () => createPiece(TYPES[Math.floor(random() * TYPES.length)]));
    if (!matches(board).length && legalMoves(board).length >= MIN_MOVES) return board;
  }
  return INITIAL.map(type => createPiece(type));
}
