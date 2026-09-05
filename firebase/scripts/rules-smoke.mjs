const base = 'http://127.0.0.1:8080/v1/projects/tennis-scoring-rules-smoke/databases/(default)/documents';
const storageBase = 'http://127.0.0.1:9199/v0/b/tennis-scoring-rules-smoke.appspot.com/o';

async function expectDenied(name, responsePromise) {
  const res = await responsePromise;
  const body = await res.text();
  if (res.ok || !body.toLowerCase().includes('permission')) {
    throw new Error(`Expected permission denial for ${name}; got status ${res.status} body: ${body}`);
  }
  console.log(`✅ ${name} denied as expected (${res.status})`);
}

await expectDenied(
  'firestore unauthenticated users read',
  fetch(`${base}/users/u1`)
);

await expectDenied(
  'firestore unauthenticated divisions read',
  fetch(`${base}/divisions/divA`)
);

await expectDenied(
  'firestore unauthenticated doubles rankings read',
  fetch(`${base}/divisions/divA/doublesRankings/uidA_uidB`)
);

await expectDenied(
  'firestore unauthenticated match read',
  fetch(`${base}/matches/match1`)
);

await expectDenied(
  'storage unauthenticated avatar read',
  fetch(`${storageBase}/avatars%2Fu1%2Fprofile.png?alt=media`)
);

await expectDenied(
  'storage unauthenticated report read',
  fetch(`${storageBase}/reports%2Fmatch1.pdf?alt=media`)
);

console.log('✅ Firebase emulator rules smoke tests passed.');
