const express = require('express');
const app = express();
app.post('/api/crash', (req, res) => {
  console.log('Crashing...');
  process.exit(1);
});
app.listen(3001, () => console.log('Listening on 3001'));
