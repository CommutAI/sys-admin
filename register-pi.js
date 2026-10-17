/**
 * Register Raspberry Pi in database (manual registration)
 * Run with: node register-pi.js
 */

import https from 'https';

const SUPABASE_URL = 'https://iyacktzzktwrpeibcena.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0';

// Configuration - CHANGE THIS to your Pi's actual IP
const PI_IP = '192.168.1.63'; // Current Pi IP
const PI_PORT = 5000;
const BUS_NUMBER = 1;

console.log('📝 Registering Raspberry Pi in database...\n');

const data = JSON.stringify({
  ip_address: PI_IP,
  port: PI_PORT,
  last_seen: new Date().toISOString()
});

const options = {
  hostname: 'iyacktzzktwrpeibcena.supabase.co',
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
