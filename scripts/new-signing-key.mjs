#!/usr/bin/env node
/**
 * Makes a new Ed25519 signing key for scorecards, on your own computer.
 *
 *   node scripts/new-signing-key.mjs        # key version 1 -> TELL_SIGNING_KEY_V1
 *   node scripts/new-signing-key.mjs 2      # a rotation    -> TELL_SIGNING_KEY_V2
 *   node scripts/new-signing-key.mjs --value-file
 *       also writes .secrets/tell-signing-key-v<n>.value holding only the
 *       value, for tools that read a variable's value from a file
 *       (`vercel env add NAME production < file`, or an upload by file path)
 *       so the key is never shown on screen or typed anywhere.
 *
 * The private key is written ONLY to .secrets/tell-signing-key-v<n>.env
 * (gitignored, readable only by you). Nothing secret is printed. Copy the
 * value into Vercel yourself, then delete the file. Never paste it into a
 * chat, an issue or a commit.
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const valueFile = args.includes('--value-file');
const version = Number(args.find((a) => !a.startsWith('--')) ?? '1');
if (!Number.isInteger(version) || version < 1 || version > 999) {
  console.error('Key version must be a whole number from 1 to 999.');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.secrets');
const file = join(dir, `tell-signing-key-v${version}.env`);
const valuePath = join(dir, `tell-signing-key-v${version}.value`);
for (const f of valueFile ? [file, valuePath] : [file]) {
  if (existsSync(f)) {
    console.error(`${relative(process.cwd(), f)} already exists. Not overwriting it.`);
    process.exit(1);
  }
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const secret = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const pub = publicKey.export({ format: 'jwk' }).x;

mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(
  file,
  [
    '# PRIVATE. Never commit, share or paste this anywhere except Vercel.',
    `# Vercel > Project > Settings > Environment Variables: name TELL_SIGNING_KEY_V${version}, value below (the part after =).`,
    `# Key id: k${version}. Public key (safe to share, base64url): ${pub}`,
    `TELL_SIGNING_KEY_V${version}=${secret}`,
    '',
  ].join('\n'),
  { mode: 0o600, flag: 'wx' },
);

if (valueFile) writeFileSync(valuePath, secret, { mode: 0o600, flag: 'wx' });

console.log(`Wrote ${relative(process.cwd(), file)} (gitignored, only you can read it).`);
if (valueFile) console.log(`Wrote ${relative(process.cwd(), valuePath)} too: the value alone, for uploading from a file.`);
console.log(`Next: add TELL_SIGNING_KEY_V${version} to Vercel from that file, redeploy, then delete the .secrets folder.`);
