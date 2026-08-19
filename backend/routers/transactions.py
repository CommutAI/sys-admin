"""
Transaction management endpoints - aggregations and analytics
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from database import supabase

router = APIRouter()


class DailyRevenue(BaseModel):
    """Daily revenue model"""
    date: str
    total_revenue: float
    fare_validation_count: int
    topup_count: int
    card_issuance_count: int


class TransactionAnalytics(BaseModel):
    """Transaction analytics model"""
    total_revenue: float
    total_transactions: int
    average_transaction_value: float
    by_type: dict
    by_channel: dict


@router.get("/analytics/daily")
async def get_daily_revenue(
    start_date: date,
    end_date: date
) -> List[DailyRevenue]:
    """
    Get daily revenue breakdown between dates
    Efficient server-side aggregation
    """
    try:
        start_iso = start_date.isoformat()
        end_iso = (end_date + timedelta(days=1)).isoformat()
        
        result = supabase.table('transactions').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
        transactions = result[1] if result[1] else []
        
        # Group by date
        daily_data = {}
        for tx in transactions:
            tx_date = datetime.fromisoformat(tx['created_at']).date().isoformat()
            if tx_date not in daily_data:
                daily_data[tx_date] = {
                    "total_revenue": 0,
                    "fare_validation_count": 0,
                    "topup_count": 0,
                    "card_issuance_count": 0
                }
            
            daily_data[tx_date]["total_revenue"] += tx['amount']
            
            if tx['type'] == 'fare_validation':
                daily_data[tx_date]["fare_validation_count"] += 1
            elif tx['type'] == 'balance_topup':
                daily_data[tx_date]["topup_count"] += 1
            elif tx['type'] == 'card_issuance':
                daily_data[tx_date]["card_issuance_count"] += 1
        
        # Convert to list and sort
        result = [
            DailyRevenue(
                date=date,
                total_revenue=data["total_revenue"],
                fare_validation_count=data["fare_validation_count"],
                topup_count=data["topup_count"],
                card_issuance_count=data["card_issuance_count"]
            )
            for date, data in daily_data.items()
        ]
        
        result.sort(key=lambda x: x.date)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/summary", response_model=TransactionAnalytics)
async def get_transaction_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    """
    Get transaction analytics summary
    """
    try:
        query = supabase.table('transactions').select('*')
        
        if start_date:
            query = query.gte('created_at', start_date.isoformat())
        if end_date:
            query = query.lte('created_at', (end_date + timedelta(days=1)).isoformat())
        
        result = query.execute()
        transactions = result[1] if result[1] else []
        
        if not transactions:
            return TransactionAnalytics(
                total_revenue=0,
                total_transactions=0,
                average_transaction_value=0,
                by_type={},
                by_channel={}
            )
        
        total_revenue = sum(tx['amount'] for tx in transactions)
        total_transactions = len(transactions)
        average_transaction_value = total_revenue / total_transactions if total_transactions > 0 else 0
        
        # Group by type
        by_type = {}
        for tx in transactions:
            tx_type = tx['type']
            if tx_type not in by_type:
                by_type[tx_type] = {"count": 0, "total": 0}
            by_type[tx_type]["count"] += 1
            by_type[tx_type]["total"] += tx['amount']
        
        # Group by channel
        by_channel = {}
        for tx in transactions:
            channel = tx.get('channel', 'unknown')
            if channel not in by_channel:
                by_channel[channel] = {"count": 0, "total": 0}
            by_channel[channel]["count"] += 1
            by_channel[channel]["total"] += tx['amount']
        
        return TransactionAnalytics(
            total_revenue=total_revenue,
            total_transactions=total_transactions,
            average_transaction_value=average_transaction_value,
            by_type=by_type,
            by_channel=by_channel
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch")
async def create_batch_transactions(transactions: List[dict]):
    """
    Create multiple transactions in a single request
    More efficient than individual API calls
    """
    try:
        result = supabase.table('transactions').insert(transactions).execute()
        data = result[1] if result[1] else []
        return {"created": len(data), "transactions": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reconciliation")
async def get_payment_reconciliation(
    start_date: date,
    end_date: date
):
    """
    Reconcile GCash transactions with system transactions
    """
    try:
        start_iso = start_date.isoformat()
        end_iso = (end_date + timedelta(days=1)).isoformat()
        
        # Get GCash transactions
        gcash_result = supabase.table('gcash_transactions').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
        gcash_txs = gcash_result[1] if gcash_result[1] else []
        
        # Get system balance topup transactions
        system_result = supabase.table('transactions').select('*').eq('type', 'balance_topup').gte('created_at', start_iso).lt('created_at', end_iso).execute()
        system_txs = system_result[1] if system_result[1] else []
        
        # Match by amount and approximate time
        matched = []
        unmatched_gcash = []
        unmatched_system = []
        
        for gcash in gcash_txs:
            found = False
            for system in system_txs:
                if (abs(gcash['amount'] - system['amount']) < 0.01 and 
                    abs((datetime.fromisoformat(gcash['created_at']) - datetime.fromisoformat(system['created_at'])).total_seconds()) < 300):
                    matched.append({
                        "gcash": gcash,
                        "system": system,
                        "amount": gcash['amount']
                    })
                    found = True
                    break
            if not found:
                unmatched_gcash.append(gcash)
        
        # Find unmatched system transactions
        matched_system_ids = {m['system']['id'] for m in matched}
        for system in system_txs:
            if system['id'] not in matched_system_ids:
                unmatched_system.append(system)
        
        return {
            "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "matched_count": len(matched),
            "matched_amount": sum(m['amount'] for m in matched),
            "unmatched_gcash_count": len(unmatched_gcash),
            "unmatched_gcash_amount": sum(t['amount'] for t in unmatched_gcash),
            "unmatched_system_count": len(unmatched_system),
            "unmatched_system_amount": sum(t['amount'] for t in unmatched_system),
            "matched": matched,
            "unmatched_gcash": unmatched_gcash,
            "unmatched_system": unmatched_system
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
