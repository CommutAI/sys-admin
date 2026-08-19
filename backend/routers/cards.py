"""
Card management endpoints - complex operations and aggregations
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date
from database import supabase

router = APIRouter()


class CardStats(BaseModel):
    """Card statistics model"""
    total_cards: int
    active_cards: int
    lost_cards: int
    replaced_cards: int
    deactivated_cards: int
    total_balance: float
    average_balance: float


class CardSalesStats(BaseModel):
    """Card sales statistics model"""
    total_cards_sold: int
    total_revenue: float
    regular_cards_sold: int
    regular_revenue: float
    student_cards_sold: int
    student_revenue: float
    senior_citizen_cards_sold: int
    senior_citizen_revenue: float
    pwd_cards_sold: int
    pwd_revenue: float
    today_sales: int
    today_revenue: float


class CardSummary(BaseModel):
    """Card summary with related data"""
    card_uid: str
    owner_name: str
    contact_number: Optional[str]
    balance: float
    status: str
    issued_by: Optional[str]
    created_at: datetime
    transaction_count: int
    last_transaction: Optional[datetime]


@router.get("/stats", response_model=CardStats)
async def get_card_stats():
    """
    Get aggregated card statistics
    More efficient than fetching all cards in frontend
    """
    try:
        # Get card counts by status
        active_result = supabase.table('qr_cards').select('id', count='exact').eq('status', 'active').execute()
        active_count = active_result.count if hasattr(active_result, 'count') else len(active_result[1]) if active_result[1] else 0
        
        lost_result = supabase.table('qr_cards').select('id', count='exact').eq('status', 'lost').execute()
        lost_count = lost_result.count if hasattr(lost_result, 'count') else len(lost_result[1]) if lost_result[1] else 0
        
        replaced_result = supabase.table('qr_cards').select('id', count='exact').eq('status', 'replaced').execute()
        replaced_count = replaced_result.count if hasattr(replaced_result, 'count') else len(replaced_result[1]) if replaced_result[1] else 0
        
        deactivated_result = supabase.table('qr_cards').select('id', count='exact').eq('status', 'deactivated').execute()
        deactivated_count = deactivated_result.count if hasattr(deactivated_result, 'count') else len(deactivated_result[1]) if deactivated_result[1] else 0
        
        # Get total and average balance
        balance_result = supabase.table('qr_cards').select('balance').execute()
        balance_data = balance_result[1] if balance_result[1] else []
        
        total_cards = len(balance_data)
        total_balance = sum(card['balance'] for card in balance_data) if balance_data else 0
        average_balance = total_balance / total_cards if total_cards > 0 else 0
        
        return CardStats(
            total_cards=total_cards,
            active_cards=active_count,
            lost_cards=lost_count,
            replaced_cards=replaced_count,
            deactivated_cards=deactivated_count,
            total_balance=total_balance,
            average_balance=average_balance
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary", response_model=List[CardSummary])
async def get_cards_summary(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = None
):
    """
    Get card summary with transaction counts
    Efficient aggregation that reduces frontend queries
    """
    try:
        query = supabase.table('qr_cards').select(
            '*, issuer:staff_users!issued_by(full_name)'
        ).order('created_at', desc=True).range(offset, offset + limit - 1)
        
        if status_filter:
            query = query.eq('status', status_filter)
        
        result = query.execute()
        cards = result[1] if result[1] else []
        
        # Get transaction counts for each card
        card_summaries = []
        for card in cards:
            tx_result = supabase.table('transactions').select('id, created_at').eq('card_id', card['id']).order('created_at', desc=True).limit(1).execute()
            tx_data = tx_result[1] if tx_result[1] else []
            
            card_summaries.append(CardSummary(
                card_uid=card['card_uid'],
                owner_name=card['owner_name'],
                contact_number=card.get('contact_number'),
                balance=card['balance'],
                status=card['status'],
                issued_by=card.get('issuer', {}).get('full_name') if card.get('issuer') else None,
                created_at=card['created_at'],
                transaction_count=len(tx_data) if tx_data else 0,
                last_transaction=tx_data[0]['created_at'] if tx_data else None
            ))
        
        return card_summaries
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-update")
async def batch_update_cards(card_ids: List[str], updates: dict):
    """
    Batch update multiple cards
    More efficient than individual updates
    """
    try:
        results = []
        for card_id in card_ids:
            result = supabase.table('qr_cards').update(updates).eq('id', card_id).execute()
            data = result[1] if result[1] else []
            results.append(data[0] if data else None)
        
        return {"updated": len([r for r in results if r]), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/low-balance")
async def get_low_balance_cards(threshold: float = Query(50.0, ge=0)):
    """Get cards with balance below threshold"""
    try:
        result = supabase.table('qr_cards').select('*').lt('balance', threshold).eq('status', 'active').execute()
        data = result[1] if result[1] else []
        return {"cards": data, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity/{card_uid}")
async def get_card_activity(card_uid: str, days: int = Query(30, ge=1, le=365)):
    """
    Get card activity history for specified days
    Aggregates transactions and temporary tickets
    """
    try:
        from datetime import timedelta
        
        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        # Get transactions
        tx_result = supabase.table('transactions').select('*').eq('card_uid', card_uid).gte('created_at', cutoff_date).execute()
        transactions = tx_result[1] if tx_result[1] else []
        
        # Get temporary tickets
        ticket_result = supabase.table('temporary_tickets').select('*').eq('card_uid', card_uid).gte('issued_at', cutoff_date).execute()
        tickets = ticket_result[1] if ticket_result[1] else []
        
        return {
            "card_uid": card_uid,
            "period_days": days,
            "transaction_count": len(transactions),
            "ticket_count": len(tickets),
            "transactions": transactions,
            "tickets": tickets
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sales-stats", response_model=CardSalesStats)
async def get_card_sales_stats():
    """
    Get card sales statistics by card type
    Tracks regular (₱100) vs discounted (₱50) card sales
    """
    # Check if Supabase is configured
    if supabase is None:
        # Return mock data for testing
        return CardSalesStats(
            total_cards_sold=0,
            total_revenue=0.0,
            regular_cards_sold=0,
            regular_revenue=0.0,
            student_cards_sold=0,
            student_revenue=0.0,
            senior_citizen_cards_sold=0,
            senior_citizen_revenue=0.0,
            pwd_cards_sold=0,
            pwd_revenue=0.0,
            today_sales=0,
            today_revenue=0.0
        )
    
    try:
        from datetime import timedelta
        
        # Get all cards
        all_result = supabase.table('qr_cards').select('*').execute()
        all_cards = all_result[1] if all_result[1] else []
        
        # Get today's cards
        today = datetime.now().date()
        today_start = datetime.combine(today, datetime.min.time()).isoformat()
        today_result = supabase.table('qr_cards').select('*').gte('created_at', today_start).execute()
        today_cards = today_result[1] if today_result[1] else []
        
        # Calculate statistics by card type
        regular_cards = [c for c in all_cards if c.get('card_type') == 'regular']
        student_cards = [c for c in all_cards if c.get('card_type') == 'student']
        senior_cards = [c for c in all_cards if c.get('card_type') == 'senior_citizen']
        pwd_cards = [c for c in all_cards if c.get('card_type') == 'pwd']
        
        # Regular cards: ₱100
        regular_revenue = sum(c.get('purchase_price', 100) for c in regular_cards)
        
        # Discounted cards: ₱50 (50% off)
        student_revenue = sum(c.get('purchase_price', 50) for c in student_cards)
        senior_revenue = sum(c.get('purchase_price', 50) for c in senior_cards)
        pwd_revenue = sum(c.get('purchase_price', 50) for c in pwd_cards)
        
        total_revenue = regular_revenue + student_revenue + senior_revenue + pwd_revenue
        
        # Today's sales
        today_regular = len([c for c in today_cards if c.get('card_type') == 'regular'])
        today_student = len([c for c in today_cards if c.get('card_type') == 'student'])
        today_senior = len([c for c in today_cards if c.get('card_type') == 'senior_citizen'])
        today_pwd = len([c for c in today_cards if c.get('card_type') == 'pwd'])
        
        today_revenue = (
            today_regular * 100 +
            (today_student + today_senior + today_pwd) * 50
        )
        
        return CardSalesStats(
            total_cards_sold=len(all_cards),
            total_revenue=total_revenue,
            regular_cards_sold=len(regular_cards),
            regular_revenue=regular_revenue,
            student_cards_sold=len(student_cards),
            student_revenue=student_revenue,
            senior_citizen_cards_sold=len(senior_cards),
            senior_citizen_revenue=senior_revenue,
            pwd_cards_sold=len(pwd_cards),
            pwd_revenue=pwd_revenue,
            today_sales=len(today_cards),
            today_revenue=today_revenue
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
