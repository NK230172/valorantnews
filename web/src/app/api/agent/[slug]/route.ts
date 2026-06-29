// エージェント画像プロキシ
// vlr.gg は外部サイトからの画像ホットリンクを 403 でブロックするため、
// サーバー側で Referer を付けて取得し、CDN キャッシュして返す。

import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = 604800; // 1週間

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9]+$/.test(slug)) {
    return new NextResponse('bad slug', { status: 400 });
  }

  try {
    const res = await fetch(`https://www.vlr.gg/img/vlr/game/agents/${slug}.png`, {
      headers: { Referer: 'https://www.vlr.gg/', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return new NextResponse('not found', { status: 404 });

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch {
    return new NextResponse('error', { status: 502 });
  }
}
