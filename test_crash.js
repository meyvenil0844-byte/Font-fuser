const fs = require('fs');

async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/fuse-by-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseFontId: "some-id",
        serverFontIds: { "some-id": "non-existent" },
        mappedCodepoints: []
      })
    });
    console.log(await res.text());
  } catch (e) {
    console.log(e);
  }
}
run();
