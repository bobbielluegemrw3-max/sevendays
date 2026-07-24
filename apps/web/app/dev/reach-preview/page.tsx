import { requireDevPreviewAccess } from '@/lib/dev-preview';

/* ============================================================================
 * /dev/reach-preview — レース審判「リーチ演出」デザイナーモック(canvas)。
 * ハンドオフ `レースページリーチ演出.zip` の Race Verdict Reach.dc.html を
 * public/dev-reach/ に配置し、iframe で隔離再生(モックは自前の <head>/support.js/
 * canvas を持つため iframe が確実)。管理者のみ・それ以外404。
 * ★canvas演出はスクショに写らない → 実機・フォアグラウンドで PLAY して確認。
 * ========================================================================== */
export default async function ReachPreviewPage() {
  await requireDevPreviewAccess();
  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 16px', color: '#c9a86a', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, letterSpacing: '.04em', borderBottom: '1px solid rgba(255,255,255,.09)' }}>
        レース審判 リーチ演出モック(canvas) — 左の制御盤で「空気」6段 ×「決着」SURVIVE/BURN = 12種を PLAY。
        特に <b>大逆転(期待薄→SURVIVE)</b> ・ <b>激アツBURN</b> ・ <b>フリーズ×2</b> を確認。
        ※スクショ不可・フォアグラウンドで再生。
      </div>
      <iframe
        src="/dev-reach/reach.html"
        title="Race Verdict Reach mock"
        style={{ width: '100%', flex: 1, minHeight: 'calc(100vh - 40px)', border: 'none', display: 'block', background: '#000' }}
      />
    </div>
  );
}
