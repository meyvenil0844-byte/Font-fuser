import fs from 'fs';

fs.writeFileSync('dummy_font.ttf', Buffer.alloc(1024));
const buffer = fs.readFileSync('dummy_font.ttf');

async function run() {
  let successCount = 0;
  for (let i = 0; i < 200; i++) {
    const form = new FormData();
    form.append('font', new Blob([buffer]), 'dummy_font.ttf');
    
    try {
      const res = await fetch('http://localhost:3000/api/upload-font', {
        method: 'POST',
        body: form
      });
      if (!res.ok) {
        console.log(`Failed at index ${i}: ${res.status}`);
        const text = await res.text();
        console.log('Error body:', text);
        break;
      }
      const data = await res.json();
      successCount++;
    } catch (err) {
      console.log(`Exception at index ${i}:`, err.message);
      break;
    }
  }
  console.log(`Successfully uploaded ${successCount} fonts.`);
}
run().catch(console.error);
