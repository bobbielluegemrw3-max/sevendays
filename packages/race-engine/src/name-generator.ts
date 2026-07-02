import { unitFromParts } from './random.js';

/**
 * Deterministic horse Name Generator (Decision 050/055).
 * Display name = Prefix + Suffix, picked from the owner-fixed vocabulary
 * by mint_seed. NOT an AI. Duplicates resolve via Roman numerals, then a
 * generation code (Royal Thunder, Royal Thunder II, ..., Royal Thunder G13).
 */

export const NAME_PREFIXES_V1 = [
  'Royal', 'Black', 'Golden', 'Silver', 'Crimson', 'Azure', 'Emerald', 'Scarlet',
  'White', 'Shadow', 'Storm', 'Silent', 'Wild', 'Iron', 'Bright', 'Dark',
  'Noble', 'Rapid', 'Mystic', 'Frozen', 'Burning', 'Grand', 'Lucky', 'Brave',
  'Crystal', 'Thunder', 'Desert', 'Ocean', 'Sky', 'Night', 'Dawn', 'Solar',
  'Lunar', 'Wind', 'Rising', 'Falling', 'Sacred', 'Phantom', 'Cosmic', 'Blue',
] as const;

export const NAME_SUFFIXES_V1 = [
  'Thunder', 'Wind', 'Storm', 'Blade', 'Arrow', 'Crown', 'Spirit', 'Runner',
  'Flash', 'Comet', 'Star', 'Knight', 'King', 'Queen', 'Dragon', 'Falcon',
  'Eagle', 'Wolf', 'Tiger', 'Lion', 'River', 'Flame', 'Frost', 'Shadow',
  'Light', 'Dream', 'Glory', 'Legend', 'Strike', 'Hoof', 'Dash', 'Rider',
  'Meteor', 'Tempest', 'Wave', 'Heart', 'Soul', 'Peak', 'Road', 'Mirage',
] as const;

const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export interface NameInput {
  mintSeed: string;
  horseUuid: string;
  version: string;
}

/** Base name (before collision handling), deterministic from mint seed. */
export function generateBaseName(input: NameInput): string {
  const prefixIndex = Math.floor(
    unitFromParts(input.mintSeed, input.horseUuid, 'name_prefix', input.version) *
      NAME_PREFIXES_V1.length,
  );
  const suffixIndex = Math.floor(
    unitFromParts(input.mintSeed, input.horseUuid, 'name_suffix', input.version) *
      NAME_SUFFIXES_V1.length,
  );
  return `${NAME_PREFIXES_V1[prefixIndex]!} ${NAME_SUFFIXES_V1[suffixIndex]!}`;
}

/**
 * Resolve a duplicate: `existingCount` is how many horses already carry the
 * base name (with or without suffix). 0 -> base name; 1 -> "II"; ...;
 * beyond XII -> generation code "G<n>".
 */
export function resolveNameCollision(baseName: string, existingCount: number): string {
  if (existingCount <= 0) return baseName;
  const romanIndex = existingCount - 1;
  if (romanIndex < ROMAN.length) return `${baseName} ${ROMAN[romanIndex]!}`;
  return `${baseName} G${existingCount + 1}`;
}
