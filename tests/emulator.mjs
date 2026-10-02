// Runs a command inside the Firestore emulator, then makes sure the emulator has stopped.
// On Windows, `firebase emulators:exec` can leave the emulator's Java process running,
// which makes the next run fail with "port taken".
//   node tests/emulator.mjs "<command>"
import { spawnSync, execSync } from 'node:child_process';

const command = process.argv[2];
if (!command) {
  console.error('Usage: node tests/emulator.mjs "<command>"');
  process.exit(1);
}

const stopLeftoverEmulator = () => {
  if (process.platform !== 'win32') return;
  try {
    execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'java.exe\'\\" | ' +
        'Where-Object { $_.CommandLine -like \'*cloud-firestore-emulator*demo-crmapp*\' } | ' +
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
      { stdio: 'ignore' }
    );
  } catch {
    // Nothing to stop
  }
};

stopLeftoverEmulator();
const result = spawnSync(`npx firebase emulators:exec --only firestore --project demo-crmapp "${command}"`, {
  stdio: 'inherit',
  shell: true
});
if (result.error) console.error(result.error);
stopLeftoverEmulator();
process.exit(result.status ?? 1);
