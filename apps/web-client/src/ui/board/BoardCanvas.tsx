import { useEffect, useRef } from 'react';
import type { Entity, ViewState } from '../state/presentationStore';

type BoardCanvasProps = {
  viewState: ViewState;
  entities: Entity[];
};

const TARGET_FRAME_MS = 1000 / 60;
const MAX_BUDGET_MS = 12;

export function BoardCanvas({ viewState, entities }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qualityRef = useRef(1);
  const entitiesRef = useRef(entities);
  const viewStateRef = useRef(viewState);

  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let raf = 0;
    let lastFrameTime = performance.now();

    const draw = () => {
      const start = performance.now();
      const elapsed = start - lastFrameTime;
      lastFrameTime = start;

      if (elapsed > TARGET_FRAME_MS * 1.6) {
        qualityRef.current = Math.max(0.65, qualityRef.current - 0.05);
      } else {
        qualityRef.current = Math.min(1, qualityRef.current + 0.02);
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.floor(canvas.clientWidth * dpr * qualityRef.current);
      const height = Math.floor(canvas.clientHeight * dpr * qualityRef.current);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.setTransform(dpr * qualityRef.current, 0, 0, dpr * qualityRef.current, 0, 0);
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      const latestViewState = viewStateRef.current;
      ctx.save();
      ctx.translate(latestViewState.offsetX, latestViewState.offsetY);
      ctx.scale(latestViewState.zoom, latestViewState.zoom);

      const gridSize = 56;
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      for (let x = -gridSize; x < canvas.clientWidth + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -gridSize);
        ctx.lineTo(x, canvas.clientHeight + gridSize);
        ctx.stroke();
      }
      for (let y = -gridSize; y < canvas.clientHeight + gridSize; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-gridSize, y);
        ctx.lineTo(canvas.clientWidth + gridSize, y);
        ctx.stroke();
      }

      const budgetStart = performance.now();
      for (const entity of entitiesRef.current) {
        if (performance.now() - budgetStart > MAX_BUDGET_MS) {
          break;
        }
        ctx.fillStyle = entity.color;
        ctx.beginPath();
        ctx.arc(entity.x + 28, entity.y + 28, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="board-canvas" aria-label="Tactical board" />;
}
