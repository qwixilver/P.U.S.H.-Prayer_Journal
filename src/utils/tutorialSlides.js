// src/utils/tutorialSlides.js
// First-run tutorial content with user-facing Focus terminology.

const slides = [
  {
    title: 'Welcome to Closet Prayer',
    body:
      'This app helps you track prayer requests, updates, and answers—privately, on your device. No account, no cloud by default.',
    cta: 'Get started',
  },
  {
    title: 'Your main tabs',
    body:
      'Daily (lists requests, grouped), Focus (one-at-a-time), Categories (organize people + requests), Security (private-only), Journal (personal notes), Settings (backup/restore & options).',
    cta: 'Next',
  },
  {
    title: 'The categories tab (start here)',
    body:
      'Create categories (e.g., Family, Church, Urgent). Add requestors inside categories. Requestors are those who requested you pray for something. Categories can also control which requests are eligible for Focus.',
    cta: 'Next',
  },
  {
    title: 'The Daily tab',
    body:
      'Tap the + button to add a new prayer. This is where you record what your requestors have asked for, and your notes on how you are talking to God about it. It also serves as a list of things you will pray for daily.',
    cta: 'Next',
  },
  {
    title: 'The Focus tab',
    body:
      "Focus shows one eligible prayer request at a time. Open an eligible request with its Focus button, or use the tab to begin with a random request. The 'Next' button randomly selects another eligible request.",
    cta: 'Next',
  },
  {
    title: 'Record how God moves — the events system',
    body:
      "Add Events to any request to build a chronological timeline of what happened and when. Select 'Add event' from Focus or expand a request with its Details button in Daily.",
    cta: 'Next',
  },
  {
    title: 'Personal journaling (Journal tab)',
    body:
      'Write free-form entries about your walk with God. Supports Markdown (e.g., bold, italic, lists). Search across your entries.',
    cta: 'Next',
  },
  {
    title: 'Securely share requests (Security tab)',
    body:
      'Security only shows entries marked for the Security view. This allows you to visually share specific requests with other people without sharing your entire journal.',
    cta: 'Next',
  },
  {
    title: 'Private by default',
    body:
      'Data lives locally (IndexedDB). Use Settings → Backup/Restore to export/import. You can install this app to your Home Screen for offline use.',
    cta: 'Finish',
    secondaryCta: 'Open Settings',
  },
];

export default slides;
