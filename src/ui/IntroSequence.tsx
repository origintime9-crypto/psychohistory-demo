import { useEffect, useRef, useState } from 'react';
import GalaxyScene from './GalaxyScene';

const INTRO_KEY = 'psychohistory:intro:v1';
export function shouldPlayIntro() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return localStorage.getItem(INTRO_KEY) !== 'done';
  } catch {
    return true;
  }
}
export default function IntroSequence({ onComplete }: { onComplete: () => void }) {
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const skip = useRef<HTMLButtonElement>(null);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skip.current?.focus();
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      try {
        localStorage.setItem(INTRO_KEY, 'done');
      } catch {
        /* Browsing without storage still works. */
      }
      callback.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') complete();
    };
    const timers = [
      setTimeout(() => setStage(1), 1000),
      setTimeout(() => setStage(2), 2450),
      setTimeout(complete, 3200),
    ];
    skip.current?.addEventListener('click', complete);
    document.addEventListener('keydown', key);
    const button = skip.current;
    return () => {
      timers.forEach(clearTimeout);
      button?.removeEventListener('click', complete);
      document.removeEventListener('keydown', key);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <div
      className={`cinematic-intro intro-stage-${stage}`}
      role="dialog"
      aria-modal="true"
      aria-label="银河入场动画"
    >
      <GalaxyScene intro decorative />
      <button ref={skip} type="button" className="intro-skip">
        跳过入场动画 <span>ESC ↗</span>
      </button>
      <div className="intro-copy" aria-live="polite">
        <span>SELDON PROJECT / GALACTIC ARCHIVE</span>
        <h1>{stage === 0 ? '群星之中' : stage === 1 ? '历史正在汇聚' : '未来，尚未写定'}</h1>
        <p>
          {stage === 0
            ? '银河坐标初始化…'
            : stage === 1
              ? '心理史学推演模型已连接'
              : '川陀与端点星已定位 · 开始谢顿计划'}
        </p>
      </div>
      <div className="intro-progress">
        <i />
      </div>
      <span className="intro-coordinate">GALACTIC ERA 12067 · FOUNDATION</span>
    </div>
  );
}
