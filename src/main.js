import { INITIAL, SIZE, TYPES, MIN_MOVES, adjacent, swap, matches, legalMoves, refill, playableBoard } from './engine.js';
import { imageMarkup, names } from './presentation.js';

const boardElement = document.querySelector('#board');
const layer = document.querySelector('#pieces');
const status = document.querySelector('#status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const assetBase = import.meta.env.BASE_URL;
let serial = 0;
const createPiece = (type = TYPES[Math.floor(Math.random() * TYPES.length)]) => ({ id: ++serial, type });
let board = INITIAL.map(createPiece);
let selected = null;
let busy = true;
let gesture = null;
const elements = new Map();
// Hydrate the 16 real images already present in the production HTML.
// They remain visible even in an attachment viewer that does not execute JavaScript.
for (const element of layer.querySelectorAll('.piece')) {
  const piece = board[Number(element.dataset.index)];
  if (piece) elements.set(piece.id, element);
}
const pause = (ms) => new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? Math.min(ms, 35) : ms));
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const position = (el, row, col) => { el.style.transform = `translate(${col * 100}%, ${row * 100}%)`; };

function setBusy(value) {
  busy = value;
  boardElement.dataset.busy = String(value);
  boardElement.setAttribute('aria-busy', String(value));
}

function render(arrivals = new Map()) {
  const focused = layer.contains(document.activeElement) ? document.activeElement : null;
  const active = new Set(board.map(piece => piece.id));
  for (const [id, el] of elements) {
    if (!active.has(id)) { el.remove(); elements.delete(id); }
  }
  board.forEach((piece, index) => {
    let el = elements.get(piece.id);
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.className = `piece type-${piece.type}`;
      el.innerHTML = imageMarkup(piece.type, assetBase);
      elements.set(piece.id, el);
      layer.append(el);
    }
    el.dataset.index = index;
    el.dataset.type = piece.type;
    el.setAttribute('aria-label', `${names[piece.type]}, ряд ${Math.floor(index / SIZE) + 1}, столбец ${index % SIZE + 1}`);
    el.setAttribute('aria-pressed', String(selected === index));
    el.classList.toggle('selected', selected === index);
    const from = arrivals.get(piece.id);
    if (from) {
      el.classList.add('arriving');
      position(el, from.row, from.col);
    } else {
      position(el, Math.floor(index / SIZE), index % SIZE);
    }
  });
  // Keep keyboard and assistive technology reading order aligned with the visual board.
  board.forEach((piece, index) => {
    const el = elements.get(piece.id);
    if (layer.children[index] !== el) layer.insertBefore(el, layer.children[index] ?? null);
  });
  if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
}

async function ensurePlayable() {
  if (legalMoves(board).length >= MIN_MOVES) return;
  status.textContent = 'Новые угощения готовы: доступны несколько ходов.';
  layer.classList.add('reshuffling');
  await pause(250);
  board = playableBoard(createPiece);
  render();
  await frame();
  layer.classList.remove('reshuffling');
  await pause(250);
}

async function attemptSwap(a, b) {
  if (busy || !adjacent(a, b)) return;
  setBusy(true);
  selected = null;
  const restoreFocus = layer.contains(document.activeElement);
  board = swap(board, a, b);
  render();
  await pause(280);
  let collected = matches(board);
  if (!collected.length) {
    board = swap(board, a, b);
    render();
    await pause(280);
    status.textContent = 'Нет совпадения. Попробуйте другую перестановку.';
  } else {
    let count = 0;
    let cascade = 0;
    while (collected.length) {
      cascade++;
      count += collected.length;
      for (const index of collected) elements.get(board[index].id).classList.add('matched');
      await pause(520);
      for (const index of collected) elements.get(board[index].id).classList.add('vanishing');
      await pause(280);
      const result = refill(board, collected, createPiece);
      board = result.board;
      render(result.arrivals);
      await frame();
      for (const el of elements.values()) el.classList.remove('arriving');
      render();
      await pause(320);
      collected = matches(board);
      // Bound exceptionally long random cascades without leaving a locked or already-matched board.
      if (cascade >= 30 && collected.length) {
        board = playableBoard(createPiece);
        render();
        collected = [];
      }
    }
    status.textContent = `Собрано угощений: ${count}. Можно сделать следующий ход.`;
    await ensurePlayable();
  }
  if (restoreFocus) elements.get(board[b].id).focus({ preventScroll: true });
  setBusy(false);
}

function choose(index) {
  if (busy) return;
  if (selected === index) selected = null;
  else if (selected !== null && adjacent(selected, index)) { void attemptSwap(selected, index); return; }
  else selected = index;
  render();
}

layer.addEventListener('pointerdown', event => {
  const tile = event.target.closest('.piece');
  if (busy || !tile || gesture || !event.isPrimary || event.button !== 0) return;
  const index = Number(tile.dataset.index);
  gesture = { id: event.pointerId, index, x: event.clientX, y: event.clientY, tile };
  tile.setPointerCapture(event.pointerId);
});

layer.addEventListener('pointermove', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const cell = boardElement.clientWidth / SIZE;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  if (Math.hypot(dx, dy) < 8) return;
  gesture.tile.classList.add('dragging');
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  gesture.tile.style.setProperty('--drag-x', `${horizontal ? Math.max(-cell * .7, Math.min(cell * .7, dx)) : 0}px`);
  gesture.tile.style.setProperty('--drag-y', `${horizontal ? 0 : Math.max(-cell * .7, Math.min(cell * .7, dy))}px`);
});

function endGesture(event, cancelled = false) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const { index, x, y, tile } = gesture;
  gesture = null;
  tile.classList.remove('dragging');
  tile.style.removeProperty('--drag-x');
  tile.style.removeProperty('--drag-y');
  if (tile.hasPointerCapture(event.pointerId)) tile.releasePointerCapture(event.pointerId);
  if (cancelled || busy) return;
  const dx = event.clientX - x;
  const dy = event.clientY - y;
  if (Math.hypot(dx, dy) > Math.max(12, boardElement.clientWidth / SIZE * .18)) {
    const target = index + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * SIZE);
    if (adjacent(index, target)) void attemptSwap(index, target);
  } else choose(index);
}
layer.addEventListener('pointerup', event => endGesture(event));
layer.addEventListener('pointercancel', event => endGesture(event, true));
layer.addEventListener('lostpointercapture', event => endGesture(event, true));
layer.addEventListener('dragstart', event => event.preventDefault());
// Native keyboard and assistive-technology activation has detail=0; pointer taps are handled above.
layer.addEventListener('click', event => {
  const tile = event.target.closest('.piece');
  if (event.detail === 0 && tile) choose(Number(tile.dataset.index));
});
layer.addEventListener('keydown', event => {
  if (event.key === 'Escape') { selected = null; render(); return; }
  const index = Number(event.target.dataset.index);
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE }[event.key];
  if (delta) {
    event.preventDefault();
    if (adjacent(index, index + delta)) elements.get(board[index + delta].id).focus({ preventScroll: true });
  }
});

// Check the actual <img> elements, including the WebP source chosen by Safari.
// onload/naturalWidth are authoritative: a rejected decode() alone does not mean no pixels.
function imageReady(image) {
  return new Promise((resolve, reject) => {
    const loaded = () => { cleanup(); image.naturalWidth ? resolve() : reject(new Error('Empty dessert image')); };
    const failed = () => { cleanup(); reject(new Error(`Could not load ${image.currentSrc || image.src}`)); };
    const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    if (image.complete) loaded();
  });
}
render();
setBusy(true);
Promise.all([...layer.querySelectorAll('img')].map(imageReady)).then(() => {
  boardElement.dataset.images = 'loaded';
  setBusy(false);
}).catch(error => {
  boardElement.dataset.images = 'error';
  status.className = 'load-error';
  status.setAttribute('role', 'alert');
  status.textContent = 'Не удалось загрузить изображения угощений. Обновите страницу.';
  console.error('Dessert image failed to load:', error.message);
});
