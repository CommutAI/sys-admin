/**
 * Raspberry Pi Auto-Discovery Service
 * Automatically discovers and connects to Raspberry Pi on local network
 * Persists discovered IP in localStorage for seamless reconnection
 */

const STORAGE_KEY = 'raspberry_pi_discovered_ip';
const DISCOVERY_TIMEOUT = 2000; // Increased to 2 seconds for more reliable connection
const NETWORK_RANGES = [
  '192.168.1.', '192.168.0.', '192.168.100.', '192.168.50.',
  '10.0.0.', '10.0.1.', '172.16.0.', '192.168.88.',
  '192.168.2.', '192.168.10.' // Additional common ranges
];
const LOCALHOST_ADDRESSES = ['commutai.local', 'localhost', '127.0.0.1']; // Try Raspberry Pi hostname first

/**
 * Get persisted IP from localStorage
 */
export function getPersistedIp() {
  try {
    const ip = localStorage.getItem(STORAGE_KEY);
    return ip || null;
  } catch (error) {
    console.warn('Failed to read persisted IP:', error);
    return null;
  }
}

/**
 * Save discovered IP to localStorage
 */
export function persistIp(ip) {
  try {
    localStorage.setItem(STORAGE_KEY, ip);
    console.log(`Persisted Raspberry Pi IP: ${ip}`);
  } catch (error) {
    console.warn('Failed to persist IP:', error);
  }
}

/**
 * Clear persisted IP from localStorage
 */
export function clearPersistedIp() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('Cleared persisted Raspberry Pi IP');
  } catch (error) {
    console.warn('Failed to clear persisted IP:', error);
  }
}

/**
 * Force clear localhost from cache if it was incorrectly cached
 */
export function clearLocalhostCache() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && (cached === 'localhost' || cached === '127.0.0.1')) {
      localStorage.removeItem(STORAGE_KEY);
      console.log('Cleared incorrectly cached localhost IP');
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Failed to clear localhost cache:', error);
    return false;
  }
}

/**
 * Check if a specific IP is running the Raspberry Pi server
 */
async function checkRaspberryPi(ip) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);

    const response = await fetch(`http://${ip}:5000/`, {
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Verify it's our GPS/video server by checking the message
      if (data.message === 'Bus Monitoring Video Server Running (FastAPI)') {
        return ip;
      }
    }
    return null;
  } catch (error) {
    return null; // Expected for most IPs that aren't our Pi
  }
}

/**
 * Discover Raspberry Pi on local network
 * Scans common network ranges to find the Raspberry Pi server
 */
export async function discoverRaspberryPi(onProgress = null) {
  if (onProgress) {
    onProgress({ type: 'info', message: 'Starting network scan...' });
  }

  try {
    // First, try the persisted IP if available
    const persistedIp = getPersistedIp();
    if (persistedIp) {
      if (onProgress) {
        onProgress({ type: 'info', message: `Trying persisted IP: ${persistedIp}...` });
      }
      
      const result = await checkRaspberryPi(persistedIp);
      if (result) {
        if (onProgress) {
          onProgress({ type: 'success', message: `✓ Connected to ${persistedIp} (cached)` });
        }
        return result;
      } else {
        if (onProgress) {
          onProgress({ type: 'warning', message: `Persisted IP ${persistedIp} not responding, scanning network...` });
        }
        clearPersistedIp(); // Clear invalid cached IP
      }
    }

    // Try localhost addresses first (for local development/testing)
    if (onProgress) {
      onProgress({ type: 'info', message: 'Checking localhost addresses...' });
    }
    
    for (const localAddr of LOCALHOST_ADDRESSES) {
      const result = await checkRaspberryPi(localAddr);
      if (result) {
        persistIp(result);
        if (onProgress) {
          onProgress({ type: 'success', message: `✓ Found Raspberry Pi at ${result} (localhost)` });
        }
        return result;
      }
    }

    // Scan a limited range of IPs (1-30 for each network to avoid long scans)
    const ipPromises = [];
    
    for (const networkPrefix of NETWORK_RANGES) {
      for (let i = 1; i <= 30; i++) {
        const ip = networkPrefix + i;
        ipPromises.push(checkRaspberryPi(ip));
      }
    }

    if (onProgress) {
      onProgress({ type: 'info', message: `Scanning ${NETWORK_RANGES.length} network ranges (1-30)...` });
    }

    const results = await Promise.allSettled(ipPromises);
    
    // Find successful connections
    const foundIPs = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    if (foundIPs.length > 0) {
      const newIP = foundIPs[0];
      persistIp(newIP); // Save to localStorage
      
      if (onProgress) {
        onProgress({ type: 'success', message: `✓ Found Raspberry Pi at ${newIP}` });
      }
      
      return newIP;
    } else {
      if (onProgress) {
        onProgress({ type: 'error', message: '✗ No Raspberry Pi found on local network' });
      }
      return null;
    }
  } catch (error) {
    console.error('Discovery error:', error);
    if (onProgress) {
      onProgress({ type: 'error', message: `✗ Discovery failed: ${error.message}` });
    }
    return null;
  }
}

/**
 * Get Raspberry Pi URL with auto-discovery fallback
 * Returns the URL to use for API calls
 */
export async function getRaspberryPiUrl(forceDiscovery = false) {
  // Clear incorrectly cached localhost
  clearLocalhostCache();

  // If not forcing discovery, try persisted IP first
  if (!forceDiscovery) {
    const persistedIp = getPersistedIp();
    if (persistedIp) {
      // Quick check if persisted IP is still valid
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(`http://${persistedIp}:5000/`, {
          signal: controller.signal,
          mode: 'cors'
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return `http://${persistedIp}:5000`;
        }
      } catch (error) {
        console.log('Persisted IP not responding, will discover...');
        clearPersistedIp(); // Clear invalid cached IP
      }
    }
  }

  // Perform discovery
  const discoveredIp = await discoverRaspberryPi();
  if (discoveredIp) {
    return `http://${discoveredIp}:5000`;
  }

  // Fallback to localhost for local development only
  console.warn('No Raspberry Pi found, falling back to localhost (for development only)');
  return 'http://localhost:5000';
}
