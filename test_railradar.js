require('dotenv').config();
const https = require('https');
const { execSync } = require('child_process');

const RAILRADAR_KEY = process.env.RAILRADAR_API_KEY;

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Authorization': `Bearer ${RAILRADAR_KEY}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        };
        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch(e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', e => reject(e));
        req.end();
    });
}

function runCurl(url) {
    console.log(`\n--- Running curl.exe test ---`);
    console.log(`Endpoint: ${url}`);
    try {
        const out = execSync(`curl.exe -v -s -H "Authorization: Bearer ${RAILRADAR_KEY}" -H "User-Agent: Mozilla/5.0" "${url}"`, { stdio: 'pipe' });
        console.log("curl.exe STDOUT:", out.toString().substring(0, 500));
        return true;
    } catch(e) {
        console.log("curl.exe ERROR:", e.message);
        if (e.stderr) {
            console.log("curl.exe STDERR:", e.stderr.toString());
        }
        return false;
    }
}

async function testEndpoint(name, url) {
    console.log(`\n=== Testing ${name} ===`);
    console.log(`Endpoint: ${url}`);
    try {
        const res = await fetchUrl(url);
        console.log(`HTTP Status: ${res.status}`);
        if (res.status >= 200 && res.status < 300) {
            console.log("Success: true");
            if (res.data && typeof res.data === 'object') {
                console.log(`Data snippet: ${JSON.stringify(res.data).substring(0, 500)}`);
                return res;
            }
            return res;
        } else {
            console.log("Success: false");
            const dataStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            console.log(`Response Data: ${dataStr.substring(0, 200).replace(/\n/g, ' ')}`);
            return res;
        }
    } catch (e) {
        console.log("Success: false");
        console.log(`Exact error/message: ${e.message}`);
        if (e.code) console.log(`Error Code: ${e.code}`);
        return { error: e };
    }
}

async function main() {
    if (!RAILRADAR_KEY) {
        console.log("No RAILRADAR_KEY found in .env");
        return;
    }
    
    console.log("Starting RailRadar API validation...\n");

    const liveBoardUrl = 'https://api.railradar.in/v1/stations/NHU/live';
    let res = await testEndpoint('Nahur Live Board', liveBoardUrl);
    
    // If TLS error occurs, test with curl.exe
    if (res && res.error && (res.error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || res.error.code === 'CERT_HAS_EXPIRED')) {
        console.log("\n[!] Node.js TLS Error encountered. Testing with curl.exe to check server certificate...");
        runCurl(liveBoardUrl);
        return; // Abort further tests since Node.js can't connect securely
    }

    // If we hit a 403, try curl to see if Node is blocked by WAF
    if (res && res.status === 403) {
        console.log("\n[!] 403 Forbidden encountered. Testing with curl.exe to check if Node.js is blocked...");
        runCurl(liveBoardUrl);
    }

    const betweenUrl = 'https://api.railradar.in/v1/trains/between/NHU/GC';
    const betweenRes = await testEndpoint('Trains between NHU and GC', betweenUrl);
    
    let trainNumber = null;
    
    // Try to extract a train number from whatever data we got
    if (betweenRes && betweenRes.data && betweenRes.data.data && betweenRes.data.data.trains && betweenRes.data.data.trains.length > 0) {
        trainNumber = betweenRes.data.data.trains[0].train.number;
    } else if (res && res.data && res.data.data && res.data.data.trains && res.data.data.trains.length > 0) {
        trainNumber = res.data.data.trains[0].train.number;
    }
    
    if (trainNumber) {
        const liveStatusUrl = `https://api.railradar.in/v1/trains/${trainNumber}/live`;
        await testEndpoint(`Train Live Status (${trainNumber})`, liveStatusUrl);
    } else {
        console.log("\nNo train number found in responses to test live status.");
    }
}

main().catch(console.error);
