import 'dotenv/config';
import { get } from 'node:https';

const KEY = process.env.RAILRADAR_API_KEY;
const BASE = 'https://api.railradar.in';

function fetch(path) {
  return new Promise((resolve, reject) => {
    const req = get(
      `${BASE}${path}`,
      {
        headers: {
          Authorization: `Bearer ${KEY}`,
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
  });
}

async function explore(label, path) {
  console.log('\n' + '═'.repeat(72));
  console.log(`ENDPOINT: ${path}  [${label}]`);
  console.log('═'.repeat(72));
  const { status, body } = await fetch(path);
  console.log(`HTTP ${status}`);
  console.log(JSON.stringify(body, null, 2).slice(0, 4000));
}

async function main() {
  if (!KEY) { console.error('No RAILRADAR_API_KEY'); process.exit(1); }

  // 1. Station live board — Nahur
  await explore('NHU live board', '/v1/stations/NHU/live');

  // 2. Trains between two confirmed stations
  await explore('Trains NHU → GC', '/v1/trains/between/NHU/GC');

  // 3. Get a train number from the between call, then fetch its live status
  const betweenRes = await fetch('/v1/trains/between/NHU/GC');
  const trains = betweenRes.body?.data?.trains ?? betweenRes.body?.trains ?? [];
  const first = Array.isArray(trains) ? trains[0] : null;
  const num = first?.train?.number ?? first?.number;
  if (num) {
    await explore(`Train ${num} live`, `/v1/trains/${num}/live`);
  } else {
    console.log('\n[!] Could not extract train number from between response');
    console.log('between raw:', JSON.stringify(betweenRes.body).slice(0, 500));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
