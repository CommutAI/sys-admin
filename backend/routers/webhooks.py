"""
Webhook endpoints for payment providers and external integrations
"""

from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from database import supabase

router = APIRouter()


class GCashWebhookPayload(BaseModel):
    """GCash webhook payload model"""
    event_type: str
    payment_id: str
    amount: float
    phone_number: str
    status: str
    timestamp: str


@router.post("/gcash")
async def gcash_webhook(
    payload: GCashWebhookPayload,
    x_webhook_signature: Optional[str] = Header(None)
):
    """
    Handle GCash payment webhooks
    Processes payment notifications and updates system
    """
    try:
        # Verify webhook signature (implement signature verification)
        # if not verify_webhook_signature(payload, x_webhook_signature):
        #     raise HTTPException(status_code=401, detail="Invalid signature")
        
        # Check if transaction already exists
        existing_result = supabase.table('gcash_transactions').select('*').eq('stripe_payment_id', payload.payment_id).execute()
        existing = existing_result[1] if existing_result[1] else []
        
        if existing:
            # Update existing transaction
            update_result = supabase.table('gcash_transactions').update({
                'status': payload.status,
                'updated_at': datetime.now().isoformat()
            }).eq('stripe_payment_id', payload.payment_id).execute()
        else:
            # Create new transaction record
            insert_result = supabase.table('gcash_transactions').insert({
                'phone_number': payload.phone_number,
                'amount': payload.amount,
                'stripe_payment_id': payload.payment_id,
                'status': payload.status,
                'created_at': datetime.now().isoformat()
            }).execute()
        
        # If payment is completed, process the top-up
        if payload.status == 'completed':
            # Find the card associated with this phone number
            cards_result = supabase.table('qr_cards').select('*').eq('contact_number', payload.phone_number).execute()
            cards = cards_result[1] if cards_result[1] else []
            
            if cards:
                card = cards[0]
                # Update card balance
                new_balance = card['balance'] + payload.amount
                update_result = supabase.table('qr_cards').update({
                    'balance': new_balance
                }).eq('id', card['id']).execute()
                
                # Create transaction record
                insert_result = supabase.table('transactions').insert({
                    'card_id': card['id'],
                    'card_uid': card['card_uid'],
                    'type': 'balance_topup',
                    'amount': payload.amount,
                    'channel': 'gcash',
                    'created_at': datetime.now().isoformat()
                }).execute()
        
        return {"status": "processed", "payment_id": payload.payment_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe")
async def stripe_webhook(request: Request):
    """
    Handle Stripe payment webhooks
    Processes payment notifications and updates system
    """
    try:
        import stripe
        
        # Get the raw body
        body = await request.body()
        signature = request.headers.get('stripe-signature')
        
        # Verify webhook signature
        # webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
        # event = stripe.Webhook.construct_event(body, signature, webhook_secret)
        
        # For now, parse as JSON
        import json
        payload = json.loads(body)
        
        event_type = payload.get('type')
        data = payload.get('data', {})
        
        if event_type == 'payment_intent.succeeded':
            payment_intent = data.get('object', {})
            amount = payment_intent.get('amount', 0) / 100  # Convert from cents
            payment_id = payment_intent.get('id')
            
            # Create or update transaction
            existing_result = supabase.table('gcash_transactions').select('*').eq('stripe_payment_id', payment_id).execute()
            existing = existing_result[1] if existing_result[1] else []
            
            if not existing:
                insert_result = supabase.table('gcash_transactions').insert({
                    'phone_number': payment_intent.get('metadata', {}).get('phone_number'),
                    'amount': amount,
                    'stripe_payment_id': payment_id,
                    'status': 'completed',
                    'created_at': datetime.now().isoformat()
                }).execute()
        
        return {"status": "processed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emergency")
async def emergency_alert_webhook(payload: dict):
    """
    Handle emergency alert webhooks from buses
    Processes emergency notifications
    """
    try:
        bus_id = payload.get('bus_id')
        alert_type = payload.get('alert_type')
        description = payload.get('description')
        location = payload.get('location')
        
        # Create emergency alert record
        alert_result = supabase.table('emergency_alerts').insert({
            'bus_id': bus_id,
            'alert_type': alert_type,
            'description': description,
            'location': location,
            'status': 'active',
            'created_at': datetime.now().isoformat()
        }).execute()
        alert_data = alert_result[1] if alert_result[1] else []
        
        # Create notification for admins
        admins_result = supabase.table('staff_users').select('id').eq('role', 'admin').execute()
        admins = admins_result[1] if admins_result[1] else []
        
        if admins:
            notifications = [
                {
                    'user_id': admin['id'],
                    'type': 'emergency',
                    'title': f'Emergency Alert: {alert_type}',
                    'message': description,
                    'read': False,
                    'created_at': datetime.now().isoformat()
                }
                for admin in admins
            ]
            notify_result = supabase.table('notifications').insert(notifications).execute()
        
        return {"status": "alert_created", "alert_id": alert_data[0]['id'] if alert_data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def verify_webhook_signature(payload: dict, signature: str) -> bool:
    """
    Verify webhook signature
    Implement proper signature verification based on provider
    """
    # Placeholder for signature verification
    # Implement HMAC verification with provider's secret key
    return True
