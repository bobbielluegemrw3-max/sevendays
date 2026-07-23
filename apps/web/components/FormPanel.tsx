// =========================================================================
// Seven Days Derby — 馬柱パネル 差し替えJSX（デザイン側 handoff 2026-07-23）
// 正典: 馬柱.zip / Form Table Composition.html・仕様 FORM_TABLE_DESIGN_BRIEF.md
//
// ・データ/ロジックは不変。readFormV3 と既存の戦績クエリの返り値だけを表示。
// ・生値は出さない。出せるのは過去実着順と曖昧ヒント(strong/weak/even/unknown)のみ。
// ・断定しない。予報は「的中率70%・目安」。
// ・アイコンは Manus発注エンブレム差し込み枠(.condIco/.axIco・26/24px)。今は絵文字/CSS図形の仮置き。
// ・domain → FormPanelData の変換は lib/form-panel-data.ts(readFormV3 / aggregateVerdictV3 準拠)。
// =========================================================================
import s from '../app/horse-detail.module.css';

export type FormPanelAxis = 'weather' | 'ground' | 'course';
export type FormPanelHint = 'strong' | 'weak' | 'even' | 'unknown';

export interface FormPanelRun {
  weather: string; // 例 '雨' '晴' '嵐' '曇'
  ground: string; //  例 '稍重' '不良' '良' '高速'
  course: string; //  '芝' | 'ダート'
  rank: number;
  entrants: number;
  match: Partial<Record<FormPanelAxis, boolean>>; // 今夜の予報と同じ側で走ったか
}
export interface FormPanelAxisRead {
  axis: FormPanelAxis;
  name: string;
  label: string;
  runs: string[];
  hint: FormPanelHint;
}
export interface FormPanelData {
  kana: string;
  en: string;
  total_value: number;
  horse_type: string;
  forecast: { weather: string; ground: string; course: string };
  runs: FormPanelRun[]; // 新しい順・直近5走
  reads: FormPanelAxisRead[]; // 天候/馬場/コースの3軸
  verdict: { cls: FormPanelHint; mark: string; head: string; sub: string };
  isRookie: boolean;
}

// 条件の意味色(レースページ DailyDerbyStage / MyDerbyRecord と同一。§3-1)。
// ★赤(#ff5c5c)は BURN/危険専用。馬場「不良(HEAVY)」は赤ではなく濃い琥珀 #d87b3a。
const COND_COLOR: Record<string, string> = {
  晴: '#ffd97a', 曇: '#aab4c8', 雨: '#6fc3ff', 嵐: '#c78cff',
  高速: '#00eaff', 良: '#35d07f', 良馬場: '#35d07f', 道悪: '#e6b24a', 稍重: '#e6b24a', 重: '#e6b24a', 不良: '#d87b3a',
  芝: '#58d68d', ダート: '#d8a05a',
};
const condColor = (v: string): string => COND_COLOR[v] ?? 'var(--text)';

// 6条件エンブレム(Manus納品・public/conditions/emblem_*.webp)。具体条件→6グループへ写像。
const EMBLEM: Record<string, string> = {
  雨: 'rain', 嵐: 'rain', 晴: 'sun', 曇: 'sun',
  道悪: 'mud', 稍重: 'mud', 不良: 'mud',
  良馬場: 'firm', 良: 'firm', 高速: 'firm', 芝: 'turf', ダート: 'dirt',
};
// 絵文字フォールバック(万一エンブレム未対応の語が来た時)。
const ICO_FALLBACK: Record<string, string> = {
  雨: '🌧', 嵐: '🌧', 晴: '☀', 曇: '☀', 道悪: '🟤', 稍重: '🟤', 不良: '🟤',
  良馬場: '🟩', 良: '🟩', 高速: '🟩', 芝: '🌱', ダート: '🟫',
};
function emblemSrc(k: string): string | null {
  const c = EMBLEM[k];
  return c ? `/conditions/emblem_${c}.webp` : null;
}
/** エンブレム枠(条件アイコン)。画像があれば埋め、無ければ絵文字。枠サイズはCSS(26/24px)。 */
function Emblem({ value, className }: { value: string; className: string | undefined }) {
  const src = emblemSrc(value);
  return <span className={className}>{src ? <img src={src} alt="" /> : (ICO_FALLBACK[value] ?? '?')}</span>;
}

function CondCell({ value, axis, v2 }: { value: string; axis: string; v2?: boolean }) {
  return (
    <div className={s.cond}>
      {v2 ? null : <Emblem value={value} className={s.condIco} />}
      <div className={s.condVal} style={v2 ? { color: condColor(value), fontWeight: 800 } : undefined}>{value}</div>
      <div className={s.condAxis}>{axis}</div>
    </div>
  );
}

function RunRow({ r, v2 }: { r: FormPanelRun; v2?: boolean }) {
  const matched = Object.values(r.match).filter(Boolean).length;
  const isMatch = matched >= 2; // 2軸以上一致=読解の根拠行として強調
  const cls = isMatch ? s.match : matched === 0 ? s.dim : '';
  const cc = (v: string) => (v2 ? { color: condColor(v), fontWeight: 700 } : undefined);
  return (
    <tr className={cls}>
      <td className={s.wx}>
        {v2 ? null : <><Emblem value={r.weather} className={s.wxIco} /> </>}
        <span style={cc(r.weather)}>{r.weather}</span>
      </td>
      <td><span style={cc(r.ground)}>{r.ground}</span></td>
      <td><span style={cc(r.course)}>{r.course}</span></td>
      <td className={s.rk}>
        <b>{r.rank}</b>
        <span className={s.den}>/{r.entrants}</span>
        {isMatch && <span className={s.tick}>◂根拠</span>}
      </td>
    </tr>
  );
}

function AxisRow({ a, v2 }: { a: FormPanelAxisRead; v2?: boolean }) {
  return (
    <div className={s.axis}>
      {v2 ? null : <Emblem value={a.name} className={s.axIco} />}
      <div>
        <div className={s.axName} style={v2 ? { color: condColor(a.name) } : undefined}>「{a.name}」</div>
        <div className={s.axRuns}>
          {a.runs.length
            ? a.runs.map((x, i) => (
                <span key={i}>
                  <span className={a.hint === 'strong' ? s.hi : ''}>{x}</span>
                  {i < a.runs.length - 1 ? ' · ' : ''}
                </span>
              ))
            : 'まだ走っていない'}
        </div>
      </div>
      <div className={`${s.axHint} ${s[a.hint]}`}>{a.label}</div>
    </div>
  );
}

export function FormPanel({ d, variant = 'v1' }: { d: FormPanelData; variant?: 'v1' | 'v2' }) {
  const fc = d.forecast;
  const v2 = variant === 'v2';
  return (
    <div className={v2 ? `${s.form} ${s.formV2}` : s.form}>
      <div className={s.fHead}>
        <div>
          <div className={s.fKana}>{d.kana}</div>
          <div className={s.fEn}>{d.en}</div>
          <span className={s.fType}>{d.horse_type}</span>
        </div>
        <div className={s.fTv}>
          <div className={s.fTvNum}>{d.total_value}</div>
          <div className={s.fTvCap}>総合値</div>
        </div>
      </div>

      {/* ① 今夜の予報 = 問い */}
      <div className={s.fcast}>
        <div className={s.fcTitle}>
          {v2 ? '今夜の予報' : '今夜の予報 — 問い'}<span className={s.fcHit}>的中率70% · 目安</span>
        </div>
        <div className={s.fcRow}>
          <CondCell value={fc.weather} axis="天候" v2={v2} />
          <CondCell value={fc.ground} axis="馬場" v2={v2} />
          <CondCell value={fc.course} axis="コース" v2={v2} />
        </div>
      </div>

      {/* ② 馬柱 = 材料 */}
      <div className={s.fTableWrap}>
        <div className={s.fTblCap}>
          成績表 — 推理の材料（直近{d.runs.length}走）
          <span className={s.leg}>
            <i />
            予報に一致した走
          </span>
        </div>
        <table className={s.ftbl}>
          <thead>
            <tr>
              <th>天候</th>
              <th>馬場</th>
              <th>コース</th>
              <th className={s.rk}>着順</th>
            </tr>
          </thead>
          <tbody>
            {d.runs.map((r, i) => (
              <RunRow key={i} r={r} v2={v2} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ③ 読解 = 答え */}
      <div className={s.read}>
        <div className={s.readTitle}>{v2 ? 'レース予想板' : '読解 — 答え'}</div>
        <div className={`${s.verdict} ${s[d.verdict.cls]}`}>
          <div className={s.vMark}>{d.verdict.mark}</div>
          <div className={s.vText}>
            <div className={s.vHead}>{d.verdict.head}</div>
            <div className={s.vSub}>{d.verdict.sub}</div>
          </div>
        </div>
        <div className={s.axes}>
          {d.reads.map((a) => (
            <AxisRow key={a.axis} a={a} v2={v2} />
          ))}
        </div>
        {d.isRookie && (
          <>
            <div className={s.rookieNote}>
              走ったぶんだけ、この馬の得意が<b>読めてくる</b>。今は材料が少ない＝これからの推理枠。
            </div>
            <div className={s.futureRail}>
              <span className={s.on} />
              <span />
              <span />
              <span />
              <span />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
