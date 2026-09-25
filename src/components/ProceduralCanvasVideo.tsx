import React, { useRef, useEffect, memo } from 'react';

// Parent components only need a coarse playhead; reporting every animation
// frame would re-render the whole React tree 60 times per second.
const TIME_REPORT_INTERVAL_MS = 250;

interface ProceduralCanvasVideoProps {
  videoId: string;
  category: string;
  title: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
  speed: number;
  showOverlay?: boolean;
}

export const ProceduralCanvasVideo = memo<ProceduralCanvasVideoProps>(function ProceduralCanvasVideo({
  videoId,
  category,
  title,
  isPlaying,
  currentTime,
  duration,
  onTimeUpdate,
  speed,
  showOverlay = true
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number>(performance.now());
  const timeRef = useRef<number>(currentTime);
  const showOverlayRef = useRef<boolean>(showOverlay);
  const overlayAlphaRef = useRef<number>(showOverlay ? 1 : 0);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const lastReportedTimeRef = useRef<number>(currentTime);
  const renderFrameRef = useRef<((now: number) => void) | null>(null);

  onTimeUpdateRef.current = onTimeUpdate;
  showOverlayRef.current = showOverlay;

  // Only adopt the prop when it differs from what we last reported, i.e. an
  // external seek — otherwise the echo would pull the playhead backwards.
  useEffect(() => {
    if (currentTime !== lastReportedTimeRef.current) {
      timeRef.current = currentTime;
      lastReportedTimeRef.current = currentTime;
      // While paused the loop is idle, so repaint once to show the new position
      if (!isPlaying && renderFrameRef.current) {
        animFrameRef.current = requestAnimationFrame(renderFrameRef.current);
      }
    }
  }, [currentTime, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    lastTimestampRef.current = performance.now();
    let lastReportAt = 0;

    const renderFrame = (now: number) => {
      const dt = (now - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = now;

      let localTime = timeRef.current;
      if (isPlaying) {
        localTime += dt * speed;
        if (localTime > duration) {
          localTime = 0;
        }
        timeRef.current = localTime;
        if (now - lastReportAt >= TIME_REPORT_INTERVAL_MS) {
          lastReportAt = now;
          lastReportedTimeRef.current = localTime;
          onTimeUpdateRef.current(localTime);
        }
      }

      const w = canvas.width;
      const h = canvas.height;
      const t = localTime;

      // Draw background dynamic graphic based on video category
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, w, h);

      if (category === 'Design' || category === 'Engineering') {
        // Monolithic isometric architectural grid + animated ray traces
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        const gridStep = 40;
        ctx.beginPath();
        for (let x = 0; x < w; x += gridStep) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += gridStep) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();

        // Draw animated rotating geometric architectural prism
        const cx = w / 2;
        const cy = h / 2;
        const rot = t * 0.4;
        const scale = 140 + Math.sin(t * 0.8) * 15;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        // Core glow
        const radGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, scale * 1.5);
        radGrad.addColorStop(0, 'rgba(225, 29, 72, 0.25)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(0, 0, scale * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Concrete volumes
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.strokeRect(-scale / 2, -scale / 2, scale, scale);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-scale * 0.4, -scale * 0.4, scale * 0.8, scale * 0.8);

        ctx.restore();

      } else if (category === 'Space' || category === 'Science') {
        // Quantum cosmic particle field & orbital wave
        const cx = w / 2;
        const cy = h / 2;
        const particlesCount = 80;

        // One path per colour instead of one fill call per particle
        for (let parity = 0; parity < 2; parity++) {
          ctx.fillStyle = parity === 0 ? 'rgba(56, 189, 248, 0.7)' : 'rgba(244, 63, 94, 0.8)';
          ctx.beginPath();
          for (let i = parity; i < particlesCount; i += 2) {
            const angle = (i / particlesCount) * Math.PI * 2 + t * 0.2;
            const dist = 60 + (i * 3.5) % 200 + Math.sin(t * 1.2 + i) * 20;
            const px = cx + Math.cos(angle) * dist;
            const py = cy + Math.sin(angle) * (dist * 0.55);
            const size = 1.5 + ((i % 5) === 0 ? 2 : 0);
            ctx.moveTo(px + size, py);
            ctx.arc(px, py, size, 0, Math.PI * 2);
          }
          ctx.fill();
        }

        // Center singularity pulse
        const pulse = 30 + Math.sin(t * 2) * 8;
        const pGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, pulse * 2.5);
        pGrad.addColorStop(0, '#38bdf8');
        pGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.3)');
        pGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, pulse * 2, 0, Math.PI * 2);
        ctx.fill();

      } else {
        // Ambient organic sine wave audio harmonic visualizer
        ctx.lineWidth = 2.5;
        const wavesCount = 5;
        for (let wave = 0; wave < wavesCount; wave++) {
          ctx.beginPath();
          const hue = 340 + wave * 10;
          ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${0.25 + wave * 0.15})`;
          for (let x = 0; x < w; x += 6) {
            const freq = 0.008 + wave * 0.003;
            const y = (h / 2) + Math.sin(x * freq + t * (1.5 + wave * 0.3)) * (40 + wave * 12);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Minimalist Assembly Cocoa On-Screen Telemetry Overlay (eases in/out)
      const targetAlpha = showOverlayRef.current || !isPlaying ? 1 : 0;
      overlayAlphaRef.current = isPlaying
        ? overlayAlphaRef.current + (targetAlpha - overlayAlphaRef.current) * Math.min(1, dt * 6)
        : targetAlpha;

      if (overlayAlphaRef.current > 0.01) {
        ctx.save();
        ctx.globalAlpha = overlayAlphaRef.current;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(16, h - 42, 280, 26);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.strokeRect(16, h - 42, 280, 26);

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#10b981';
        ctx.fillText('● HARDWARE STREAM OK', 24, h - 25);
        ctx.fillStyle = '#a1a1aa';
        ctx.fillText(`60FPS · ULTRA BUFFER · 0ms`, 160, h - 25);
        ctx.restore();
      }

      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(renderFrame);
      }
    };

    renderFrameRef.current = renderFrame;
    animFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, videoId, category, duration, speed]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      className="w-full h-full object-contain cursor-pointer"
    />
  );
});
