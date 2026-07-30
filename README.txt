P.U.S.H. Prayer Journal explicit-controls update

Replace these files with the matching files in this package:
- src/components/CategoryList.jsx
- src/components/PrayerList.jsx
- src/components/JournalList.jsx
- src/components/Settings.jsx
- src/utils/backup.js

Legacy CSV import cleanup:
Run the following once from the repository root so package.json and package-lock.json are updated together:

npm uninstall papaparse

Then verify:

npm run build

Commit message:
feat(ui): replace hidden card-title actions with explicit controls and remove legacy CSV import
