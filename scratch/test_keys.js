const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
  console.log('.env.local не найден');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    env[key] = val;
  }
});

const key1 = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const key2 = env.GEMINI_API_KEY;

console.log('KEY 1 (Firebase):', key1 ? key1.substring(0, 10) + '...' : 'not set');
console.log('KEY 2 (Gemini):', key2 ? key2.substring(0, 10) + '...' : 'not set');

async function testKey(name, key) {
  if (!key) {
    console.log(`[${name}] Ключ не задан`);
    return;
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Привет' }] }]
      })
    });
    
    const status = response.status;
    const text = await response.text();
    console.log(`[${name}] Статус: ${status}`);
    if (status !== 200) {
      console.log(`[${name}] Ошибка:`, text.substring(0, 300));
    } else {
      console.log(`[${name}] Успех!`);
    }
  } catch (err) {
    console.log(`[${name}] Исключение:`, err.message);
  }
}

async function run() {
  await testKey('NEXT_PUBLIC_FIREBASE_API_KEY', key1);
  await testKey('GEMINI_API_KEY', key2);
}

run();
