import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findUnsafeTemplateNames, validateEnvironment } from './environment-policy.mjs';

function parseEnvFile(path) {
  const parsed = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) parsed[match[1]] = match[2];
  }
  return parsed;
}

function checkRepository() {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const forbiddenEnv = tracked.filter((path) => /^\.env(?:\.|$)/.test(path) && path !== '.env.example');
  const secretPatterns = [
    /sb_secret_[A-Za-z0-9_-]{20,}/,
    /api_[A-Za-z0-9_-]{30,}/,
    /(?:^|[^0-9a-f])0x[0-9a-f]{64}(?:[^0-9a-f]|$)/i,
  ];
  const leaks = [];
  for (const path of tracked.filter((item) => !item.endsWith('package-lock.json'))) {
    const content = readFileSync(path, 'utf8');
    if (secretPatterns.some((pattern) => pattern.test(content))) leaks.push(path);
  }
  return [...forbiddenEnv.map((path) => `tracked_env:${path}`), ...leaks.map((path) => `secret_pattern:${path}`)];
}

const args = new Set(process.argv.slice(2));
const failures = [];
if (args.has('--repository')) failures.push(...checkRepository());
if (args.has('--template')) {
  const template = parseEnvFile(resolve('.env.example'));
  failures.push(...findUnsafeTemplateNames(Object.keys(template)).map((name) => `browser_secret:${name}`));
}
if (!args.has('--repository') && !args.has('--template')) failures.push(...validateEnvironment(process.env));

if (failures.length) {
  console.error(`Environment validation failed: ${[...new Set(failures)].sort().join(', ')}`);
  process.exit(1);
}
console.log('Environment validation passed.');
