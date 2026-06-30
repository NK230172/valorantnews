'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/',          label: 'スケジュール' },
  { href: '/watchlist', label: 'ウォッチリスト' },
];

export default function NavBar() {
  const path = usePathname();

  return (
    <nav
      className="bg-val-card border-b border-val-border sticky top-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-2xl mx-auto flex items-center">
        <span className="px-4 py-3 text-val-red font-black text-lg tracking-tight select-none">
          VAL
        </span>
        <div className="flex ml-2 flex-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                path === t.href
                  ? 'border-val-red text-val-text'
                  : 'border-transparent text-val-muted hover:text-val-text'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {/* 設定（歯車）*/}
        <Link
          href="/settings"
          aria-label="設定"
          className={`px-4 py-3 text-lg transition-colors ${
            path === '/settings' ? 'text-val-red' : 'text-val-muted hover:text-val-text'
          }`}
        >
          ⚙
        </Link>
      </div>
    </nav>
  );
}
