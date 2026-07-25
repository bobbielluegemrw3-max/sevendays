import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { ChampionPreview } from './ChampionPreview';

/**
 * /champion 憧れリデザイン プレビュー — デザイナー正典 Champion.html の忠実写経(仕様書.md)。
 * ①HERO(憧れの宣言) ②THE PAYOFF(4枚) ③HALL(空＝最初の王・架空なし/R1) ④LEAGUE(待ち遠しさ反転)。
 * 既定は R1 準拠の空状態(hall/buybacks 空)。管理者のみ・それ以外404。
 * 承認後に本番 ChampionView/ChampionHero へ結線(機構=buybacks/hall API 不変)。
 * ★hero-loop.mp4 はCDN(リポジトリ外)のためプレビューではポスター静止画。本番で実映像。
 */
export default async function ChampionPreviewPage(): Promise<React.JSX.Element> {
  await requireDevPreviewAccess();
  return <ChampionPreview />;
}
