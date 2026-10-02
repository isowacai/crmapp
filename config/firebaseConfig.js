// Loads the Firebase config from dev.properties at the project root.
// Node-only: used by vite.config.ts (to inject into the app) and by the admin scripts.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROPERTIES_PATH = fileURLToPath(new URL('../dev.properties', import.meta.url));

const REQUIRED_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId'
];

// Parses a Java-style .properties file: `key=value` or `key: value`, `#`/`!` comments
function parseProperties(text) {
  const props = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;

    const sep = line.search(/[=:]/);
    if (sep === -1) continue;

    props[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return props;
}

function loadFirebaseConfig() {
  if (!existsSync(PROPERTIES_PATH)) {
    throw new Error(
      `Missing ${PROPERTIES_PATH}. It should define firebase.apiKey, firebase.projectId, etc.`
    );
  }

  const props = parseProperties(readFileSync(PROPERTIES_PATH, 'utf8'));
  const config = {};
  const missing = [];

  for (const key of REQUIRED_KEYS) {
    const value = props[`firebase.${key}`];
    if (value) {
      config[key] = value;
    } else {
      missing.push(`firebase.${key}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`dev.properties is missing values for: ${missing.join(', ')}`);
  }

  return config;
}

export const firebaseConfig = loadFirebaseConfig();

// Any other value from dev.properties (e.g. firebase.serviceAccountPath), or undefined
export const readProperty = key => parseProperties(readFileSync(PROPERTIES_PATH, 'utf8'))[key];
