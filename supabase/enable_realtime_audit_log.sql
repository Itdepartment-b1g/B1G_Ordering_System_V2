-- Enable realtime for system_audit_log table
-- This allows real-time subscriptions to audit log changes

ALTER PUBLICATION supabase_realtime ADD TABLE system_audit_log;

COMMENT ON TABLE system_audit_log IS 'Comprehensive audit trail with realtime subscriptions enabled';
