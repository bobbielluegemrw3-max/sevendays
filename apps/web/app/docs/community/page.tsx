import type { Metadata } from 'next';
import { CommunityContent } from '@/components/docs/CommunityContent';

export const metadata: Metadata = {
  title: 'The Community',
  description:
    'Seven Days Derby is built and run by the Seven Days Derby Community, not a corporation. A message from the founder, and how the platform is operated.',
};

export default function CommunityPage() {
  return <CommunityContent />;
}
