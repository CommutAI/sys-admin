"""
Authentication utilities for backend
"""

from fastapi import HTTPException, Depends, status, Request
from database import supabase


async def verify_supabase_token(request: Request):
    """Verify Supabase JWT token from Authorization header"""
    auth_header = request.headers.get("Authorization")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header"
        )
    
    token = auth_header.split(" ")[1]
    
    try:
        # Verify token with Supabase
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        return user_response.user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}"
        )


async def require_admin(user = Depends(verify_supabase_token)):
    """Require admin role"""
    # Fetch user role from staff_users
    staff_response = supabase.table('staff_users').select('role').eq('id', user.id).single().execute()
    
    if not staff_response.data or staff_response.data.get('role') != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    
    return user
