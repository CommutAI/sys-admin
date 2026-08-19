"""
Supabase database client
"""

from supabase import create_client, Client
from config import settings
from typing import Optional


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client with service role key for admin operations"""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("Warning: Supabase credentials not configured. Database operations will fail.")
        return None
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key
    )


# Global Supabase client
supabase = get_supabase_client()
