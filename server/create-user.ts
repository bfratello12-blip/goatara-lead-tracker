import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Store } from './store.ts';
import { PostgresStore } from './postgres-store.ts';
import { createUser, createUserAsync } from './auth.ts';
import { userSchema } from '../shared/validation.ts';

function passwordPrompt(prompt: string): Promise<string> {
  if (!stdin.isTTY)
    throw new Error('Run this command in an interactive terminal to enter a password securely');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(error?: Error) {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    }
    function onData(buffer: Buffer) {
      for (const character of buffer.toString()) {
        if (character === '\u0003') {
          finish(new Error('Cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    }
    stdin.on('data', onData);
  });
}

try {
  if (process.env.DEMO_MODE === 'true')
    throw new Error('Set DEMO_MODE=false before creating a private team account');
  const reader = createInterface({ input: stdin, output: stdout });
  const name = await reader.question('Full name: ');
  const email = await reader.question('Email: ');
  reader.close();
  const password = await passwordPrompt('Password (at least 12 characters, hidden): ');
  const confirmation = await passwordPrompt('Confirm password (hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match');
  const input = userSchema.parse({ name, email, password, role: 'admin' });
  const useSupabase = process.env.DEMO_MODE !== 'true' && Boolean(process.env.SUPABASE_DB_URL);
  if (useSupabase) {
    const store = new PostgresStore(process.env.SUPABASE_DB_URL!);
    try {
      const user = await createUserAsync(store, input);
      console.log(`Administrator created: ${user.name} <${user.email}>`);
    } finally {
      await store.close();
    }
  } else {
    const store = new Store(process.env.DATABASE_PATH ?? 'data/goatara.sqlite');
    try {
      const user = createUser(store, input);
      console.log(`Administrator created: ${user.name} <${user.email}>`);
    } finally {
      store.close();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not create account');
  process.exitCode = 1;
}
