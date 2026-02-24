-- ============================================================================
-- CREATE COMPANY INITIALS EXTRACTION AND ORDER NUMBER FUNCTIONS
-- ============================================================================
-- This migration creates functions to:
-- 1. Extract company initials from company name (1-4 letters)
-- 2. Ensure uniqueness of company initials
-- 3. Generate next order sequence number
-- 4. Generate order numbers in format: ORD-YYYY-{Initials}-{Sequence}
-- ============================================================================

-- Function 1: Extract company initials from company name
CREATE OR REPLACE FUNCTION extract_company_initials(company_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_words TEXT[];
  v_initials TEXT := '';
  v_word TEXT;
  v_char TEXT;
  v_result TEXT := '';
  v_char_count INTEGER := 0;
BEGIN
  -- Return empty if input is null or empty
  IF company_name IS NULL OR trim(company_name) = '' THEN
    RETURN '';
  END IF;

  -- Remove extra spaces and split by space
  v_words := string_to_array(trim(regexp_replace(company_name, '\s+', ' ', 'g')), ' ');

  -- If multiple words (2 or more)
  IF array_length(v_words, 1) >= 2 THEN
    -- Take first letter of each word
    FOREACH v_word IN ARRAY v_words LOOP
      IF v_char_count >= 4 THEN
        EXIT; -- Limit to 4 characters
      END IF;
      
      -- Get first character, convert to uppercase
      v_char := upper(substring(trim(v_word) from 1 for 1));
      
      -- Only add if it's alphanumeric
      IF v_char ~ '[A-Z0-9]' THEN
        v_result := v_result || v_char;
        v_char_count := v_char_count + 1;
      END IF;
    END LOOP;
  ELSE
    -- Single word: take first 3-4 characters
    v_word := trim(v_words[1]);
    
    -- Take up to 4 characters, keeping numbers
    FOR i IN 1..least(4, length(v_word)) LOOP
      v_char := upper(substring(v_word from i for 1));
      
      -- Keep alphanumeric characters
      IF v_char ~ '[A-Z0-9]' THEN
        v_result := v_result || v_char;
        v_char_count := v_char_count + 1;
        IF v_char_count >= 4 THEN
          EXIT;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Ensure we have at least 1 character
  IF length(v_result) = 0 THEN
    v_result := upper(substring(company_name from 1 for 1));
    IF v_result !~ '[A-Z0-9]' THEN
      v_result := 'X'; -- Fallback
    END IF;
  END IF;

  -- Limit to 4 characters max
  RETURN substring(v_result from 1 for 4);
END;
$$;

-- Function 2: Get unique company initials (handle conflicts by expanding)
CREATE OR REPLACE FUNCTION get_unique_company_initials(p_company_id UUID, p_company_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_initials TEXT;
  v_initials TEXT;
  v_words TEXT[];
  v_word TEXT;
  v_expanded TEXT;
  v_exists BOOLEAN;
  v_max_attempts INTEGER := 10;
  v_attempt INTEGER := 0;
BEGIN
  -- Extract base initials
  v_base_initials := extract_company_initials(p_company_name);
  
  -- Check if base initials are unique
  SELECT EXISTS(
    SELECT 1 FROM companies 
    WHERE extract_company_initials(company_name) = v_base_initials 
    AND id != p_company_id
  ) INTO v_exists;

  -- If unique, return base initials
  IF NOT v_exists THEN
    RETURN v_base_initials;
  END IF;

  -- If conflict, try to expand initials
  v_words := string_to_array(trim(regexp_replace(p_company_name, '\s+', ' ', 'g')), ' ');
  
  -- Strategy: Use more letters from words
  IF array_length(v_words, 1) >= 2 THEN
    -- Multi-word: Try first 2 letters of first word + first letter of others
    v_expanded := '';
    
    -- First word: take first 2 characters
    v_word := trim(v_words[1]);
    FOR i IN 1..least(2, length(v_word)) LOOP
      IF upper(substring(v_word from i for 1)) ~ '[A-Z0-9]' THEN
        v_expanded := v_expanded || upper(substring(v_word from i for 1));
      END IF;
    END LOOP;
    
    -- Other words: take first letter
    FOR i IN 2..array_length(v_words, 1) LOOP
      IF length(v_expanded) >= 4 THEN
        EXIT;
      END IF;
      v_word := trim(v_words[i]);
      IF length(v_word) > 0 AND upper(substring(v_word from 1 for 1)) ~ '[A-Z0-9]' THEN
        v_expanded := v_expanded || upper(substring(v_word from 1 for 1));
      END IF;
    END LOOP;
    
    -- Limit to 4 characters
    v_expanded := substring(v_expanded from 1 for 4);
    
    -- Check if expanded is unique
    SELECT EXISTS(
      SELECT 1 FROM companies 
      WHERE extract_company_initials(company_name) = v_expanded 
      AND id != p_company_id
    ) INTO v_exists;
    
    IF NOT v_exists AND length(v_expanded) > 0 THEN
      RETURN v_expanded;
    END IF;
  ELSE
    -- Single word: use first 4 characters instead of 3
    v_word := trim(v_words[1]);
    v_expanded := '';
    FOR i IN 1..least(4, length(v_word)) LOOP
      IF upper(substring(v_word from i for 1)) ~ '[A-Z0-9]' THEN
        v_expanded := v_expanded || upper(substring(v_word from i for 1));
        IF length(v_expanded) >= 4 THEN
          EXIT;
        END IF;
      END IF;
    END LOOP;
    
    -- Check if expanded is unique
    SELECT EXISTS(
      SELECT 1 FROM companies 
      WHERE extract_company_initials(company_name) = v_expanded 
      AND id != p_company_id
    ) INTO v_exists;
    
    IF NOT v_exists AND length(v_expanded) > 0 THEN
      RETURN v_expanded;
    END IF;
  END IF;

  -- If still not unique, return base initials (will need manual resolution)
  -- In practice, this should rarely happen with proper expansion
  RETURN v_base_initials;
END;
$$;

-- Function 3: Get next order sequence number for a company in current year
CREATE OR REPLACE FUNCTION get_next_order_sequence(
  p_company_id UUID,
  p_year TEXT,
  p_initials TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_order_number TEXT;
  v_sequence INTEGER := 1; -- Start at 1 (will be padded to 0001)
  v_parts TEXT[];
  v_last_part TEXT;
  v_parsed_seq INTEGER;
  v_pattern TEXT;
BEGIN
  -- Build pattern: ORD-YYYY-INITIALS-%
  v_pattern := 'ORD-' || p_year || '-' || p_initials || '-%';
  
  -- Get the most recent order for this company in current year with matching pattern
  SELECT order_number INTO v_last_order_number
  FROM client_orders 
  WHERE company_id = p_company_id 
  AND order_number LIKE v_pattern
  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  -- If no orders exist, start at 1
  IF v_last_order_number IS NULL THEN
    RETURN 1;
  END IF;

  -- Parse the order number: ORD-YYYY-INITIALS-XXXX
  v_parts := string_to_array(v_last_order_number, '-');
  
  -- Should have 4 parts: ORD, YYYY, INITIALS, SEQUENCE
  IF array_length(v_parts, 1) >= 4 THEN
    v_last_part := v_parts[array_length(v_parts, 1)];
    
    -- Try to parse sequence number
    BEGIN
      v_parsed_seq := v_last_part::INTEGER;
      
      -- Validate it's a reasonable number
      IF v_parsed_seq >= 1 AND v_parsed_seq < 9999 THEN
        v_sequence := v_parsed_seq + 1;
      ELSE
        v_sequence := 1; -- Out of range, start fresh
      END IF;
    EXCEPTION 
      WHEN OTHERS THEN
        -- If parsing fails, start fresh
        v_sequence := 1;
    END;
  ELSE
    -- Invalid format, start fresh
    v_sequence := 1;
  END IF;

  RETURN v_sequence;
END;
$$;

-- Function 4: Main order number generation function
CREATE OR REPLACE FUNCTION generate_order_number(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_name TEXT;
  v_company_initials TEXT;
  v_year TEXT;
  v_sequence INTEGER;
  v_order_number TEXT;
  v_attempts INTEGER := 0;
  v_max_attempts INTEGER := 10;
BEGIN
  -- Validate company_id
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Company ID cannot be NULL';
  END IF;

  -- Get company name
  SELECT company_name INTO v_company_name
  FROM companies
  WHERE id = p_company_id;
  
  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Company not found for ID: %', p_company_id;
  END IF;

  -- Get unique company initials
  v_company_initials := get_unique_company_initials(p_company_id, v_company_name);
  
  IF v_company_initials IS NULL OR length(v_company_initials) = 0 THEN
    RAISE EXCEPTION 'Failed to generate company initials for company: %', v_company_name;
  END IF;

  -- Get current year
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  -- Get next sequence number
  v_sequence := get_next_order_sequence(p_company_id, v_year, v_company_initials);
  
  -- Generate order number with retry logic for uniqueness
  LOOP
    -- Format: ORD-YYYY-INITIALS-0001 (4-digit zero-padded sequence)
    v_order_number := 'ORD-' || v_year || '-' || v_company_initials || '-' || 
                      LPAD(v_sequence::TEXT, 4, '0');
    
    -- Check if this order number already exists
    IF NOT EXISTS (
      SELECT 1 FROM client_orders 
      WHERE order_number = v_order_number
    ) THEN
      -- Unique, return it
      RETURN v_order_number;
    END IF;
    
    -- If exists, increment sequence and try again
    v_sequence := v_sequence + 1;
    v_attempts := v_attempts + 1;
    
    -- Safety: prevent infinite loop
    IF v_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique order number after % attempts for company: %', 
        v_max_attempts, v_company_name;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION extract_company_initials(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unique_company_initials(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_order_sequence(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_order_number(UUID) TO authenticated;
