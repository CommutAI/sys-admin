"""
Simple in-memory cache with TTL support for database queries
Reduces database load and improves response times for frequently accessed data
"""

import time
from typing import Any, Optional, Dict
import hashlib
import json

class QueryCache:
    """Simple in-memory cache with TTL support"""
    
    def __init__(self, default_ttl: int = 60):
        """
        Initialize cache
        Args:
            default_ttl: Default time-to-live in seconds
        """
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.default_ttl = default_ttl
        self.hits = 0
        self.misses = 0
    
    def _generate_key(self, table: str, filters: Dict[str, Any]) -> str:
        """Generate a unique cache key from query parameters"""
        key_data = f"{table}:{json.dumps(filters, sort_keys=True)}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def get(self, table: str, filters: Dict[str, Any]) -> Optional[Any]:
        """
        Get cached data if available and not expired
        Args:
            table: Database table name
            filters: Query filters as dictionary
        Returns:
            Cached data if available and not expired, None otherwise
        """
        key = self._generate_key(table, filters)
        
        if key in self.cache:
            entry = self.cache[key]
            if time.time() < entry['expires_at']:
                self.hits += 1
                return entry['data']
            else:
                # Expired, remove from cache
                del self.cache[key]
        
        self.misses += 1
        return None
    
    def set(self, table: str, filters: Dict[str, Any], data: Any, ttl: Optional[int] = None) -> None:
        """
        Cache data with specified TTL
        Args:
            table: Database table name
            filters: Query filters as dictionary
            data: Data to cache
            ttl: Time-to-live in seconds (uses default if not specified)
        """
        key = self._generate_key(table, filters)
        ttl = ttl if ttl is not None else self.default_ttl
        
        self.cache[key] = {
            'data': data,
            'expires_at': time.time() + ttl,
            'table': table,
            'filters': filters
        }
    
    def invalidate_table(self, table: str) -> None:
        """
        Invalidate all cache entries for a specific table
        Args:
            table: Database table name
        """
        keys_to_delete = [key for key, entry in self.cache.items() if entry.get('table') == table]
        for key in keys_to_delete:
            del self.cache[key]
    
    def clear(self) -> None:
        """Clear all cache entries"""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_requests = self.hits + self.misses
        hit_rate = (self.hits / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'hits': self.hits,
            'misses': self.misses,
            'hit_rate': f"{hit_rate:.2f}%",
            'size': len(self.cache)
        }

# Global cache instance
cache = QueryCache(default_ttl=60)  # 60 second default TTL