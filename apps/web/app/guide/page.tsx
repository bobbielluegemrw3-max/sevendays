import type { Metadata } from 'next';
import { GuideView } from '@/components/GuideView';

export const metadata: Metadata = {
  title: '使い方ガイド | Seven Days Derby',
  description: '登録からチャンピオン獲得まで — Seven Days Derby の遊び方を初心者向けに図解で解説。',
};

export default function GuidePage() {
  return <GuideView />;
}
