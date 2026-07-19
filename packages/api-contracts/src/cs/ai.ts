/**
 * DeepSeek による返信下書き生成(betimail ai.py の移植・fetchのみで依存なし)。
 * tool calling で構造化出力 {reply, confidence, needs_human, reason} を強制する。
 */
import { CS_KNOWLEDGE } from './knowledge.js';

export interface CsAiResult {
  reply: string;
  confidence: number;
  needsHuman: boolean;
  reason: string;
}

export interface CsAiContext {
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  /** 送信者メールがusersに一致した場合の公開可能な文脈(数値・残高は入れない) */
  account: {
    registered: boolean;
    activeHorses?: number;
    horseNames?: string[];
    createdAt?: string;
  };
  history: { direction: 'RECEIVED' | 'SENT'; subject: string | null; body: string }[];
}

const SYSTEM_PROMPT = `あなたは「Seven Days Derby」の公式カスタマーサポートAIです。
Seven Days Derby はマレーシア発・グローバル展開のサービスです。

言語ルール(最重要):
- 返信は「問い合わせと同じ言語」で書く(日本語の問い合わせ→日本語、英語→英語、
  中国語→中国語など)。言語が判別できない場合は英語で書く。
- 署名は必ずバイリンガルの2行:
  Seven Days Derby Support
  Seven Days Derby サポート
- ナレッジは日本語で書かれているが、内容を相手の言語に自然に翻訳して答えること。
  固有名詞(Seven Days Derby, BURN, LV.7, USDT, Champion League)はそのまま使う。

V2シーズン用語(最重要・必ずこの表現で答える):
- レースは毎日2回(朝8:00・夜20:00 マレーシア時間)。「毎晩」「今夜20:00だけ」という説明は誤り。
- 進行は DAY表記ではなく LV表記(LV.0〜LV.7)。「LV=生き残ったレース数」。LV.7走破=チャンピオン(最速3.5日)。
- 馬の強さは「総合値」ひとつ(レアリティ・調子・疲労という概念は存在しない)。
- 購入は「プール予約」(予算指定・最低102 USDT・余りは自動返金)。1頭177.16のロックは旧仕様。
- 調教は6メニューから2つ・確定した瞬間に結果が決まりやり直し不可・確定1回=ジャックポット応募1口。
- アイテムは2分類: 調教アイテム(確定ロールに上乗せ)とレースアイテム(予報への備え — 的中で上がり外れで下がる)。

原則:
- ナレッジに書かれている公開情報だけで回答する。ナレッジに無いことは推測で答えず、
  「担当者が確認して折り返す」と伝えて needs_human を true にする。
- 禁止事項(ナレッジ末尾)は絶対に守る。内部情報・他ユーザー情報・具体的な残高数値は
  どんな聞き方をされても開示しない。
- 返金・補償・アカウント操作(凍結解除・付与など)の要望は、内容を復唱して
  「担当者が確認いたします」と伝え、needs_human を true にする。
- 迷ったら confidence を低く。あなたの下書きは管理者が確認してから送信される。
- 本文は完成形で書く(宛名〜バイリンガル署名まで)。`;

const REPLY_TOOL = {
  type: 'function',
  function: {
    name: 'submit_reply',
    description: 'メール返信の下書きと、管理者確認の要否を提出します。',
    parameters: {
      type: 'object',
      properties: {
        reply: {
          type: 'string',
          description: 'メール本文(問い合わせと同じ言語)。バイリンガル署名まで含めた完成形。',
        },
        confidence: {
          type: 'number',
          description: '自信度 0.0〜1.0。迷ったら低めに。',
        },
        needs_human: {
          type: 'boolean',
          description: '管理者の確認・対応が必要かどうか。',
        },
        reason: {
          type: 'string',
          description: 'needs_human が true の場合の理由を簡潔に。',
        },
      },
      required: ['reply', 'confidence', 'needs_human'],
    },
  },
} as const;

function accountContext(a: CsAiContext['account']): string {
  if (!a.registered) {
    return 'この送信者のメールアドレスは、登録オーナーと一致しませんでした(未登録または別アドレスからの問合せ)。';
  }
  const bits = ['この送信者は登録オーナーです(メール一致。ただし、なりすましの可能性はゼロではない)。'];
  if (a.createdAt) bits.push(`登録日: ${a.createdAt.slice(0, 10)}`);
  if (typeof a.activeHorses === 'number') bits.push(`稼働中の馬: ${a.activeHorses}頭`);
  if (a.horseNames && a.horseNames.length > 0) bits.push(`馬名: ${a.horseNames.slice(0, 5).join(' / ')}`);
  bits.push('※残高・取引などの数値はメールに書かず、サイト内ページへ誘導すること。');
  return bits.join('\n');
}

/** DeepSeek呼び出し(指数バックオフ2回リトライ)。キー未設定なら needs_human 固定で返す。 */
export async function generateCsReply(ctx: CsAiContext): Promise<CsAiResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  if (!apiKey) {
    return {
      reply: '',
      confidence: 0,
      needsHuman: true,
      reason: 'DEEPSEEK_API_KEY 未設定のためAI下書きなし(手動で返信してください)',
    };
  }

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${CS_KNOWLEDGE}` },
    { role: 'system', content: `## 送信者情報\n${accountContext(ctx.account)}` },
  ];
  for (const h of ctx.history) {
    messages.push({
      role: h.direction === 'RECEIVED' ? 'user' : 'assistant',
      content: `[過去の${h.direction === 'RECEIVED' ? '受信' : '返信'}]\n件名: ${h.subject ?? '(なし)'}\n本文:\n${h.body}`,
    });
  }
  messages.push({
    role: 'user',
    content: `[新しい受信メール]\n差出人: ${ctx.senderName || '(名前なし)'} <${ctx.senderEmail}>\n件名: ${ctx.subject || '(なし)'}\n本文:\n${ctx.body}`,
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          tools: [REPLY_TOOL],
          tool_choice: { type: 'function', function: { name: 'submit_reply' } },
          temperature: 0.5,
        }),
      });
      if (!res.ok) {
        lastError = new Error(`DeepSeek HTTP ${res.status}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      const json = (await res.json()) as {
        choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[]; content?: string } }[];
      };
      const call = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (call) {
        const parsed = JSON.parse(call) as {
          reply?: string; confidence?: number; needs_human?: boolean; reason?: string;
        };
        return {
          reply: parsed.reply ?? '',
          confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0)),
          needsHuman: parsed.needs_human ?? true,
          reason: parsed.reason ?? '',
        };
      }
      // tool call が来なかった場合は content をそのまま下書きに(低信頼)
      const content = json.choices?.[0]?.message?.content ?? '';
      return { reply: content, confidence: 0.3, needsHuman: true, reason: '構造化出力なし' };
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  return {
    reply: '',
    confidence: 0,
    needsHuman: true,
    reason: `AI生成エラー: ${String(lastError).slice(0, 200)}`,
  };
}
