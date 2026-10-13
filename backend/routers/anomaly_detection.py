"""
Anomaly Detection endpoints - automatic fare irregularity detection
Compares AI camera counts with boarded passengers to identify fare evasion
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
from database import supabase

router = APIRouter()


class AnomalyDetectionResult(BaseModel):
    """Result of anomaly detection for a trip"""
    trip_id: str
    bus_plate: Optional[str]
    ai_count: int
    boarded_count: int
    staff_count: int
    expected_passengers: int
    discrepancy: int
    anomaly_detected: bool
    irregularity_created: bool
    irregularity_id: Optional[str]


class AnomalyDetectionSummary(BaseModel):
    """Summary of anomaly detection across all active trips"""
    total_trips_checked: int
    anomalies_detected: int
    irregularities_created: int
    results: List[AnomalyDetectionResult]


@router.post("/detect", response_model=AnomalyDetectionSummary)
async def detect_anomalies(
    threshold: int = 2,
    check_all_active: bool = True,
    trip_id: Optional[str] = None
):
    """
    Detect fare irregularities by comparing AI camera counts with boarded passengers
    
    Process:
    1. Get active trip(s) with conductor and driver IDs
    2. Get latest AI passenger count from camera
    3. Subtract staff (conductor + driver = 2) from AI count
    4. Compare with boarded passengers count
    5. If discrepancy exceeds threshold, create fare_irregularity record
    
    Args:
        threshold: Minimum discrepancy to flag as anomaly (default: 2)
        check_all_active: Check all active trips or specific trip_id
        trip_id: Specific trip to check (if not checking all active)
    """
    try:
        results = []
        anomalies_detected = 0
        irregularities_created = 0
        
        # Get trips to check
        if trip_id:
            # Check specific trip
            trip_result = supabase.table('trips').select(
                'id, bus_id, conductor_id, driver_id, status, buses(plate_number)'
            ).eq('id', trip_id).execute()
            trips = trip_result[1] if trip_result[1] else []
        elif check_all_active:
            # Check all active trips
            trip_result = supabase.table('trips').select(
                'id, bus_id, conductor_id, driver_id, status, buses(plate_number)'
            ).eq('status', 'in_progress').execute()
            trips = trip_result[1] if trip_result[1] else []
        else:
            return AnomalyDetectionSummary(
                total_trips_checked=0,
                anomalies_detected=0,
                irregularities_created=0,
                results=[]
            )
        
        if not trips:
            return AnomalyDetectionSummary(
                total_trips_checked=0,
                anomalies_detected=0,
                irregularities_created=0,
                results=[]
            )
        
        # Check each trip
        for trip in trips:
            trip_id = trip['id']
            bus_plate = trip.get('buses', {}).get('plate_number', 'Unknown')
            conductor_id = trip.get('conductor_id')
            driver_id = trip.get('driver_id')
            
            # Count staff on board (conductor + driver)
            staff_count = 0
            if conductor_id:
                staff_count += 1
            if driver_id:
                staff_count += 1
            
            # Get latest AI passenger count for this trip
            count_result = supabase.table('passenger_counts').select(
                'count, ai_count, source, recorded_at'
            ).eq('trip_id', trip_id).order('recorded_at', desc=True).limit(1).execute()
            
            if not count_result[1]:
                # No passenger count data for this trip
                results.append(AnomalyDetectionResult(
                    trip_id=trip_id,
                    bus_plate=bus_plate,
                    ai_count=0,
                    boarded_count=0,
                    staff_count=staff_count,
                    expected_passengers=0,
                    discrepancy=0,
                    anomaly_detected=False,
                    irregularity_created=False,
                    irregularity_id=None
                ))
                continue
            
            latest_count = count_result[1][0]
            ai_count = latest_count.get('ai_count') or latest_count.get('count', 0)
            
            # Get boarded passengers count for this trip
            boarded_result = supabase.table('boarded_passengers').select('id').eq('trip_id', trip_id).execute()
            boarded_count = len(boarded_result[1]) if boarded_result[1] else 0
            
            # Calculate expected passengers (AI count minus staff)
            expected_passengers = max(0, ai_count - staff_count)
            
            # Calculate discrepancy
            discrepancy = abs(expected_passengers - boarded_count)
            
            # Check if anomaly detected
            anomaly_detected = discrepancy >= threshold
            irregularity_created = False
            irregularity_id = None
            
            if anomaly_detected:
                anomalies_detected += 1
                
                # Check if irregularity already exists for this trip recently
                recent_time = (datetime.utcnow() - timedelta(minutes=10)).isoformat()
                existing_result = supabase.table('fare_irregularities').select('id').eq('trip_id', trip_id).eq('type', 'count_mismatch').eq('resolved', False).gte('detected_at', recent_time).execute()
                
                if not existing_result[1]:
                    # Create fare irregularity
                    irregularity_data = {
                        'trip_id': trip_id,
                        'type': 'count_mismatch',
                        'description': f'Camera count: {ai_count}, Staff: {staff_count}, Expected passengers: {expected_passengers}, Boarded: {boarded_count}, Discrepancy: {discrepancy}',
                        'detected_at': datetime.utcnow().isoformat(),
                        'resolved': False
                    }
                    
                    irregularity_result = supabase.table('fare_irregularities').insert(irregularity_data).execute()
                    if irregularity_result[1]:
                        irregularity_created = True
                        irregularities_created += 1
                        irregularity_id = irregularity_result[1][0]['id']
            
            results.append(AnomalyDetectionResult(
                trip_id=trip_id,
                bus_plate=bus_plate,
                ai_count=ai_count,
                boarded_count=boarded_count,
                staff_count=staff_count,
                expected_passengers=expected_passengers,
                discrepancy=discrepancy,
                anomaly_detected=anomaly_detected,
                irregularity_created=irregularity_created,
                irregularity_id=irregularity_id
            ))
        
        return AnomalyDetectionSummary(
            total_trips_checked=len(trips),
            anomalies_detected=anomalies_detected,
            irregularities_created=irregularities_created,
            results=results
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{trip_id}")
async def get_anomaly_status(trip_id: str):
    """
    Get current anomaly status for a specific trip
    Returns latest counts and whether there's an active irregularity
    """
    try:
        # Get trip info
        trip_result = supabase.table('trips').select(
            'id, bus_id, conductor_id, driver_id, status, buses(plate_number)'
        ).eq('id', trip_id).execute()
        
        if not trip_result[1]:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        trip = trip_result[1][0]
        bus_plate = trip.get('buses', {}).get('plate_number', 'Unknown')
        conductor_id = trip.get('conductor_id')
        driver_id = trip.get('driver_id')
        
        # Count staff
        staff_count = 0
        if conductor_id:
            staff_count += 1
        if driver_id:
            staff_count += 1
        
        # Get latest AI count
        count_result = supabase.table('passenger_counts').select(
            'count, ai_count, source, recorded_at'
        ).eq('trip_id', trip_id).order('recorded_at', desc=True).limit(1).execute()
        
        ai_count = 0
        if count_result[1]:
            ai_count = count_result[1][0].get('ai_count') or count_result[1][0].get('count', 0)
        
        # Get boarded count
        boarded_result = supabase.table('boarded_passengers').select('id').eq('trip_id', trip_id).execute()
        boarded_count = len(boarded_result[1]) if boarded_result[1] else 0
        
        # Get active irregularities
        irregularity_result = supabase.table('fare_irregularities').select('*').eq('trip_id', trip_id).eq('type', 'count_mismatch').eq('resolved', False).execute()
        active_irregularities = irregularity_result[1] if irregularity_result[1] else []
        
        expected_passengers = max(0, ai_count - staff_count)
        discrepancy = abs(expected_passengers - boarded_count)
        
        return {
            'trip_id': trip_id,
            'bus_plate': bus_plate,
            'ai_count': ai_count,
            'boarded_count': boarded_count,
            'staff_count': staff_count,
            'expected_passengers': expected_passengers,
            'discrepancy': discrepancy,
            'anomaly_detected': discrepancy >= 2,
            'active_irregularities': active_irregularities,
            'active_irregularity_count': len(active_irregularities)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resolve/{irregularity_id}")
async def resolve_irregularity(irregularity_id: str, resolved_by: str):
    """
    Mark a fare irregularity as resolved
    """
    try:
        result = supabase.table('fare_irregularities').update({
            'resolved': True,
            'resolved_by': resolved_by,
            'resolved_at': datetime.utcnow().isoformat()
        }).eq('id', irregularity_id).execute()
        
        if not result[1]:
            raise HTTPException(status_code=404, detail="Irregularity not found")
        
        return {"status": "success", "message": "Irregularity resolved"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
