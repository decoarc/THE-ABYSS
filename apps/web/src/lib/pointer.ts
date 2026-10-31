export interface Point {
  x: number;
  y: number;
}

/** Pressionar e soltar a até `thresholdPx` de distância é clique; mais que isso é arrasto de câmera. */
export function isClick(down: Point, up: Point, thresholdPx = 4): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= thresholdPx;
}
