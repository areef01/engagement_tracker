// Engagement checklist, based on a Threads post: majlis tunang bawah RM1k (total habis RM681.04).
// This is the STARTING list. Once a Google Sheet is connected, the Sheet holds the live data.
// ref = what the original poster paid, shown as a guide. Items without ref are tasks only (no cost).
window.CHECKLIST = {
  id: 'tunang',
  title: 'Majlis Tunang',
  couple: ['Areef', 'Amyra'],
  // The majlis date & theme are private: they live in the Google Sheet (Settings tab) and only show after unlocking.
  tagline: 'Dua hati, satu janji, dengan restu & doa.',
  budget: 1000,
  // Google Sheet link (the Apps Script "Web app" URL ending in /exec). Leave '' to keep data in this browser only.
  // Setup: see GOOGLE_SHEET_SETUP.md
  sheetUrl: 'https://script.google.com/macros/s/AKfycbxRnTvjPZV2Q92p2rVgaWvartuhZCIA05wczDL57n0EPNVPWe3UM1cuN8sAJx59QH5VTQ/exec',
  source: 'Inspired by a Threads post: guna duit sendiri, total habis RM680.',
  pax: { guests: 30, perHead: 9 },
  categories: [
    {
      id: 'hantaran', emoji: '🎁', name: 'Hadiah (no hantaran)',
      tip: 'Tak ada hantaran, just hadiah. Buat manis-manis gitu.',
      items: [
        { id: 'h-buah', name: 'Buah-buahan', ref: 40 },
        { id: 'h-coklat', name: 'Coklat Ferrero Rocher', ref: 50 }
      ]
    },
    {
      id: 'makanan', emoji: '🍛', name: 'Makanan',
      tip: 'Close family je: lebih kurang 15 pihak dia + 15 pihak kita.',
      items: [
        { id: 'm-tempah', name: 'Tempah katering', pax: true },
        { id: 'm-nasi', name: 'Nasi tomato' },
        { id: 'm-ayam', name: 'Ayam masak merah' },
        { id: 'm-acar', name: 'Acar sayur' },
        { id: 'm-papadom', name: 'Papadom' },
        { id: 'm-air', name: 'Air Sunquick', note: 'Bancuh sendiri', ref: 0 },
        { id: 'm-guest-dia', name: 'Confirm guest list pihak dia (~15)' },
        { id: 'm-guest-kita', name: 'Confirm guest list pihak kita (~15)' }
      ]
    },
    {
      id: 'inai', emoji: '💐', name: 'Inai & Bunga Tangan',
      tip: 'Shopee je.',
      items: [
        { id: 'i-inai', name: 'Inai', ref: 7.5 },
        { id: 'i-bunga', name: 'Bunga tangan', ref: 33.9 }
      ]
    },
    {
      id: 'outfit', emoji: '👗', name: 'Outfit',
      tip: 'TikTok Shop. Kasut? Pakai kasut raya hari tu.',
      items: [
        { id: 'o-baju', name: 'Baju', ref: 96.39 },
        { id: 'o-shawl', name: 'Shawl', ref: 14.6 },
        { id: 'o-selendang', name: 'Selendang', ref: 18.65 },
        { id: 'o-kasut', name: 'Kasut', note: 'Pakai kasut raya', ref: 0 }
      ]
    }
  ]
};
