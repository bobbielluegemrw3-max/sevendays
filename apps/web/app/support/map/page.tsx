import { serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { APP_COPY } from '@/lib/i18n';
import { SupportMapView } from '@/components/SupportMapView';
import { demoSupportNetwork } from '@/lib/support-demo';
import type { NetworkNode, PoolMember, SupportSummary } from '@/components/SupportView';

/**
 * /support/map — 組織マップ(Decision 074)。薄い取得層+View。
 * 実ネットワークが空の間はデモ組織(約60名・7ティア)を明示ラベル付きで
 * 表示する(オーナー指示 2026-07-07: UIレビュー用)。仲間が増えると自動で
 * 実データに切り替わる。デモ中は preview=true なので配置操作はローカル動作
 * のみ(APIには何も書かない)。
 */
export default async function SupportMapPage() {
  const lang = await getLang();
  const t = APP_COPY[lang].support;
  const [me, summary, pool, network] = await Promise.all([
    serverApiOrLogin<{ id: string }>('/api/v1/me'),
    serverApiOrLogin<SupportSummary>('/api/v1/support/summary'),
    serverApiOrLogin<{ members: PoolMember[] }>('/api/v1/support/pool'),
    serverApiOrLogin<{ nodes: NetworkNode[] }>('/api/v1/support/network'),
  ]);
  const isDemo = network.nodes.length === 0 && pool.members.length === 0;
  const demo = isDemo ? demoSupportNetwork() : null;
  return (
    <>
      {isDemo ? (
        <p
          className="faint"
          style={{
            fontSize: '0.78rem',
            margin: '0 0 0.6rem',
            padding: '0.5rem 0.9rem',
            border: '1px dashed var(--border-strong)',
            borderRadius: '10px',
          }}
        >
          {t.demo_note}
        </p>
      ) : null}
      <SupportMapView
        preview={isDemo}
        t={t}
        data={{
          selfUserId: me.id,
          selfDisplay: t.self,
          network: demo ? demo.network : network.nodes,
          pool: demo ? demo.pool : pool.members,
          tierAmounts: summary.tier_amounts,
        }}
      />
    </>
  );
}
