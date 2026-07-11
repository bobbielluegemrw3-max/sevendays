import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { HorseArt } from '@/components/HorseArt';
import { BASES, deriveHorseArt } from '@/lib/horse-visual';
import { COLORWAYS, deriveHorseArtV2 } from '@/lib/horse-palettes';

/**
 * 案A(キュレーテッドパレット)の判断用プレビュー (404 in production)。
 * ① 24カラーウェイ一覧 ② 同一馬での現行エンジン vs 案A 比較 ③ 案Aのマケプレ風並び。
 */
const NAMES = [
  'Golden Crown', 'Crimson Tiger', 'Azure Comet', 'Emerald Storm', 'Black Tempest', 'Silver Mirage',
  'Mystic Wave', 'Burning Meteor', 'Frozen Peak', 'Royal Legend', 'Wild Soul', 'Desert Arrow',
  'Ocean Spirit', 'Phantom Queen', 'Lucky Star', 'Night Comet', 'Scarlet Flame', 'Lunar Dream',
];
const RARS = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

const card: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.09)', borderRadius: 12, padding: 10,
  background: 'radial-gradient(80% 75% at 50% 42%, rgba(0,234,255,.06), rgba(10,8,19,.9) 75%)',
};
const artBox: React.CSSProperties = { height: 150, position: 'relative' };
const lab: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 };

export default async function PalettePreview() {
  await requireDevPreviewAccess();

  const compare = NAMES.map((name, i) => {
    const dna = `0x${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}${'ab'.repeat(24)}`;
    const rarity = RARS[i % RARS.length]!;
    return { name, rarity, cur: deriveHorseArt(dna, name, rarity), v2: deriveHorseArtV2(dna, name, rarity, BASES) };
  });

  const bases = ['base_01', 'base_24', 'base_16', 'base_10'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <section>
        <h2 style={{ color: 'var(--cyan)' }}>① 24カラーウェイ(設計済み配色)</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          影→ハイライトの金属ランプ+たてがみ+2色目を人間がデザイン。ハイライトは白寄り低彩度=金属光沢を維持。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {COLORWAYS.map((cw, i) => (
            <div key={cw.id} style={{ ...card, borderColor: `hsl(${cw.hue} 55% 55% / .45)` }}>
              <div style={artBox}>
                <HorseArt
                  baseId={bases[i % bases.length]!}
                  coat={cw.coat}
                  coatB={cw.coatB ?? cw.coat}
                  pattern={cw.coatB ? { kind: 'upperLower', edge: 0.5, soft: 0.18 } : { kind: 'solid' }}
                  mane={cw.mane}
                  flip={false}
                  className="pv-art"
                />
              </div>
              <div style={lab}>{cw.label} <span style={{ color: 'var(--faint)' }}>({cw.id}{cw.coatB ? ' · 2tone' : ''})</span></div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ color: 'var(--cyan)' }}>② 同一馬の比較 — 左: 現行(自由HSL) / 右: 案A(パレット)</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>同じ dnaHash・同じ実名・同じレア度。違うのは色の決め方だけ。</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {compare.map(({ name, rarity, cur, v2 }) => (
            <div key={name} style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={artBox}>
                  <HorseArt baseId={cur.baseId} coat={cur.coat} coatB={cur.coatB} pattern={cur.pattern} mane={cur.mane} flip={false} className="pv-art" />
                </div>
                <div style={{ ...artBox, borderLeft: '1px dashed rgba(255,255,255,.12)' }}>
                  <HorseArt baseId={v2.baseId} coat={v2.coat} coatB={v2.coatB} pattern={v2.pattern} mane={v2.mane} flip={false} className="pv-art" />
                </div>
              </div>
              <div style={lab}>
                {name} <span style={{ color: 'var(--faint)' }}>{rarity} · 右={v2.colorway}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ color: 'var(--cyan)' }}>③ 案Aのマケプレ風 8枚(多様性チェック)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {['Golden Wolf', 'Crimson Heart', 'Azure Storm', 'Emerald Blade', 'Phantom Rider', 'Silver Comet', 'Burning Crown', 'Ocean Flash'].map((name, i) => {
            const dna = `0x${((i + 7) * 40503 >>> 0).toString(16).padStart(8, '0')}${'cd'.repeat(24)}`;
            const v = deriveHorseArtV2(dna, name, RARS[i % 5]!, BASES);
            return (
              <div key={name} style={{ ...card, borderColor: v.frameLine, boxShadow: `0 0 18px -6px ${v.frameGlow}` }}>
                <div style={artBox}>
                  <HorseArt baseId={v.baseId} coat={v.coat} coatB={v.coatB} pattern={v.pattern} mane={v.mane} flip={false} className="pv-art" />
                </div>
                <div style={lab}>{name} <span style={{ color: 'var(--faint)' }}>({v.colorway})</span></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* HorseArt canvas fills its box */}
      <style>{`.pv-art { display:block; width:100%; height:100%; object-fit:contain; }`}</style>
    </div>
  );
}
