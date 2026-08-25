// Runs React Native's codegen schema parser over every autolinked native module,
// which is what the Android Gradle task `generateCodegenSchemaFromJavaScript`
// does for each library during an EAS build.
//
// This exists because bundling the app does not exercise codegen at all. Metro
// only reads JavaScript; codegen parses each library's TypeScript spec files to
// generate native C++/Java, and it enforces rules Metro never sees. A library
// whose specs use a type the pinned React Native's parser rejects bundles
// perfectly and then fails the native build — which is how
// react-native-screens 4.27.0 reached the default branch: its command spec uses
// `React.ComponentRef<>` (the React 19 rename), while react-native 0.83.1's
// parser hard-requires `React.ElementRef<>` and throws otherwise.

import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI_CANDIDATES = [
  'node_modules/react-native/node_modules/@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js',
  'node_modules/@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js',
];

const cli = CLI_CANDIDATES.find((candidate) => {
  try {
    readFileSync(candidate);
    return true;
  } catch {
    return false;
  }
});

if (!cli) {
  console.error('❌ Unable to locate the React Native codegen CLI. Checked:');
  for (const candidate of CLI_CANDIDATES) console.error(`   ${candidate}`);
  process.exit(1);
}

// Autolinking discovers native modules by their `codegenConfig` field, so the
// same field is what decides which libraries Gradle runs codegen for.
const libraries = [];

function scan(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.name.startsWith('@')) {
      scan(path);
      continue;
    }
    try {
      const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
      if (pkg.codegenConfig?.jsSrcsDir) {
        libraries.push({
          name: pkg.name,
          version: pkg.version,
          srcs: join(path, pkg.codegenConfig.jsSrcsDir),
          libraryName: pkg.codegenConfig.name ?? pkg.name,
        });
      }
    } catch {
      // Not a package directory, or no readable manifest.
    }
  }
}

scan('node_modules');

if (libraries.length === 0) {
  console.error('❌ Found no packages declaring codegenConfig. Are dependencies installed?');
  process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), 'rn-codegen-'));
let failed = false;

for (const library of libraries.sort((a, b) => a.name.localeCompare(b.name))) {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      '--platform',
      'android',
      '-l',
      library.libraryName,
      join(outDir, `${library.libraryName}-schema.json`),
      library.srcs,
    ],
    { encoding: 'utf8' },
  );

  if (result.status === 0) {
    console.log(`✅ ${library.name}@${library.version}: codegen schema generated`);
    continue;
  }

  failed = true;
  console.error(`❌ ${library.name}@${library.version}: codegen failed`);
  const output = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
  const reason = output.split('\n').find((line) => line.startsWith('Error:'));
  console.error(`   ${reason ?? output.split('\n')[0] ?? 'no output'}`);
}

if (failed) {
  console.error('');
  console.error('Codegen must succeed for every autolinked module or the Android build fails at');
  console.error("Gradle's generateCodegenSchemaFromJavaScript task, long before the JS bundle runs.");
  process.exit(1);
}
