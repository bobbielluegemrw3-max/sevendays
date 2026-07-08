import { notFound } from 'next/navigation';
import { ChampionView } from '@/components/champion/ChampionView';

/** Dev-only visual preview of /champion (sample hall + rewards). 404 in prod. */
export default function ChampionPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <ChampionView
      buybacks={[
        { id: 'bb-1111111111111', horse_id: 'h-1', status: 'IN_PROGRESS', total_amount: '200.00', day7_clear_date: '2026-07-05', payments_paid: 3 },
        { id: 'bb-2222222222222', horse_id: 'h-2', status: 'COMPLETED', total_amount: '200.00', day7_clear_date: '2026-06-20', payments_paid: 7 },
      ]}
      hall={[]}
    />
  );
}
