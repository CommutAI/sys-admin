#!/usr/bin/env python3
"""
Raspberry Pi IP Registration Script
Run this on your Pi to automatically register its IP in the database.

Usage:
    python3 pi-register-ip.py

Or run it continuously:
    python3 pi-register-ip.py --continuous
"""

import requests
import time
import sys
import argparse
import socket

# Configuration
SUPABASE_URL = "https://iyacktzzktwrpeibcena.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0"
BUS_NUMBER = 1
PI_PORT = 5000

def get_current_ip():
    """Get the Pi's current local IP address"""
    try:
        # Connect to a public DNS server to get local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        print(f"Error getting IP: {e}")
        return None

def register_pi_ip():
    """Register Pi's current IP in Supabase"""
    try:
        current_ip = get_current_ip()
        if not current_ip:
            return False

        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json'
        }

        # Check if Pi already exists
        check_response = requests.get(
            f"{SUPABASE_URL}/rest/v1/pi_devices?bus_number=eq.{BUS_NUMBER}",
            headers=headers
        )

        data = {
            'bus_number': BUS_NUMBER,
            'ip_address': current_ip,
            'port': PI_PORT,
            'last_seen': time.strftime('%Y-%m-%d %H:%M:%S')
        }

        if check_response.json():
            # Update existing record
            response = requests.patch(
                f"{SUPABASE_URL}/rest/v1/pi_devices?bus_number=eq.{BUS_NUMBER}",
                headers=headers,
                json=data
            )
        else:
            # Insert new record
            response = requests.post(
                f"{SUPABASE_URL}/rest/v1/pi_devices",
                headers=headers,
                json=data
            )

        if response.status_code in [200, 201, 204]:
            print(f"✅ Registered IP: {current_ip}")
            return True
        else:
            print(f"❌ Registration failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Error registering IP: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Register Raspberry Pi IP in database')
    parser.add_argument('--continuous', action='store_true', help='Run continuously, updating every 30 seconds')
    args = parser.parse_args()

    print("🚀 Raspberry Pi IP Registration\n")

    if args.continuous:
        print("Running in continuous mode (updates every 30 seconds)...")
        print("Press Ctrl+C to stop\n")
        try:
            while True:
                register_pi_ip()
                time.sleep(30)
        except KeyboardInterrupt:
            print("\n\n👋 Stopped IP registration")
    else:
        register_pi_ip()

if __name__ == '__main__':
    main()
