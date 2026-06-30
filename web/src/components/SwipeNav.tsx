'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// 右スワイプ → ウォッチリスト / 左スワイプ → スケジュール
export default function SwipeNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let startX = 0, startY = 0, noswipe = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      // 横スクロール領域（フィルタ・ライブバー等）から始まったスワイプは無視
      noswipe = !!(e.target as HTMLElement)?.closest?.('[data-noswipe]');
    };

    const onEnd = (e: TouchEvent) => {
      if (noswipe) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // 明確な横スワイプのみ（距離80px以上・横が縦の2倍以上）
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx > 0) {
        if (pathname !== '/watchlist') router.push('/watchlist');
      } else {
        if (pathname !== '/') router.push('/');
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [pathname, router]);

  return <>{children}</>;
}
