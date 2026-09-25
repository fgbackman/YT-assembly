import React, { useRef, useEffect } from 'react';

interface ProceduralCanvasVideoProps {
  videoId: string;
  category: string;
  title: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
  speed: number;
  volume?: number;
  isMuted?: boolean;
}

export const ProceduralCanvasVideo: React.FC<ProceduralCanvasVideoProps> = ({
  videoId,
  category,
  title,
  isPlaying,
  currentTime,
  duration,
  onTimeUpdate,
  speed,
  volume = 0.85,
  isMuted = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number>(performance.now());
  const timeRef = useRef<number>(currentTime);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  // Ambient sound synthesizer when procedural engine is playing
  useEffect(() => {
    if (!isPlaying || isMuted) {
      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
      }
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!audioCtxRef.current) {
        const ctx = new AudioCtxClass();
        audioCtxRef.current = ctx;

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0, ctx.currentTime);
        masterGain.connect(ctx.destination);
        masterGainRef.current = masterGain;

        // Base harmonic frequencies for generative ambient chord
        const freqs = category === 'Space' || category === 'Science' 
          ? [110, 164.81, 220, 329.63] // A minor / cosmic space
          : category === 'Design' || category === 'Engineering'
          ? [130.81, 164.81, 196.00, 261.63] // C major / architectural structure
          : [146.83, 174.61, 220.00, 293.66]; // D minor warm tape ambient

        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(450 + idx * 80, ctx.currentTime);

          gain.gain.setValueAtTime(0.02 / (idx + 1), ctx.currentTime);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          osc.start();
        });
      }

      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      if (masterGainRef.current) {
        const targetVol = isMuted ? 0 : Math.min(0.2, volume * 0.15);
        masterGainRef.current.gain.setTargetAtTime(targetVol, audioCtxRef.current.currentTime, 0.1);
      }
    } catch {
      // AudioContext could be blocked by browser autoplay policy
    }

    return () => {
      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
      }
    };
  }, [isPlaying, isMuted, volume, category]);

  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localTime = timeRef.current;
    lastTimestampRef.current = performance.now();

    const renderFrame = (now: number) => {
      const dt = (now - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = now;

      if (isPlaying) {
        localTime += dt * speed;
        if (localTime > duration && duration > 0) {
          localTime = 0;
        }
        timeRef.current = localTime;
        onTimeUpdateRef.current(localTime);
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
        for (let x = 0; x < w; x += gridStep) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += gridStep) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

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

        for (let i = 0; i < particlesCount; i++) {
          const angle = (i / particlesCount) * Math.PI * 2 + t * 0.2;
          const dist = 60 + (i * 3.5) % 200 + Math.sin(t * 1.2 + i) * 20;
          const px = cx + Math.cos(angle) * dist;
          const py = cy + Math.sin(angle) * (dist * 0.55);
          const size = 1.5 + ((i % 5) === 0 ? 2 : 0);

          ctx.fillStyle = i % 2 === 0 ? 'rgba(56, 189, 248, 0.7)' : 'rgba(244, 63, 94, 0.8)';
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
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

      // Minimalist Assembly Cocoa On-Screen Telemetry Overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(16, h - 42, 340, 26);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.strokeRect(16, h - 42, 340, 26);

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#10b981';
      ctx.fillText('● HARDWARE GENERATIVE OK', 24, h - 25);
      ctx.fillStyle = '#a1a1aa';
      ctx.fillText(`60FPS · STEREO SYNTH · 0ms`, 180, h - 25);

      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(renderFrame);
      }
    };

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
};
