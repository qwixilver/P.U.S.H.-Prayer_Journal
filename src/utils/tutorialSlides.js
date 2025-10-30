// src/utils/tutorialSlides.js
// First-run tutorial content pack (v2) with optional secondary CTA on the last slide.

const slides = [
  {
    title: "Welcome to Closet Prayer",
    body:
      "This app helps you track prayer requests, updates, and answers—privately, on your device. No account, no cloud by default.",
    cta: "Get started"
  },
  {
    title: "Your main tabs",
    body:
      "Daily (lists requests, grouped), Single (one-at-a-time), Categories (organize people + requests), Security (private-only), Journal (personal notes), Settings (backup/restore & options).",
    cta: "Next"
  },
  {
    title: "Keeping things organized (start here)",
    body:
      "Create categories (e.g., Family, Church, Urgent). Add requestors inside categories. Requestors are those who requested you pray for something...",
    cta: "Next"
  },
  {
    title: "Add & browse requests",
    body:
      "Tap the + button to add a new prayer. This is where you record what your requestors have asked for, and your notes on how you are talking to God about it. It also serves as a list of things you will pray for daily.",
    cta: "Next"
  },
  {
    title: "Focus on one request",
    body:
      "A randomized list of individual prayer requests. If you know you need to pray for someone, but you aren't sure exactly who - start here. The 'Next' button at the bottom of each card will randomly select another prayer request.",
    cta: "Next"
  },
  {
    title: "Record how God moves",
    body:
      "Add Events to any request to build a chronological timeline of what happened and when.",
    cta: "Next"
  },
  {
    title: "Personal journaling",
    body:
      "Write free-form entries about your walk with God. Supports Markdown (e.g., bold, italic, lists). Search across your entries.",
    cta: "Next"
  },
  {
    title: "Private by default",
    body:
      "Data lives locally (IndexedDB). Use Settings → Backup/Restore to export/import. You can install this app to your Home Screen for offline use.",
    cta: "Finish",
    secondaryCta: "Open Settings" // link-style action
  }
];

export default slides;
