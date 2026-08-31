import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { ScratchCompletionDto, TitleDto } from '../../services/economyApi';
import { formatWldUnits } from '../../services/economyApi';

interface ScratchCardProps {
  title: TitleDto;
  prepare: (titleId: string) => Promise<ScratchCompletionDto | null>;
  onRevealed: (outcome: ScratchCompletionDto) => void;
}

function paintCover(canvas: HTMLCanvasElement) {
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(ratio, ratio);
  const gradient = context.createLinearGradient(0, 0, rect.width, rect.height);
  gradient.addColorStop(0, '#28233c');
  gradient.addColorStop(0.5, '#6a57a8');
  gradient.addColorStop(1, '#2f2848');
  context.fillStyle = gradient;
  context.fillRect(0, 0, rect.width, rect.height);
  context.fillStyle = 'rgba(255,255,255,.82)';
  context.font = '700 15px system-ui';
  context.textAlign = 'center';
  context.fillText('SCRATCH TO REVEAL', rect.width / 2, rect.height / 2 + 5);
}

export function ScratchCard({ title, prepare, onRevealed }: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outcomeRef = useRef<ScratchCompletionDto | null>(null);
  const drawingRef = useRef(false);
  const checksRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [scratched, setScratched] = useState(0);

  useEffect(() => { if (canvasRef.current) paintCover(canvasRef.current); }, []);

  const ensureOutcome = useCallback(async () => {
    if (outcomeRef.current) return true;
    setLoading(true);
    const outcome = await prepare(title.id);
    setLoading(false);
    if (!outcome) return false;
    outcomeRef.current = outcome;
    setReady(true);
    return true;
  }, [prepare, title.id]);

  const erase = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !outcomeRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    context.arc((clientX - rect.left) * ratio, (clientY - rect.top) * ratio, 25 * ratio, 0, Math.PI * 2);
    context.fill();
    context.restore();
    checksRef.current += 1;
    if (checksRef.current % 5 !== 0) return;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    for (let index = 3; index < pixels.length; index += 16) if ((pixels[index] ?? 255) < 48) clear += 1;
    const percent = Math.min(100, Math.round((clear / (pixels.length / 16)) * 100));
    setScratched(percent);
    if (percent >= 48) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawingRef.current = false;
      navigator.vibrate?.([35, 30, 65]);
      const outcome = outcomeRef.current;
      if (outcome) onRevealed(outcome);
    }
  }, [onRevealed]);

  const pointerDown = async (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!await ensureOutcome()) return;
    drawingRef.current = true;
    erase(event.clientX, event.clientY);
  };

  const accessibleReveal = async () => {
    if (!await ensureOutcome() || !outcomeRef.current) return;
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setScratched(100);
    onRevealed(outcomeRef.current);
  };

  return <article className={`scratch-card interactive-scratch tier-${title.tierCode}`}>
    <div className="scratch-copy"><span>WORLDCAP · {title.tierName.toUpperCase()}</span><h3>{title.serial}</h3><p>Server-persisted result</p></div>
    <div className="scratch-surface-wrap">
      <div className="scratch-underlay" aria-hidden="true">
        <Sparkles size={24} /><strong>{outcomeRef.current ? (BigInt(outcomeRef.current.result.prizeUnits) > 0n ? formatWldUnits(outcomeRef.current.result.prizeUnits) : 'DRAW ENTRY') : 'PRIZE SEALED'}</strong><span>{outcomeRef.current && BigInt(outcomeRef.current.result.prizeUnits) > 0n ? 'simulated prize' : 'still draw eligible'}</span>
      </div>
      <canvas ref={canvasRef} className="scratch-canvas" onPointerDown={(event) => void pointerDown(event)} onPointerMove={(event) => { if (drawingRef.current) erase(event.clientX, event.clientY); }} onPointerUp={() => { drawingRef.current = false; }} onPointerCancel={() => { drawingRef.current = false; }} aria-label={`Scratch ${title.serial}. ${ready ? 'Drag across the surface.' : 'Touch to securely load the result.'}`} />
      {loading ? <span className="scratch-loading"><Loader2 className="spin" /> Securing result…</span> : null}
    </div>
    <div className="scratch-progress"><span style={{ width: `${scratched}%` }} /><small>{ready ? `${scratched}% scratched` : 'Touch the foil to begin'}</small></div>
    <button className="scratch-keyboard" onClick={() => void accessibleReveal()}>Reveal without pointer</button>
  </article>;
}
