import { supabase } from '../lib/supabase';

/**
 * Centralized Audit Logging Service
 * Records all admin actions for security and compliance
 */

const AuditService = {
  /**
   * Log an audit event
   * @param {Object} params - Audit log parameters
   * @param {string} params.action - Action type (CREATE, UPDATE, DELETE, LOGIN, LOGOUT, VIEW, EXPORT)
   * @param {string} params.module - Module/page where action occurred
   * @param {string} params.details - Detailed description of the action
   * @param {string} [params.ipAddress] - IP address of the user (optional)
   */
  async logAuditEvent({ action, module, details, ipAddress }) {
    try {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.warn('No authenticated user for audit log');
        return;
      }

      // Get user email from auth metadata
      const username = user.email || 'unknown';

      // Get user's role from staff_users
      const { data: staffData } = await supabase
        .from('staff_users')
        .select('role, full_name')
        .eq('id', user.id)
        .single();

      const userRole = staffData?.role || 'unknown';
      const fullName = staffData?.full_name || username;

      // Construct detailed log message
      const detailedMessage = `${fullName} (${userRole}): ${details}`;

      // Insert audit log
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          username: username,
          action: action,
          module: module,
          details: detailedMessage,
          ip_address: ipAddress || null,
        });

      if (error) {
        console.error('Error logging audit event:', error);
      }
    } catch (error) {
      console.error('Audit logging error:', error);
    }
  },

  /**
   * Login event
   */
  async logLogin(email) {
    return this.logAuditEvent({
      action: 'LOGIN',
      module: 'Authentication',
      details: `User logged in with email: ${email}`,
    });
  },

  /**
   * Logout event
   */
  async logLogout() {
    return this.logAuditEvent({
      action: 'LOGOUT',
      module: 'Authentication',
      details: 'User logged out',
    });
  },

  /**
   * Trip Management events
   */
  async logTripCreated(tripId, busInfo) {
    return this.logAuditEvent({
      action: 'CREATE',
      module: 'Trip Management',
      details: `Created new trip ${tripId} for bus ${busInfo}`,
    });
  },

  async logTripEnded(tripId, busInfo) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Trip Management',
      details: `Ended trip ${tripId} for bus ${busInfo}`,
    });
  },

  async logTripCancelled(tripId, busInfo) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Trip Management',
      details: `Cancelled trip ${tripId} for bus ${busInfo}`,
    });
  },

  async logTripUpdated(tripId, details) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Trip Management',
      details: `Updated trip ${tripId}: ${details}`,
    });
  },

  async logTripDeleted(tripId, busInfo) {
    return this.logAuditEvent({
      action: 'DELETE',
      module: 'Trip Management',
      details: `Deleted trip ${tripId} for bus ${busInfo}`,
    });
  },

  /**
   * Bus Management events
   */
  async logBusCreated(busNumber, plateNumber) {
    return this.logAuditEvent({
      action: 'CREATE',
      module: 'Bus Management',
      details: `Created new bus #${busNumber} (${plateNumber})`,
    });
  },

  async logBusUpdated(busId, details) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Bus Management',
      details: `Updated bus ${busId}: ${details}`,
    });
  },

  async logBusStatusChanged(busId, oldStatus, newStatus) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Bus Management',
      details: `Changed bus ${busId} status from ${oldStatus} to ${newStatus}`,
    });
  },

  async logBusDeleted(busId, plateNumber) {
    return this.logAuditEvent({
      action: 'DELETE',
      module: 'Bus Management',
      details: `Deleted bus ${busId} (${plateNumber})`,
    });
  },

  /**
   * User Management events
   */
  async logUserCreated(email, role, fullName) {
    return this.logAuditEvent({
      action: 'CREATE',
      module: 'User Management',
      details: `Created new user: ${fullName} (${email}) with role: ${role}`,
    });
  },

  async logUserUpdated(userId, details) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'User Management',
      details: `Updated user ${userId}: ${details}`,
    });
  },

  async logUserStatusChanged(userId, email, oldStatus, newStatus) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'User Management',
      details: `Changed ${email} (${userId}) status from ${oldStatus} to ${newStatus}`,
    });
  },

  async logUserDeleted(userId, email) {
    return this.logAuditEvent({
      action: 'DELETE',
      module: 'User Management',
      details: `Deleted user ${email} (${userId})`,
    });
  },

  /**
   * Card Management events
   */
  async logQrCardCreated(cardUid, ownerName) {
    return this.logAuditEvent({
      action: 'CREATE',
      module: 'Card Management',
      details: `Created QR card ${cardUid} for ${ownerName}`,
    });
  },

  async logQrCardUpdated(cardId, details) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Card Management',
      details: `Updated QR card ${cardId}: ${details}`,
    });
  },

  async logQrCardStatusChanged(cardId, cardUid, oldStatus, newStatus) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Card Management',
      details: `Changed QR card ${cardUid} (${cardId}) status from ${oldStatus} to ${newStatus}`,
    });
  },

  async logQrCardDeleted(cardId, cardUid) {
    return this.logAuditEvent({
      action: 'DELETE',
      module: 'Card Management',
      details: `Deleted QR card ${cardUid} (${cardId})`,
    });
  },

  async logTempTicketCreated(ticketUid, fareAmount) {
    return this.logAuditEvent({
      action: 'CREATE',
      module: 'Card Management',
      details: `Created temporary ticket ${ticketUid} with fare ₱${fareAmount}`,
    });
  },

  async logTempTicketValidated(ticketId, ticketUid) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Card Management',
      details: `Validated temporary ticket ${ticketUid} (${ticketId})`,
    });
  },

  /**
   * Passenger Analytics events
   */
  async logAnalyticsViewed(timeRange) {
    return this.logAuditEvent({
      action: 'VIEW',
      module: 'Passenger Analytics',
      details: `Viewed passenger analytics for time range: ${timeRange}`,
    });
  },

  async logIrregularityResolved(irregularityId, type) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Passenger Analytics',
      details: `Resolved fare irregularity ${irregularityId} of type: ${type}`,
    });
  },

  async logDataExported(module, format) {
    return this.logAuditEvent({
      action: 'EXPORT',
      module: module,
      details: `Exported data from ${module} in ${format} format`,
    });
  },

  /**
   * Customer Service events
   */
  async logCustomerServiceAction(action, description) {
    return this.logAuditEvent({
      action: 'CREATE',
      module: 'Customer Service',
      details: `Customer service action: ${action} - ${description}`,
    });
  },

  /**
   * Emergency Alerts events
   */
  async logEmergencyAlertViewed(alertId) {
    return this.logAuditEvent({
      action: 'VIEW',
      module: 'Emergency Alerts',
      details: `Viewed emergency alert ${alertId}`,
    });
  },

  async logEmergencyAlertResolved(alertId, notes) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Emergency Alerts',
      details: `Resolved emergency alert ${alertId}. Notes: ${notes}`,
    });
  },

  /**
   * Reports events
   */
  async logReportGenerated(reportName, parameters) {
    return this.logAuditEvent({
      action: 'VIEW',
      module: 'Reports',
      details: `Generated report: ${reportName} with parameters: ${parameters}`,
    });
  },

  /**
   * Settings events
   */
  async logSettingsUpdated(settingName, oldValue, newValue) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Settings',
      details: `Updated setting ${settingName} from ${oldValue} to ${newValue}`,
    });
  },

  /**
   * Fare Matrix events
   */
  async logFareMatrixUpdated(routeFrom, routeTo, details) {
    return this.logAuditEvent({
      action: 'UPDATE',
      module: 'Fare Matrix',
      details: `Updated fare for route ${routeFrom} to ${routeTo}: ${details}`,
    });
  },

  /**
   * Generic page view logging
   */
  async logPageView(pageName) {
    return this.logAuditEvent({
      action: 'VIEW',
      module: pageName,
      details: `Viewed ${pageName} page`,
    });
  },
};

export default AuditService;