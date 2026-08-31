const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

// Create a dummy font file
fs.writeFileSync('dummy_font.ttf', Buffer.alloc(1024));

async function run() {
  let successCount = 0;
  for (let i = 0; i < 150; i++) {
    const form = new FormData();
    form.append('font', fs.createReadStream('dummy_font.ttf'));
    
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
      successCount++;
    } catch (err) {
      console.log(`Exception at index ${i}:`, err.message);
      break;
    }
  }
  console.log(`Successfully uploaded ${successCount} fonts.`);
}
run().catch(console.error);
