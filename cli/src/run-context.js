// Choose the ceremony and its work directory, and record progress logs.
//
// Why it exists: Retries must find the same key from any current directory.
// Contributors must not need to type the ceremony ID.
//
// How it works:
// - Each ceremony has a folder `ceremonies/<name>/` with a `ceremony.json` file.
// - The user gives the ceremony name. One ceremony in the repository needs no name.
// - The work directory is `<repository>/ceremony-work/<network>/<ceremony-id>`
//   unless the user gives `--workdir`.
// - The progress log removes private values, such as the funding link.
import fs from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export const CEREMONY_ID = /^0x[0-9a-fA-F]{64}$/;
const NETWORKS = ['testnet', 'mainnet'];

let logFile;
let secrets = [];

// A ceremony name is the name of its folder in `ceremonies/`.
const CEREMONY_NAME = /^[a-z0-9][a-z0-9-]*$/;

// List the ceremonies in the repository, in alphabetical order.
export function listCeremonies(root) {
  const dir = path.join(root, 'ceremonies');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => CEREMONY_NAME.test(name) && fs.existsSync(path.join(dir, name, 'ceremony.json')))
    .sort();
}

// Read the configuration of the named ceremony. Without a name, the repository must have one ceremony.
export function readCeremonyConfig(root, name) {
  const names = listCeremonies(root);
  const list = names.length ? ` Available: ${names.join(', ')}.` : '';
  if (name) {
    if (!names.includes(name)) throw new Error(`unknown ceremony "${name}".${list}`);
  } else {
    if (names.length === 0) return null;
    if (names.length > 1) throw new Error(`This repository has more than one ceremony. Give the name of your ceremony.${list}`);
    name = names[0];
  }
  const file = path.join(root, 'ceremonies', name, 'ceremony.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`${file} is not valid JSON`); }
  if (!CEREMONY_ID.test(config?.ceremonyId || '') || !NETWORKS.includes(config.network)) {
    throw new Error(`${file} must set "ceremonyId" (0x and 64 hex characters) and "network" (testnet or mainnet)`);
  }
  const title = typeof config.title === 'string' && config.title.trim() ? config.title.trim() : null;
  return { name, ceremonyId: config.ceremonyId.toLowerCase(), network: config.network, title };
}

// Find the ceremony folder with this ceremony object ID. Return null if no folder has it.
export function findCeremonyById(root, ceremonyId) {
  for (const name of listCeremonies(root)) {
    let config;
    try { config = readCeremonyConfig(root, name); } catch { continue; }
    if (config.ceremonyId === String(ceremonyId).toLowerCase()) return config;
  }
  return null;
}

export function resolveWorkdir(options, ceremonyId, root) {
  if (options.workdir) return options.workdir;
  if (!NETWORKS.includes(options.network)) throw new Error(`unknown network "${options.network}"`);
  const key = CEREMONY_ID.test(ceremonyId || '') ? ceremonyId.toLowerCase() : 'default';
  return path.join(root, 'ceremony-work', options.network, key);
}

export function startRunLog(workdir, privateValues = []) {
  const dir = path.join(workdir, 'logs');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  logFile = path.join(dir, 'contributor.log');
  fs.closeSync(fs.openSync(logFile, 'a', 0o600));
  secrets = [];
  for (const value of privateValues) redact(value);
  return logFile;
}

// Remove this value from all later log lines.
export function redact(value) {
  if (typeof value === 'string' && value.length > 0) secrets.push(value);
}

export function recordRunLog(message) {
  if (!logFile) return;
  let text = stripVTControlCharacters(String(message));
  for (const secret of secrets) text = text.split(secret).join('[redacted]');
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${text}\n`);
  } catch {
    console.error('Could not write the contribution log. Check available disk space.');
    logFile = undefined;
  }
}
