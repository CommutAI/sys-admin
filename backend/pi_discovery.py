"""
Raspberry Pi Auto-Discovery for Backend
Automatically discovers Raspberry Pi IP on local network
"""

import asyncio
import httpx
from typing import Optional
import os

# Network ranges to scan
NETWORK_RANGES = [
    '192.168.1.', '192.168.0.', '192.168.100.', '192.168.50.',
    '10.0.0.', '10.0.1.', '172.16.0.', '192.168.88.',
    '192.168.2.', '192.168.10.'
]

# Scan range per network (1-254 for full scan, 1-50 for faster scan)
SCAN_START = 1
SCAN_END = 50

# Localhost addresses to try first
LOCALHOST_ADDRESSES = ['localhost', '127.0.0.1', 'commutai.local']

# Storage for discovered IPs
SMS_API_IP_KEY = 'sms_api_ip'
VIDEO_SERVER_IP_KEY = 'video_server_ip'


async def check_sms_api(ip: str, timeout: float = 2.0) -> bool:
    """Check if SMS API is running on a specific IP"""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"http://{ip}:8001/health")
            if response.status_code == 200:
                data = response.json()
                return data.get('service') == 'SMS API Server'
    except:
        return False


async def check_video_server(ip: str, timeout: float = 2.0) -> bool:
    """Check if video server is running on a specific IP"""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"http://{ip}:5000/")
            if response.status_code == 200:
                data = response.json()
                return data.get('message') == 'Bus Monitoring Video Server Running (FastAPI)'
    except:
        return False


async def discover_sms_api() -> Optional[str]:
    """
    Discover SMS API on local network
    Returns the IP address of the SMS API server
    """
    # Try localhost first
    for local_addr in LOCALHOST_ADDRESSES:
        if await check_sms_api(local_addr):
            return local_addr

    # Scan network ranges
    tasks = []
    ip_list = []
    for network_prefix in NETWORK_RANGES:
        for i in range(SCAN_START, SCAN_END + 1):
            ip = network_prefix + str(i)
            ip_list.append(ip)
            tasks.append(check_sms_api(ip))

    # Run checks in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Find first successful result
    for i, result in enumerate(results):
        if isinstance(result, bool) and result:
            return ip_list[i]

    return None


async def discover_video_server() -> Optional[str]:
    """
    Discover video server on local network
    Returns the IP address of the video server
    """
    # Try localhost first
    for local_addr in LOCALHOST_ADDRESSES:
        if await check_video_server(local_addr):
            return local_addr

    # Scan network ranges
    tasks = []
    ip_list = []
    for network_prefix in NETWORK_RANGES:
        for i in range(SCAN_START, SCAN_END + 1):
            ip = network_prefix + str(i)
            ip_list.append(ip)
            tasks.append(check_video_server(ip))

    # Run checks in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Find first successful result
    for i, result in enumerate(results):
        if isinstance(result, bool) and result:
            return ip_list[i]

    return None

    # Run checks in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Find first successful result
    for result in results:
        if isinstance(result, bool) and result:
            # Would need to map back to IP - simplified for now
            pass

    return None


async def get_sms_api_url() -> str:
    """
    Get SMS API URL with auto-discovery
    Returns the URL to use for SMS API calls
    """
    # Check environment variable first
    env_url = os.getenv('SMS_API_URL')
    if env_url:
        # Verify it's reachable
        ip = env_url.replace('http://', '').split(':')[0]
        if await check_sms_api(ip):
            return env_url

    # Perform auto-discovery
    discovered_ip = await discover_sms_api()
    if discovered_ip:
        return f"http://{discovered_ip}:8001"

    # Fallback to localhost
    return "http://localhost:8001"


# For synchronous use
def get_sms_api_url_sync() -> str:
    """
    Synchronous wrapper for get_sms_api_url
    """
    return asyncio.run(get_sms_api_url())
