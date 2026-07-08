/** チャンピオン殿堂が空の間のサンプル出走馬(決定論dna)。server/client共用。 */
export interface HeroHorse {
  name: string;
  dna_hash: string;
}
const dna = (seed: string): string => `0x${seed.repeat(32).slice(0, 64)}`;
export const SAMPLE_CHAMPIONS: HeroHorse[] = [
  { name: 'Golden Wind', dna_hash: dna('f2') },
  { name: 'Royal Thunder', dna_hash: dna('a1') },
  { name: 'Crimson Nova', dna_hash: dna('3c') },
  { name: 'Azure Comet', dna_hash: dna('1a') },
  { name: 'Neon Mirage', dna_hash: dna('2b') },
  { name: 'Silver Aurora', dna_hash: dna('9d') },
  { name: 'Phantom Frost', dna_hash: dna('6f') },
  { name: 'Emerald Storm', dna_hash: dna('7e') },
  { name: 'Lunar Echo', dna_hash: dna('5b') },
  { name: 'Iron Meteor', dna_hash: dna('8a') },
];
