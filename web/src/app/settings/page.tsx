'use client';

import { useEffect, useState } from 'react';
import { enableNotifications, disableNotifications, isNotifyEnabled } from '@/lib/notifications';

export default function SettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setEnabled(isNotifyEnabled()); }, []);

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!enabled) {
        const r = await enableNotifications();
        if (r === 'ok') { setEnabled(true); setMsg('通知をオンにしました'); }
        else if (r === 'denied') setMsg('ブラウザで通知がブロックされています。設定から許可してください。');
        else setMsg('お使いの環境では通知に対応していません。');
      } else {
        await disableNotifications();
        setEnabled(false);
        setMsg('通知をオフにしました');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-md mx-auto">
      <h1 className="text-lg font-bold text-val-text mb-4">設定</h1>

      <div className="bg-val-card border border-val-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <div className="text-sm font-semibold text-val-text">プッシュ通知</div>
            <div className="text-xs text-val-muted mt-1">
              ウォッチリストの試合で、ラウンド取得ごとに通知します。
            </div>
          </div>
          {/* トグルスイッチ */}
          <button
            onClick={toggle}
            disabled={busy}
            aria-label="通知の切り替え"
            className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
              enabled ? 'bg-val-red' : 'bg-val-border'
            } ${busy ? 'opacity-60' : ''}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
        {msg && <div className="text-xs text-val-muted mt-3">{msg}</div>}
      </div>

      <div className="text-[11px] text-val-muted mt-4 leading-relaxed">
        ※ 通知をオンにすると、★を付けた試合のラウンド速報が届きます。<br />
        iPhone はホーム画面に追加した状態で開くと通知が使えます。
      </div>
    </div>
  );
}
