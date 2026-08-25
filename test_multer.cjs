const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

async function run() {
  const form = new FormData();
  // Create a 105MB buffer
  const buf = Buffer.alloc(105 * 1024 * 1024, 'a');
  form.append('image', buf, { filename: 'large.png' });
  
  const res = await fetch('http://localhost:3000/api/trace', {
    method: 'POST',
    body: form
  });
  
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text.substring(0, 100));
}
run().catch(console.error);
