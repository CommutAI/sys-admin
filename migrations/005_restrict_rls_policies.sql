-- Migration: Restrict RLS policies by role
-- This migration updates RLS policies to be more restrictive and role-based

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "buses_read_all" ON buses;
DROP POLICY IF EXISTS "qr_cards_read_authenticated" ON qr_cards;
DROP POLICY IF EXISTS "qr_cards_delete_authenticated" ON qr_cards;
DROP POLICY IF EXISTS "qr_cards_insert_authenticated" ON qr_cards;
DROP POLICY IF EXISTS "qr_cards_update_authenticated" ON qr_cards;
DROP POLICY IF EXISTS "card_reservations_rw_authenticated" ON card_reservations;
DROP POLICY IF EXISTS "temp_tickets_rw_authenticated" ON temporary_tickets;
DROP POLICY IF EXISTS "transactions_insert_authenticated" ON transactions;
DROP POLICY IF EXISTS "transactions_select_authenticated" ON transactions;
DROP POLICY IF EXISTS "passenger_counts_rw_authenticated" ON passenger_counts;
DROP POLICY IF EXISTS "boarded_passengers_rw_authenticated" ON boarded_passengers;
DROP POLICY IF EXISTS "gps_logs_rw_authenticated" ON gps_logs;
DROP POLICY IF EXISTS "fare_irregularities_rw_authenticated" ON fare_irregularities;
DROP POLICY IF EXISTS "emergency_alerts_rw_authenticated" ON emergency_alerts;
DROP POLICY IF EXISTS "emergency_contacts_rw_authenticated" ON emergency_contacts;
DROP POLICY IF EXISTS "sms_logs_rw_authenticated" ON sms_logs;
DROP POLICY IF EXISTS "gps_locations_rw_authenticated" ON gps_locations;
DROP POLICY IF EXISTS "hardware_status_rw_authenticated" ON hardware_status;
DROP POLICY IF EXISTS "cs_logs_rw_authenticated" ON customer_service_logs;
DROP POLICY IF EXISTS "gcash_transactions_rw_authenticated" ON gcash_transactions;
DROP POLICY IF EXISTS "notifications_rw_authenticated" ON notifications;
DROP POLICY IF EXISTS "audit_logs_rw_authenticated" ON audit_logs;
DROP POLICY IF EXISTS "fare_matrix_rw_authenticated" ON fare_matrix;
DROP POLICY IF EXISTS "baggage_fee_matrix_rw_authenticated" ON baggage_fee_matrix;
DROP POLICY IF EXISTS "bus_schedules_rw_authenticated" ON bus_schedules;
DROP POLICY IF EXISTS "trip_schedules_rw_authenticated" ON trip_schedules;
DROP POLICY IF EXISTS "video_recordings_rw_authenticated" ON video_recordings;

-- Create role-based policies

-- Buses: Admins can do everything, others can only read
CREATE POLICY "buses_admin_all" ON buses FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "buses_read_all" ON buses FOR SELECT
  TO authenticated
  USING (true);

-- QR Cards: Admins can do everything, conductors can read/scan, others read-only
CREATE POLICY "qr_cards_admin_all" ON qr_cards FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "qr_cards_conductor_read" ON qr_cards FOR SELECT
  TO authenticated
  USING (current_user_role() IN ('conductor', 'admin', 'cs_desk'));

CREATE POLICY "qr_cards_conductor_update" ON qr_cards FOR UPDATE
  TO authenticated
  USING (current_user_role() = 'conductor')
  WITH CHECK (current_user_role() = 'conductor');

-- Trips: Admins see all, conductors see only their own
CREATE POLICY "trips_admin_all" ON trips FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "trips_conductor_own" ON trips FOR ALL
  TO authenticated
  USING (conductor_id = auth.uid())
  WITH CHECK (conductor_id = auth.uid());

CREATE POLICY "trips_driver_own" ON trips FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

-- Transactions: Admins see all, conductors see their trip transactions
CREATE POLICY "transactions_admin_all" ON transactions FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "transactions_conductor_read" ON transactions FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'conductor' AND 
    trip_id IN (SELECT id FROM trips WHERE conductor_id = auth.uid())
  );

-- Emergency Alerts: Everyone can read, only admins can update
CREATE POLICY "emergency_alerts_read_all" ON emergency_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "emergency_alerts_admin_update" ON emergency_alerts FOR UPDATE
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Staff Users: Admins can manage all, users can only read their own
CREATE POLICY "staff_users_admin_all" ON staff_users FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "staff_users_self_read" ON staff_users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Audit Logs: Only admins can read/write
CREATE POLICY "audit_logs_admin_all" ON audit_logs FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Notifications: Read-only for all authenticated users, admins can manage
CREATE POLICY "notifications_read_all" ON notifications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "notifications_admin_all" ON notifications FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- Fare Matrix: Admins can manage, others can read
CREATE POLICY "fare_matrix_admin_all" ON fare_matrix FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "fare_matrix_read_all" ON fare_matrix FOR SELECT
  TO authenticated
  USING (true);

-- Add default policies for other tables (read-only for non-admins)
CREATE POLICY "card_reservations_read_all" ON card_reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "card_reservations_admin_all" ON card_reservations FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "temp_tickets_read_all" ON temporary_tickets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "temp_tickets_admin_all" ON temporary_tickets FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "passenger_counts_read_all" ON passenger_counts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "passenger_counts_admin_all" ON passenger_counts FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "boarded_passengers_read_all" ON boarded_passengers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "boarded_passengers_admin_all" ON boarded_passengers FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "gps_logs_read_all" ON gps_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gps_logs_admin_all" ON gps_logs FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "fare_irregularities_read_all" ON fare_irregularities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fare_irregularities_admin_all" ON fare_irregularities FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "emergency_contacts_read_all" ON emergency_contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "emergency_contacts_admin_all" ON emergency_contacts FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "sms_logs_read_all" ON sms_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sms_logs_admin_all" ON sms_logs FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "gps_locations_read_all" ON gps_locations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gps_locations_admin_all" ON gps_locations FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "hardware_status_read_all" ON hardware_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "hardware_status_admin_all" ON hardware_status FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "cs_logs_read_all" ON customer_service_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cs_logs_admin_all" ON customer_service_logs FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "gcash_transactions_read_all" ON gcash_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gcash_transactions_admin_all" ON gcash_transactions FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "baggage_fee_matrix_read_all" ON baggage_fee_matrix FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "baggage_fee_matrix_admin_all" ON baggage_fee_matrix FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "bus_schedules_read_all" ON bus_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bus_schedules_admin_all" ON bus_schedules FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "trip_schedules_read_all" ON trip_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "trip_schedules_admin_all" ON trip_schedules FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "video_recordings_read_all" ON video_recordings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "video_recordings_admin_all" ON video_recordings FOR ALL
  TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');
