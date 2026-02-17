'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// temp folder auto create
if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pair code route
app.use('/code', require('./pair'));

// Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('\n  🤖 IMRAN-MD — Session Linker');
  console.log(`  ✅ http://localhost:${PORT}\n`);
});
