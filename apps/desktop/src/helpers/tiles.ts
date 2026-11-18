export type TileLayout = { tile: number; photo: number; minHeight: number };

export function fitTiles(
  count: number,
  width: number,
  height: number,
  base: number,
  max: number,
  gap: number,
): TileLayout {
  const perRowAtBase = Math.max(1, Math.floor((width + gap) / (base + gap)));
  const rowsAtBase = Math.ceil(Math.max(count, 1) / perRowAtBase);
  const minHeight = rowsAtBase * base + (rowsAtBase - 1) * gap;
  let tile = base;
  for (let rows = 1; rows <= count; rows++) {
    const perRow = Math.ceil(count / rows);
    const size = Math.min((width - (perRow - 1) * gap) / perRow, (height - (rows - 1) * gap) / rows, max);
    tile = Math.max(tile, Math.floor(size));
  }
  const photo = Math.round(Math.min(base + (tile - base) * 0.3, base * 1.6));
  return { tile, photo, minHeight };
}
