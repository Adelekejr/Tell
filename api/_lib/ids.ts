import { randomBytes, randomInt } from 'node:crypto';
import type { TrapId } from './shared.js';
import { TRAP_IDS } from './shared.js';

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** 128 random bits as 26 lowercase base32 characters. Unguessable: the id is the key. */
export function newRunId(): string {
  const bytes = randomBytes(17); // 136 bits; we keep 130 of them
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z2-7]{26}$/.test(value);
}

/**
 * Plain words that won't turn up in a normal summary of any trap page, plus
 * three digits so a reply can't contain one by chance.
 */
const WORDS = [
  'marigold', 'lantern', 'pebble', 'juniper', 'saffron', 'harbor', 'thistle', 'quartz', 'meadow', 'cobalt',
  'falcon', 'orchid', 'walnut', 'glacier', 'tangerine', 'compass', 'velvet', 'cedar', 'nimbus', 'kestrel',
  'basalt', 'wren', 'opal', 'fennel', 'tundra', 'citrine', 'bramble', 'heron', 'sorrel', 'zephyr',
  'garnet', 'lichen', 'puffin', 'sequoia', 'ember', 'dune', 'larkspur', 'otter', 'magpie', 'cypress',
  'indigo', 'mosaic', 'paprika', 'quill', 'raven', 'sable', 'tamarind', 'umber', 'vireo', 'willow',
  'yarrow', 'acorn', 'bison', 'clover', 'dahlia', 'egret', 'fjord', 'gecko', 'hazel', 'ivy',
  'jasper', 'kumquat', 'lotus', 'mango', 'nutmeg', 'osprey', 'pistachio', 'quince', 'rosemary', 'sparrow',
];

export function newWords(): Record<TrapId, string> {
  const pool = [...WORDS];
  const words = {} as Record<TrapId, string>;
  for (const id of TRAP_IDS) {
    const word = pool.splice(randomInt(pool.length), 1)[0] as string;
    words[id] = `${word}${randomInt(100, 1000)}`;
  }
  return words;
}
