import { notFound } from 'next/navigation';
import { Countdown } from '@/components/Countdown';
import { NftHorseArt } from '@/components/NftHorseArt';
import { pickNftShowcase } from '@/lib/nft-visual';
import s from '@/components/landing.module.css';

/**
 * LP⑩ FINAL CTA「まだ名前のない一頭」ゲートカードの表現比較(本番404)。
 * 現行の蹄鉄エンブレム vs 実アートを使った3案を同じ馬・同じ枠で並べる。
 */

function lcg(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x;
  };
}

function GateCard({
  variant,
  label,
  desc,
  children,
}: {
  variant: string;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ maxWidth: 440 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.08em', color: '#00eaff', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12, color: '#8f8ac2', marginBottom: 12, minHeight: 36, lineHeight: 1.6 }}>{desc}</div>
      <div className={s.gateWrap}>
        <span className={s.gateGlow} />
        <div className={s.gateCard}>
          <div className={s.goldbar} />
          <div className={`${s.gateArt} gv-${variant}`}>
            <span className={s.gnum}>GATE 08</span>
            <span className={s.gopen}>READY</span>
            <span className={s.aura} />
            {children}
            <div className={s.gateBars}>
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className={s.gatePlate}>
            <div>
              <div className={s.gpt}>YOUR STALL · DAY 0</div>
              <div className={s.gpn}>まだ名前のない一頭</div>
            </div>
            <span className={s.gpTag}>◇ 枠 空き</span>
          </div>
          <div className={s.gateTimer}>
            <span className={s.gtl}>{'// GATE OPENS IN'}</span>
            <Countdown className={s.gtv} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LpGatePreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const look = pickNftShowcase(4, lcg(20260711))[0]!;
  return (
    <div className={`landing-bleed ${s.page}`} style={{ minHeight: '100vh', padding: '48px clamp(20px,4vw,64px) 80px' }}>
      {/* dev-only: variant styling for the gate horse art */}
      <style>{`
        .gvWrap { position: absolute; inset: 0; z-index: 2; }
        .gvWrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
        .gvLabel { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 3;
          font-family: var(--font-mono); font-size: 8px; letter-spacing: .14em; color: rgba(143,138,194,.5); white-space: nowrap; }
        .gv-sil .gvWrap canvas { filter: brightness(0) drop-shadow(0 0 22px rgba(0,234,255,.6)) drop-shadow(0 0 60px rgba(0,234,255,.28)); }
        .gv-holo .gvWrap canvas { filter: saturate(.22) brightness(1.55) contrast(1.05) opacity(.55) drop-shadow(0 0 18px rgba(0,234,255,.5)); }
        .gv-holo .gvWrap::after { content: ''; position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(180deg, rgba(0,234,255,.13) 0 1px, transparent 1px 4px); mix-blend-mode: screen; }
        .gv-veil .gvWrap canvas { filter: blur(13px) saturate(1.35) brightness(.92); }
        .gv-veil .gvWrap::after { content: ''; position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(70% 60% at 50% 52%, transparent 30%, rgba(10,8,19,.55) 100%); }
      `}</style>
      <h1 style={{ fontFamily: 'var(--font-jp)', fontWeight: 900, fontSize: 24, margin: '0 0 8px' }}>
        LP FINAL CTA — 「まだ名前のない一頭」表現比較
      </h1>
      <p style={{ fontFamily: 'var(--font-jp)', fontSize: 13, color: '#8f8ac2', margin: '0 0 36px' }}>
        同じ馬・同じ枠で4案。ラベルの下がそのままLPに入る見た目です。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '36px 28px' }}>
        <GateCard variant="ph" label="現行 — 蹄鉄エンブレム" desc="空き枠の記号。ただし「画像欠け」に見えるリスクあり(今回の指摘)。">
          <div className={s.horseArt} style={{ color: '#5ff5ff' }}>
            <svg viewBox="0 0 64 64">
              <path d="M16 54 C6 44 6 22 24 14 M48 54 C58 44 58 22 40 14 M24 14 C28 11 36 11 40 14" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
              <circle cx="15.5" cy="52" r="2.4" fill="currentColor" />
              <circle cx="48.5" cy="52" r="2.4" fill="currentColor" />
              <circle cx="12" cy="34" r="2" fill="currentColor" />
              <circle cx="52" cy="34" r="2" fill="currentColor" />
            </svg>
            <span className={s.phLabel}>YOUR NFT — MINTED AT SIGN-UP</span>
          </div>
        </GateCard>
        <GateCard variant="sil" label="案1 — シルエットの影" desc="実アートを黒い影+シアンの縁光に。ゲートの奥に「まだ姿の見えない一頭」が立っている演出。">
          <div className="gvWrap">
            <NftHorseArt look={look} />
            <span className="gvLabel">YOUR NFT — MINTED AT SIGN-UP</span>
          </div>
        </GateCard>
        <GateCard variant="holo" label="案2 — ホログラム(生成待ち)" desc="実アートを走査線入りの半透明ホログラムに。サインアップでDNAから実体化する、という物語。">
          <div className="gvWrap">
            <NftHorseArt look={look} />
            <span className="gvLabel">YOUR NFT — MINTED AT SIGN-UP</span>
          </div>
        </GateCard>
        <GateCard variant="veil" label="案3 — ベール(開封前)" desc="実アートを強くぼかして色の気配だけ見せる。「どんな馬かは迎えるまでのお楽しみ」のガチャ感。">
          <div className="gvWrap">
            <NftHorseArt look={look} />
            <span className="gvLabel">YOUR NFT — MINTED AT SIGN-UP</span>
          </div>
        </GateCard>
      </div>
    </div>
  );
}
