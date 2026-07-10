'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * LPのスクロール出現(正典 handoff-lp の IntersectionObserver 移植)。
 * 交差したら inClassName を一度だけ付与する。IO非対応環境では即時表示。
 */
export function LandingReveal({
  className,
  inClassName,
  threshold = 0.14,
  id,
  children,
}: {
  className: string;
  inClassName: string;
  threshold?: number;
  id?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} id={id} className={shown ? `${className} ${inClassName}` : className}>
      {children}
    </div>
  );
}
