-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow authenticated users to read staff_users" ON staff_users;

-- Create the policy
CREATE POLICY "Allow authenticated users to read staff_users"
ON staff_users FOR SELECT
TO authenticated
USING (true);

-- Also add policy for service role (for admin operations)
DROP POLICY IF EXISTS "Allow service role to manage staff_users" ON staff_users;

CREATE POLICY "Allow service role to manage staff_users"
ON staff_users
TO service_role
USING (true)
WITH CHECK (true);
