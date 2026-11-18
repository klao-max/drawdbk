export const minimumFitZoom = 0.05;

export function calculateFitTransform({
  canvasWidth,
  canvasHeight,
  minX,
  minY,
  maxX,
  maxY,
  padding = 10,
}) {
  const values = [
    canvasWidth,
    canvasHeight,
    minX,
    minY,
    maxX,
    maxY,
    padding,
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;

  const width = maxX - minX + padding;
  const height = maxY - minY + padding;
  if (width <= 0 || height <= 0 || canvasWidth <= 0 || canvasHeight <= 0)
    return null;

  const rawScale = Math.min(canvasWidth / width, canvasHeight / height);
  if (!Number.isFinite(rawScale) || rawScale <= 0) return null;

  const scale = Math.max(
    minimumFitZoom,
    Math.floor(rawScale * 20) / 20,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    zoom: scale,
    pan: { x: centerX, y: centerY },
  };
}
