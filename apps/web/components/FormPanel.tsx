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

// アイコンは後で Manus エンブレムに差し替え。今は絵文字の仮置き(枠 .condIco/.axIco は確保済み)。
const ICO: Record<string, string> = {
  雨: '🌧', 嵐: '🌧', 晴: '☀', 曇: '☀', 道悪: '🟤', 稍重: '🟤', 不良: '🟤',
  良馬場: '🟩', 良: '🟩', 高速: '🟩', 芝: '🌱', ダート: '🟫',
};
const icoOf = (k: string) => ICO[k] ?? '?';

function CondCell({ value, axis }: { value: string; axis: string }) {
  return (
    <div className={s.cond}>
      <div className={s.condIco}>{icoOf(value)}</div>
      <div className={s.condVal}>{value}</div>
      <div className={s.condAxis}>{axis}</div>
    </div>
  );
}

function RunRow({ r }: { r: FormPanelRun }) {
  const matched = Object.values(r.match).filter(Boolean).length;
  const isMatch = matched >= 2; // 2軸以上一致=読解の根拠行として強調
  const cls = isMatch ? s.match : matched === 0 ? s.dim : '';
  return (
    <tr className={cls}>
      <td className={s.wx}>
        {icoOf(r.weather)} {r.weather}
      </td>
      <td>{r.ground}</td>
      <td>{r.course}</td>
      <td className={s.rk}>
        <b>{r.rank}</b>
        <span className={s.den}>/{r.entrants}</span>
        {isMatch && <span className={s.tick}>◂根拠</span>}
      </td>
    </tr>
  );
}

function AxisRow({ a }: { a: FormPanelAxisRead }) {
  return (
    <div className={s.axis}>
      <div className={s.axIco}>{icoOf(a.name)}</div>
      <div>
        <div className={s.axName}>「{a.name}」</div>
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

export function FormPanel({ d }: { d: FormPanelData }) {
  const fc = d.forecast;
  return (
    <div className={s.form}>
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
          今夜の予報 — 問い<span className={s.fcHit}>的中率70% · 目安</span>
        </div>
        <div className={s.fcRow}>
          <CondCell value={fc.weather} axis="天候" />
          <CondCell value={fc.ground} axis="馬場" />
          <CondCell value={fc.course} axis="コース" />
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
              <RunRow key={i} r={r} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ③ 読解 = 答え */}
      <div className={s.read}>
        <div className={s.readTitle}>読解 — 答え</div>
        <div className={`${s.verdict} ${s[d.verdict.cls]}`}>
          <div className={s.vMark}>{d.verdict.mark}</div>
          <div className={s.vText}>
            <div className={s.vHead}>{d.verdict.head}</div>
            <div className={s.vSub}>{d.verdict.sub}</div>
          </div>
        </div>
        <div className={s.axes}>
          {d.reads.map((a) => (
            <AxisRow key={a.axis} a={a} />
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
