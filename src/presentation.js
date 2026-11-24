import { ARTWORK } from './artwork.js';

export const names = {
  A: 'Песочное печенье с красным сердечком',
  B: 'Шоколадное печенье с сердечком',
  C: 'Кекс с радужным кремом',
  D: 'Кекс с розово-белым кремом',
};

export function imageMarkup(type, base = './') {
  const files = ARTWORK[type];
  return `<picture><source type="image/webp" srcset="${base}assets/${files.webp}"><img class="dessert" src="${base}assets/${files.png}" width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" loading="eager"></picture>`;
}

export function initialMarkup(types, base) {
  return types.map((type, index) => `<button type="button" class="piece type-${type}" data-index="${index}" data-type="${type}" aria-label="${names[type]}, ряд ${Math.floor(index / 4) + 1}, столбец ${index % 4 + 1}" aria-pressed="false" style="transform:translate(${index % 4 * 100}%,${Math.floor(index / 4) * 100}%)">${imageMarkup(type, base)}</button>`).join('\n');
}
