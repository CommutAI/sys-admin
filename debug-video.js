/**
 * Debug script to test Raspberry Pi video connection
 * Run with: node debug-video.js
 */

import https from 'https';
import http from 'http';
import WebSocket from 'ws';

// Configuration
const PI_URL = 'http://192.168.1.45:5000'; // Your Pi URL from .env
const SUPABASE_URL = 'https://iyacktzzktwrpeibcena.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0';

console.log('🔍 Debugging Raspberry Pi Video Connection\n');

// 1. Check if Pi is registered in database
console.log('1. Checking if Pi is registered in database...');
const dbOptions = {
  hostname: 'iyacktzzktwrpeibcena.supabase.co',
  path: '/rest/v1/pi_devices?bus_number=eq.1',
  method: 'GET',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  }
};

const dbReq = https.request(dbOptions, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (result.length > 0) {
        console.log('✅ Pi found in database:');
        console.log('   Bus Number:', result[0].bus_number);
        console.log('   IP Address:', result[0].ip_address);
        console.log('   Port:', result[0].port);
        console.log('   Last Seen:', result[0].last_seen);

        // Test connection to registered IP
        const registeredUrl = `http://${result[0].ip_address}:${result[0].port}`;
        console.log(`\n2. Testing connection to registered IP: ${registeredUrl}`);
        testPiConnection(registeredUrl);
      } else {
        console.log('❌ Pi not found in database - Pi needs to register its IP');
        console.log('\n💡 Add IP registration code to your Pi (see AUTO_IP_DETECTION_SUMMARY.md)');
      }
    } catch (e) {
      console.log('❌ Error parsing database response:', e.message);
    }
  });
});

dbReq.on('error', (err) => {
  console.log('❌ Database connection error:', err.message);
});

dbReq.end();

function testPiConnection(url) {
  const urlObj = new URL(url);

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || 5000,
    path: '/health',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const health = JSON.parse(data);
        console.log('✅ Pi is reachable!');
        console.log('   Camera Active:', health.camera_active);
        console.log('   Passenger Count:', health.passenger_count);
        console.log('   Connected Clients:', health.connected_clients);
        console.log('   Current Trip ID:', health.current_trip_id);

        if (health.camera_active) {
          console.log('\n3. Testing video feed...');
          testVideoFeed(url);
        } else {
          console.log('\n❌ Camera is not active on the Pi');
          console.log('💡 Check that the camera is properly connected to the Pi');
        }
      } catch (e) {
        console.log('❌ Error parsing health response:', e.message);
        console.log('   Raw response:', data);
      }
    });
  });

  req.on('error', (err) => {
    console.log('❌ Pi connection failed:', err.message);
    console.log('💡 Check that:');
    console.log('   - Pi is powered on');
    console.log('   - Pi is connected to the network');
    console.log('   - Pi server is running on port 5000');
    console.log('   - Firewall is not blocking port 5000');
  });

  req.setTimeout(5000, () => {
    req.destroy();
    console.log('❌ Connection timeout - Pi is not responding');
  });

  req.end();
}

function testVideoFeed(url) {
  const wsUrl = url.replace(/^http/, 'ws').replace(/\/?$/, '/ws');
  console.log(`   Connecting to WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    console.log('   Sending start_stream command...');
    ws.send(JSON.stringify({ action: 'start_stream' }));

    // Wait for video frames
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('❌ No video frames received in 5 seconds');
        console.log('💡 Check that the Pi is sending video frames');
        ws.close();
      }
    }, 5000);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.video_frame) {
        console.log('✅ Video frame received!');
        console.log('   Frame size:', message.video_frame.length, 'bytes');
        ws.close();
      } else if (message.count !== undefined) {
        console.log('✅ Passenger count update:', message.count);
      } else {
        console.log('ℹ️  Other message:', Object.keys(message));
      }
    } catch (e) {
      console.log('❌ Error parsing WebSocket message:', e.message);
    }
  });

  ws.on('error', (err) => {
    console.log('❌ WebSocket error:', err.message);
  });

  ws.on('close', () => {
    console.log('ℹ️  WebSocket closed');
  });
}
