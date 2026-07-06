import { redirect } from 'next/navigation';

/** 旧URL互換(Decision 075): /buybacks/[id] → /champion/[id]。 */
export default async function LegacyBuybackDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  redirect(`/champion/${id}`);
}
