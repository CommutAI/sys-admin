"""
Test script to verify GPS insert works with current Supabase credentials
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", ""))

print(f"Supabase URL: {SUPABASE_URL}")
print(f"Supabase Key present: {bool(SUPABASE_KEY)}")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials")
    exit(1)

try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✓ Supabase client initialized")

    # Test insert to gps_locations
    test_data = {
        'latitude': 8.412524,
        'longitude': 124.816317,
        'altitude': 450.0,
        'speed': 0.0,
        'source': 'test'
    }

    print(f"Inserting test GPS data: {test_data}")
    result = supabase.table('gps_locations').insert(test_data).execute()

    if result.data:
        print(f"✓ Successfully inserted test GPS data")
        print(f"  ID: {result.data[0]['id']}")
    else:
        print("✗ Insert returned no data")

except Exception as e:
    print(f"✗ Error: {e}")
    print(f"  Type: {type(e).__name__}")
