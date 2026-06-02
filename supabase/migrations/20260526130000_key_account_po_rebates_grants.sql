-- Grants for Key Account rebate tables (required for authenticated API access).

GRANT SELECT, INSERT, UPDATE ON public.key_account_po_rebates TO authenticated;
GRANT SELECT, INSERT ON public.key_account_po_rebate_lines TO authenticated;
GRANT SELECT, INSERT ON public.key_account_po_rebate_replacements TO authenticated;
GRANT SELECT, INSERT ON public.key_account_client_credits TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.key_account_rebate_number_seq TO authenticated;
