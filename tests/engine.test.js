import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL, MIN_MOVES, adjacent, swap, matches, legalMoves, refill, playableBoard } from '../src/engine.js';

test('exact reference layout, four of each dessert, no initial matches, five valid moves', () => {
  assert.deepEqual([...INITIAL], ['A','D','B','A','C','B','A','B','D','C','B','C','C','D','A','D']);
  for (const type of 'ABCD') assert.equal(INITIAL.filter(t => t === type).length, 4);
  assert.deepEqual(matches(INITIAL), []);
  assert.deepEqual(legalMoves(INITIAL), [[2,6], [5,6], [6,7], [6,10], [8,9]]);
});

test('adjacency excludes wrapping, diagonals, same tile and out-of-bounds', () => {
  for (const pair of [[3,4], [0,5], [0,0], [-1,0], [15,16], [0,16]]) assert.equal(adjacent(...pair), false);
  assert.equal(adjacent(0,1), true);
  assert.equal(adjacent(0,4), true);
});

test('valid swap creates a horizontal match and does not mutate the original', () => {
  assert.deepEqual(matches(swap(INITIAL, 2, 6)), [5,6,7]);
  assert.equal(INITIAL[2], 'B');
});

test('valid swap creates a vertical match', () => {
  assert.deepEqual(matches(swap(INITIAL, 5, 6)), [2,6,10]);
});

test('invalid move can be reversed exactly', () => {
  const moved = swap(INITIAL, 0, 1);
  assert.deepEqual(matches(moved), []);
  assert.deepEqual(swap(moved, 0, 1), [...INITIAL]);
});

test('four in a row and intersecting matches clear each cell only once', () => {
  const board = [...INITIAL];
  [0,1,2,3,4,8].forEach(i => { board[i] = 'B'; });
  const result = matches(board);
  for (const i of [0,1,2,3,4,8]) assert.ok(result.includes(i));
  assert.equal(new Set(result).size, result.length);
});

test('empty cells are not matches and do not connect separated runs', () => {
  assert.deepEqual(matches(Array(16).fill(null)), []);
  const board = Array(16).fill(null);
  board[0] = board[1] = board[3] = 'A';
  assert.deepEqual(matches(board), []);
});

test('gravity preserves column order and spawns new pieces above the board', () => {
  let id = 0;
  const create = (type = 'D') => ({ id: ++id, type });
  const original = INITIAL.map(create);
  const { board, arrivals } = refill(original, [5,9,13], create);
  assert.equal(board[13], original[1]);
  for (const i of [1,5,9]) assert.ok(arrivals.get(board[i].id).row < 0);
  for (const i of [0,2,3,4,6,7,8,10,11,12,14,15]) assert.equal(board[i], original[i]);
  assert.equal(new Set(board.map(p => p.id)).size, 16);
});

test('replacement boards always start without matches and have a legal move', () => {
  let seed = 812, id = 0;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let n = 0; n < 100; n++) {
    const board = playableBoard(type => ({ id: ++id, type }), random);
    assert.equal(board.length, 16);
    assert.equal(matches(board).length, 0);
    assert.ok(legalMoves(board).length >= MIN_MOVES);
  }
});

test('replacement terminates even with a pathological random source', () => {
  let id = 0;
  const board = playableBoard(type => ({ id: ++id, type }), () => 0);
  assert.deepEqual(board.map(p => p.type), [...INITIAL]);
});
