import { hash } from '@node-rs/argon2';

async function main(): Promise<void> {
  const password = process.argv[2];

  if (!password) {
    console.error('usage: pnpm --filter @sfl/api hash:password -- <password>');
    process.exit(1);
  }

  const encoded = await hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  console.log(encoded);
}

void main();
