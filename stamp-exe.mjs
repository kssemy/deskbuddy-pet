import { rcedit } from 'rcedit';

const exe = process.argv[2];
if (!exe) throw new Error('사용법: npm run stamp-exe -- <DeskBuddy.exe 경로>');

await rcedit(exe, {
  'version-string': {
    ProductName: 'DeskBuddy',
    FileDescription: 'DeskBuddy',
    OriginalFilename: 'DeskBuddy.exe'
  }
});
