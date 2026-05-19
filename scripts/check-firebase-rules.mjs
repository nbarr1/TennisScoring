import { readFileSync } from 'node:fs';

const files = ['firebase/firestore.rules', 'firebase/storage.rules'];
const blockedPatterns = [
  /allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/i,
  /allow\s+write\s*:\s*if\s+true\s*;/i,
  /allow\s+read\s*:\s*if\s+true\s*;/i,
];

let failed = false;

for (const file of files) {
  const contents = readFileSync(file, 'utf8');

  if (!contents.includes("rules_version = '2';")) {
    console.error(`❌ ${file}: missing rules_version = '2';`);
    failed = true;
  }

  for (const pattern of blockedPatterns) {
    if (pattern.test(contents)) {
      console.error(`❌ ${file}: contains insecure open rule matching ${pattern}`);
      failed = true;
    }
  }

  if (!failed) {
    console.log(`✅ ${file}: passed baseline rules guard checks`);
  }
}

if (failed) {
  process.exit(1);
}
