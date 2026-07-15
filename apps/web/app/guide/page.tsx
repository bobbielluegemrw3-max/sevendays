import type { Metadata } from 'next';
import { getLang } from '@/lib/i18n-server';
import { GuideView } from '@/components/GuideView';

export const metadata: Metadata = {
  title: '使い方ガイド | Seven Days Derby',
  description: '登録からチャンピオン獲得まで — Seven Days Derby の遊び方を初心者向けに図解で解説。',
};

export default async function GuidePage() {
  const lang = await getLang();
  return <GuideView lang={lang} />;
}
