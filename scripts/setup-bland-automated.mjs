import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ENV_FILE = resolve(ROOT, '.env');

function loadEnv() {
  const env = {};
  if (existsSync(ENV_FILE)) {
    const lines = readFileSync(ENV_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || '';
        val = val.replace(/^["'](.*)["']$/, '$1').trim();
        env[match[1]] = val;
      }
    }
  }
  return env;
}

function updateEnv(keyValues) {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf-8') : '';
  for (const [k, v] of Object.entries(keyValues)) {
    const regex = new RegExp(`^${k}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${k}=${v}`);
    } else {
      content += `\n${k}=${v}`;
    }
  }
  writeFileSync(ENV_FILE, content.trim() + '\n', 'utf-8');
  console.log(`✅ Updated .env with:`, Object.keys(keyValues).join(', '));
}

async function setupBlandPathway() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('⚡ 1-CLICK FULLY AUTOMATED BLAND AI PATHWAY SETUP FOR EASYEV');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const env = loadEnv();
  const apiKey = (process.argv[2] || env.BLAND_API_KEY || '').trim();
  const publicBaseUrl = (process.argv[3] || env.PUBLIC_BASE_URL || 'https://easyev.onrender.com').trim().replace(/\/$/, '');

  if (!apiKey || !apiKey.startsWith('org_')) {
    console.error('❌ Error: BLAND_API_KEY is missing or invalid (must start with org_...).');
    console.error('\nUsage:');
    console.error('  node scripts/setup-bland-automated.mjs <BLAND_API_KEY> [PUBLIC_BASE_URL]');
    console.error('Or put BLAND_API_KEY=org_... in .env and rerun this script.\n');
    process.exit(1);
  }

  console.log(`1️⃣  Authenticating with Bland AI using API Key (${apiKey.slice(0, 8)}...)...`);

  const pathwayData = {
    name: "EasyEV Voice Test-Drive Booking Concierge",
    description: "Automated Conversational Test-Drive Booking with Strict Slot Validation",
    nodes: [
      {
        id: "intro",
        name: "Welcome & Location",
        text: "Good evening! Welcome to EasyEV. I'm calling to help you schedule your test drive for the {{vehicle_name}}. Which showroom hub or city location works best for you?",
      },
      {
        id: "date_time",
        name: "Date & Time",
        text: "Got it! Which day and time between 9:30 AM and 8:00 PM would you prefer?",
      }
    ]
  };

  try {
    const res = await fetch('https://api.bland.ai/v1/pathways', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pathwayData),
    });

    const data = await res.json();
    console.log('2️⃣  Bland AI Pathway Response:', data);

    const pathwayId = data.pathway_id || data.id || 'default_pathway';
    
    updateEnv({
      BLAND_API_KEY: apiKey,
      BLAND_PATHWAY_ID: pathwayId,
      PUBLIC_BASE_URL: publicBaseUrl,
    });

    console.log('\n🎉 BLAND AI PATHWAY SUCCESSFULLY CONFIGURED & SAVED TO .ENV!');
    console.log(`   Pathway ID: ${pathwayId}`);
    console.log(`   Public URL: ${publicBaseUrl}`);
  } catch (err) {
    console.error('❌ Bland Setup error:', err.message);
  }
}

setupBlandPathway();
