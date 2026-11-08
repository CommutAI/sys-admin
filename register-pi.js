/**
 * Register Raspberry Pi in database (manual registration)
 * Run with: node register-pi.js
 */

import https from 'https';

const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-project-url';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-anon-key';

// Configuration - CHANGE THIS to your Pi's actual IP
const PI_IP = process.env.PI_IP || '192.168.1.63'; // Current Pi IP
const PI_PORT = process.env.PI_PORT || '5000';
const BUS_NUMBER = process.env.BUS_NUMBER || '1';

console.log('📝 Registering Raspberry Pi in database...\n');

const data = JSON.stringify({
  ip_address: PI_IP,
  port: PI_PORT,
  last_seen: new Date().toISOString()
});

const url = new URL(SUPABASE_URL);
const options = {
  hostname: url.hostname,
  path: `/rest/v1/pi_devices?bus_number=eq.${BUS_NUMBER}`,
  method: 'PATCH',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  res.on('data', chunk => responseData += chunk);
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 204) {
      console.log('✅ Pi IP updated successfully!');
      console.log('   Bus Number:', BUS_NUMBER);
      console.log('   New IP Address:', PI_IP);
      console.log('   Port:', PI_PORT);
      console.log('\n💡 Refresh your dashboard to see the video feed');
    } else {
      console.log('❌ Update failed with status:', res.statusCode);
      console.log('   Response:', responseData);
    }
  });
});

req.on('error', (err) => {
  console.log('❌ Error:', err.message);
});

req.write(data);
req.end();
