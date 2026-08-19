"""
Analytics endpoints - complex data aggregations
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from database import supabase

router = APIRouter()


class PassengerTrend(BaseModel):
    """Passenger count trend model"""
    date: str
    total_passengers: int
    average_per_trip: float
    peak_hour: Optional[int]


class RoutePerformance(BaseModel):
    """Route performance model"""
    route_id: str
    route_name: str
    total_trips: int
    total_passengers: int
    average_passengers_per_trip: float
    total_revenue: float
    on_time_percentage: float


@router.get("/passenger-trends")
async def get_passenger_trends(
    start_date: date,
    end_date: date,
    group_by: str = Query("day", regex="^(day|hour)$")
) -> List[PassengerTrend]:
    """
    Get passenger count trends with flexible grouping
    Efficient server-side aggregation
    """
    try:
        start_iso = start_date.isoformat()
        end_iso = (end_date + timedelta(days=1)).isoformat()
        
        result = supabase.table('passenger_counts').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
        passenger_counts = result[1] if result[1] else []
        
        if not passenger_counts:
            return []
        
        # Group data based on group_by parameter
        grouped_data = {}
        
        for record in passenger_counts:
            timestamp = datetime.fromisoformat(record['created_at'])
            
            if group_by == "day":
                key = timestamp.date().isoformat()
            else:  # hour
                key = f"{timestamp.date().isoformat()}T{timestamp.hour:02d}"
            
            if key not in grouped_data:
                grouped_data[key] = {
                    "total_passengers": 0,
                    "trip_count": 0,
                    "hourly_counts": {}
                }
            
            grouped_data[key]["total_passengers"] += record['count']
            grouped_data[key]["trip_count"] += 1
            
            if group_by == "day":
                hour = timestamp.hour
                if hour not in grouped_data[key]["hourly_counts"]:
                    grouped_data[key]["hourly_counts"][hour] = 0
                grouped_data[key]["hourly_counts"][hour] += record['count']
        
        # Convert to response model
        result = []
        for key, data in grouped_data.items():
            peak_hour = None
            if data["hourly_counts"]:
                peak_hour = max(data["hourly_counts"], key=data["hourly_counts"].get)
            
            result.append(PassengerTrend(
                date=key,
                total_passengers=data["total_passengers"],
                average_per_trip=data["total_passengers"] / data["trip_count"] if data["trip_count"] > 0 else 0,
                peak_hour=peak_hour
            ))
        
        result.sort(key=lambda x: x.date)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/route-performance")
async def get_route_performance(
    start_date: date,
    end_date: date
) -> List[RoutePerformance]:
    """
    Get route performance metrics
    Aggregates trip data, passenger counts, and revenue
    """
    try:
        start_iso = start_date.isoformat()
        end_iso = (end_date + timedelta(days=1)).isoformat()
        
        # Get trips in date range
        trips_result = supabase.table('trips').select('*, buses(*, routes(*))').gte('created_at', start_iso).lt('created_at', end_iso).execute()
        trips = trips_result[1] if trips_result[1] else []
        
        if not trips:
            return []
        
        # Get passenger counts for these trips
        trip_ids = [trip['id'] for trip in trips]
        passenger_result = supabase.table('passenger_counts').select('*').in_('trip_id', trip_ids).execute()
        passenger_data = passenger_result[1] if passenger_result[1] else []
        
        # Get transactions for revenue
        transaction_result = supabase.table('transactions').select('*').in_('trip_id', trip_ids).execute()
        transaction_data = transaction_result[1] if transaction_result[1] else []
        
        # Group by route
        route_data = {}
        
        for trip in trips:
            route = trip.get('buses', {}).get('routes')
            if not route:
                continue
            
            route_id = route['id']
            route_name = route.get('route_name', 'Unknown')
            
            if route_id not in route_data:
                route_data[route_id] = {
                    "route_name": route_name,
                    "total_trips": 0,
                    "total_passengers": 0,
                    "total_revenue": 0,
                    "on_time_trips": 0
                }
            
            route_data[route_id]["total_trips"] += 1
            
            # Count passengers for this trip
            trip_passengers = sum(p['count'] for p in passenger_data if p['trip_id'] == trip['id'])
            route_data[route_id]["total_passengers"] += trip_passengers
            
            # Sum revenue for this trip
            trip_revenue = sum(t['amount'] for t in transaction_data if t['trip_id'] == trip['id'])
            route_data[route_id]["total_revenue"] += trip_revenue
            
            # Check if on time (assuming scheduled_departure exists)
            if trip.get('scheduled_departure'):
                actual_departure = datetime.fromisoformat(trip['created_at'])
                scheduled = datetime.fromisoformat(trip['scheduled_departure'])
                if abs((actual_departure - scheduled).total_seconds()) <= 300:  # 5 minutes tolerance
                    route_data[route_id]["on_time_trips"] += 1
        
        # Convert to response model
        result = []
        for route_id, data in route_data.items():
            result.append(RoutePerformance(
                route_id=route_id,
                route_name=data["route_name"],
                total_trips=data["total_trips"],
                total_passengers=data["total_passengers"],
                average_passengers_per_trip=data["total_passengers"] / data["total_trips"] if data["total_trips"] > 0 else 0,
                total_revenue=data["total_revenue"],
                on_time_percentage=(data["on_time_trips"] / data["total_trips"] * 100) if data["total_trips"] > 0 else 0
            ))
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime-dashboard")
async def get_realtime_dashboard_data():
    """
    Get aggregated real-time dashboard data
    Reduces multiple frontend queries to single API call
    """
    try:
        # Get current active trips
        active_result = supabase.table('trips').select('*, buses(*)').eq('status', 'active').execute()
        active_trips = active_result[1] if active_result[1] else []
        
        # Get latest passenger counts
        counts_result = supabase.table('passenger_counts').select('*').order('created_at', desc=True).limit(100).execute()
        latest_counts = counts_result[1] if counts_result[1] else []
        
        # Get today's transactions
        today = datetime.now().date().isoformat()
        tx_result = supabase.table('transactions').select('*').gte('created_at', today).execute()
        today_transactions = tx_result[1] if tx_result[1] else []
        
        # Get active emergency alerts
        emergency_result = supabase.table('emergency_alerts').select('*').eq('status', 'active').execute()
        emergencies = emergency_result[1] if emergency_result[1] else []
        
        # Get fare irregularities
        irregularity_result = supabase.table('fare_irregularities').select('*').eq('resolved', False).execute()
        irregularities = irregularity_result[1] if irregularity_result[1] else []
        
        # Calculate totals
        total_revenue = sum(t['amount'] for t in today_transactions) if today_transactions else 0
        total_passengers = sum(p['count'] for p in latest_counts) if latest_counts else 0
        
        return {
            "active_buses": len(active_trips) if active_trips else 0,
            "total_passengers": total_passengers,
            "today_revenue": total_revenue,
            "active_emergencies": len(emergencies) if emergencies else 0,
            "unresolved_irregularities": len(irregularities) if irregularities else 0,
            "active_trips": active_trips,
            "emergencies": emergencies,
            "irregularities": irregularities
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bus-utilization")
async def get_bus_utilization(
    start_date: date,
    end_date: date
):
    """
    Get bus utilization metrics
    """
    try:
        start_iso = start_date.isoformat()
        end_iso = (end_date + timedelta(days=1)).isoformat()
        
        # Get all buses
        buses_result = supabase.table('buses').select('*').execute()
        buses = buses_result[1] if buses_result[1] else []
        
        # Get trips in date range
        trips_result = supabase.table('trips').select('*').gte('created_at', start_iso).lt('created_at', end_iso).execute()
        trips = trips_result[1] if trips_result[1] else []
        
        # Calculate utilization per bus
        bus_utilization = {}
        for bus in buses:
            bus_id = bus['id']
            bus_trips = [t for t in trips if t['bus_id'] == bus_id]
            
            total_trip_time = 0
            for trip in bus_trips:
                if trip.get('ended_at'):
                    start = datetime.fromisoformat(trip['created_at'])
                    end = datetime.fromisoformat(trip['ended_at'])
                    total_trip_time += (end - start).total_seconds()
            
            # Calculate utilization (assuming 12-hour operating day)
            operating_seconds = (end_date - start_date).days * 12 * 3600
            utilization = (total_trip_time / operating_seconds * 100) if operating_seconds > 0 else 0
            
            bus_utilization[bus_id] = {
                "plate_number": bus['plate_number'],
                "total_trips": len(bus_trips),
                "total_trip_hours": total_trip_time / 3600,
                "utilization_percentage": utilization
            }
        
        return {
            "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "bus_count": len(buses),
            "utilization": list(bus_utilization.values())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
