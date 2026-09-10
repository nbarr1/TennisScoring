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
  let fileFailed = false;

  if (!contents.includes("rules_version = '2';")) {
    console.error(`❌ ${file}: missing rules_version = '2';`);
    failed = true;
    fileFailed = true;
  }

  for (const pattern of blockedPatterns) {
    if (pattern.test(contents)) {
      console.error(`❌ ${file}: contains insecure open rule matching ${pattern}`);
      failed = true;
      fileFailed = true;
    }
  }

  if (!fileFailed) {
    console.log(`✅ ${file}: passed baseline rules guard checks`);
  }
}

const firestoreRules = readFileSync('firebase/firestore.rules', 'utf8');
const requiredFirestoreGuards = [
  {
    description: 'new user documents restrict their writable field set',
    pattern: /allow create: if isUser\(userId\) &&\s*request\.resource\.data\.keys\(\)\.hasOnly\(initialUserFields\(\)\)/,
  },
  {
    description: 'guest linking pins the replacement roster to two players',
    pattern: /incoming\.playerIds == \[existing\.player1Id, incoming\.player2Id\]/,
  },
  {
    description: 'guest linking verifies the replacement opponent belongs to the division',
    pattern: /getUserDataById\(incoming\.player2Id\)\.divisionId == existing\.divisionId/,
  },
];

for (const guard of requiredFirestoreGuards) {
  if (!guard.pattern.test(firestoreRules)) {
    console.error(`❌ firebase/firestore.rules: missing guard: ${guard.description}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
