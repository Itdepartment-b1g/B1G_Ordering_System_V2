--
-- PostgreSQL database dump
--

\restrict sYU3ZuzhA8LUzmVUo5VCq8yGnTGF0VN4ND7Qq2xb4nZecw0D4b9Ol5mbGlxPJe4

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: moddatetime; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;


--
-- Name: EXTENSION moddatetime; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION moddatetime IS 'functions for tracking last modification time';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: admin_approve_stock_request(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_approve_stock_request(p_request_id uuid, p_admin_id uuid, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
  v_available_stock INTEGER;
  v_allocated_price DECIMAL(10,2);
  v_dsp_price DECIMAL(10,2);
  v_rsp_price DECIMAL(10,2);
BEGIN
  -- Get the request
  SELECT * INTO v_request
  FROM stock_requests
  WHERE id = p_request_id AND status = 'approved_by_leader';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not awaiting admin approval');
  END IF;
  
  -- Calculate total quantity
  v_total_quantity := v_request.requested_quantity + COALESCE(v_request.leader_additional_quantity, 0);
  
  -- Check available stock
  v_available_stock := get_available_stock(v_request.variant_id, v_request.company_id);
  
  IF v_available_stock < v_total_quantity THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', format('Insufficient stock. Available: %s, Requested: %s', v_available_stock, v_total_quantity)
    );
  END IF;
  
  -- ========================================================================
  -- LOGIC BRANCHING
  -- ========================================================================
  
  -- CASE A: DIRECT LEADER REQUEST (Agent = Leader)
  -- Immediate Fulfillment
  IF v_request.agent_id = v_request.leader_id THEN
  
    -- 1. Get pricing from main_inventory
    SELECT 
      COALESCE(selling_price, unit_price, 0),
      COALESCE(dsp_price, 0),
      COALESCE(rsp_price, 0)
    INTO v_allocated_price, v_dsp_price, v_rsp_price
    FROM main_inventory 
    WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;

    -- 2. Deduct from MAIN INVENTORY (Physical Stock)
    -- Note: We do NOT touch allocated_stock because we are bypassing the allocation phase
    UPDATE main_inventory
    SET 
      stock = stock - v_total_quantity,
      updated_at = NOW()
    WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;

    -- 3. Add to LEADER INVENTORY
    INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
    VALUES (v_request.company_id, v_request.leader_id, v_request.variant_id, v_total_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
    ON CONFLICT (agent_id, variant_id) 
    DO UPDATE SET 
      stock = agent_inventory.stock + v_total_quantity,
      allocated_price = EXCLUDED.allocated_price,
      dsp_price = EXCLUDED.dsp_price,
      rsp_price = EXCLUDED.rsp_price,
      updated_at = NOW();

    -- 4. Mark Request as FULFILLED
    UPDATE stock_requests 
    SET 
      status = 'fulfilled',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      fulfilled_at = NOW(),
      fulfilled_by = p_admin_id, -- Admin fulfilled it directly
      fulfilled_quantity = v_total_quantity,
      updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Request fulfilled and stock transferred to Leader',
      'total_transferred', v_total_quantity
    );

  -- CASE B: INDIRECT REQUEST (Mobile Agent -> Leader)
  -- Allocation Only (Existing Logic)
  ELSE
  
    -- 1. Update main_inventory: add to allocated_stock
    UPDATE main_inventory 
    SET 
      allocated_stock = COALESCE(allocated_stock, 0) + v_total_quantity,
      updated_at = NOW()
    WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;
    
    -- 2. Update the request status
    UPDATE stock_requests 
    SET 
      status = 'approved_by_admin',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes = COALESCE(p_notes, admin_notes),
      updated_at = NOW()
    WHERE id = p_request_id;
    
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Request approved and stock allocated (pending leader distribution)',
      'total_allocated', v_total_quantity,
      'agent_quantity', v_request.requested_quantity,
      'leader_quantity', COALESCE(v_request.leader_additional_quantity, 0)
    );
    
  END IF;
END;
$$;


--
-- Name: admin_approve_tl_request(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_approve_tl_request(p_request_id uuid, p_approved_quantity integer, p_notes text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_admin_id UUID;
  v_admin_role TEXT;
  v_request RECORD;
  v_available_quantity INTEGER;
  v_source_name TEXT;
  v_requester_name TEXT;
BEGIN
  -- Get admin info
  SELECT id, role INTO v_admin_id, v_admin_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate admin role
  IF v_admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only admins can approve requests'
    );
  END IF;
  
  -- Get request details
  SELECT * INTO v_request
  FROM tl_stock_requests
  WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request not found'
    );
  END IF;
  
  -- Validate request status
  IF v_request.status != 'pending_admin' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending admin approval'
    );
  END IF;
  
  -- Validate approved quantity
  IF p_approved_quantity <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Approved quantity must be greater than 0'
    );
  END IF;
  
  IF p_approved_quantity > v_request.requested_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Approved quantity cannot exceed requested quantity'
    );
  END IF;
  
  -- Check source TL's available stock
  SELECT COALESCE(stock, 0) INTO v_available_quantity
  FROM agent_inventory
  WHERE agent_id = v_request.source_leader_id
  AND variant_id = v_request.variant_id;
  
  IF v_available_quantity IS NULL THEN
    v_available_quantity := 0;
  END IF;
  
  -- Validate sufficient stock
  IF v_available_quantity < p_approved_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient stock',
      'available_quantity', v_available_quantity,
      'approved_quantity', p_approved_quantity
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'pending_source_tl',
    admin_approved_at = NOW(),
    admin_approved_by = v_admin_id,
    admin_approved_quantity = p_approved_quantity,
    admin_notes = p_notes
  WHERE id = p_request_id;
  
  -- Get names for notification
  SELECT full_name INTO v_source_name
  FROM profiles WHERE id = v_request.source_leader_id;
  
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  -- Notify source TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.source_leader_id,
    'stock_request_approved',
    'Stock Request Approved by Admin',
    'Admin approved a stock request from ' || v_requester_name || ' for ' || p_approved_quantity || ' units. Please review and approve.',
    '/inventory/leader-inventory'
  );
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'approved_quantity', p_approved_quantity,
    'available_quantity', v_available_quantity
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: admin_reject_stock_request(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reject_stock_request(p_request_id uuid, p_admin_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Get the request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND status = 'approved_by_leader';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not awaiting admin approval');
  END IF;
  
  -- Update the request status
  UPDATE stock_requests 
  SET 
    status = 'rejected',
    rejected_at = NOW(),
    rejected_by = p_admin_id,
    rejection_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request rejected'
  );
END;
$$;


--
-- Name: admin_reject_tl_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reject_tl_request(p_request_id uuid, p_reason text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_admin_id UUID;
  v_admin_role TEXT;
  v_request RECORD;
  v_requester_name TEXT;
BEGIN
  -- Get admin info
  SELECT id, role INTO v_admin_id, v_admin_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate admin role
  IF v_admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only admins can reject requests'
    );
  END IF;
  
  -- Get request details
  SELECT * INTO v_request
  FROM tl_stock_requests
  WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request not found'
    );
  END IF;
  
  -- Validate request status
  IF v_request.status != 'pending_admin' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending admin approval'
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'admin_rejected',
    rejected_at = NOW(),
    rejected_by = v_admin_id,
    rejection_reason = p_reason
  WHERE id = p_request_id;
  
  -- Get requester name for notification
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  -- Notify requester TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.requester_leader_id,
    'stock_request_rejected',
    'Stock Request Rejected',
    'Your stock request ' || v_request.request_number || ' has been rejected by admin. Reason: ' || p_reason,
    '/inventory/tl-stock-requests'
  );
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: allocate_to_agent(uuid, uuid, integer, numeric, numeric, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_to_agent(p_agent_id uuid, p_variant_id uuid, p_quantity integer, p_allocated_price numeric, p_dsp_price numeric, p_rsp_price numeric, p_performed_by uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id         UUID;
  v_agent_inventory_id UUID;
  v_current_stock      INTEGER;
  v_leader_inventory_id UUID;
  v_leader_stock       INTEGER;
  v_leader_role        TEXT;
BEGIN
  -- Basic validation
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Quantity must be greater than zero'
    );
  END IF;

  -- Get the company_id from the agent's profile
  SELECT company_id
  INTO v_company_id
  FROM profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent not found or has no company'
    );
  END IF;

  -- Get the leader's role (person performing the allocation)
  SELECT role
  INTO v_leader_role
  FROM profiles
  WHERE id = p_performed_by;

  -- If the performer is a team_leader, deduct from their inventory
  -- (Admins/Super_admins can allocate without deduction as they allocate from main_inventory)
  IF v_leader_role = 'team_leader' OR v_leader_role = 'manager' THEN
    -- Get leader's current stock for this variant
    SELECT id, stock
    INTO v_leader_inventory_id, v_leader_stock
    FROM agent_inventory
    WHERE agent_id = p_performed_by
      AND variant_id = p_variant_id
      AND company_id = v_company_id;

    -- Validate leader has enough stock
    IF v_leader_inventory_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'You do not have this product in your inventory'
      );
    END IF;

    IF v_leader_stock < p_quantity THEN
      RETURN json_build_object(
        'success', false,
        'error', CONCAT('Insufficient stock. You have ', v_leader_stock, ' units available, but tried to allocate ', p_quantity, ' units')
      );
    END IF;

    -- Deduct from leader's inventory
    UPDATE agent_inventory
    SET stock = stock - p_quantity,
        updated_at = NOW()
    WHERE id = v_leader_inventory_id;
  END IF;

  -- Look for existing agent_inventory row for this agent + variant
  SELECT id, stock
  INTO v_agent_inventory_id, v_current_stock
  FROM agent_inventory
  WHERE agent_id = p_agent_id
    AND variant_id = p_variant_id
    AND company_id = v_company_id;

  IF v_agent_inventory_id IS NULL THEN
    -- Insert new inventory row for the agent
    INSERT INTO agent_inventory (
      agent_id,
      variant_id,
      company_id,
      stock,
      allocated_price,
      dsp_price,
      rsp_price
    ) VALUES (
      p_agent_id,
      p_variant_id,
      v_company_id,
      p_quantity,
      p_allocated_price,
      p_dsp_price,
      p_rsp_price
    )
    RETURNING id INTO v_agent_inventory_id;
  ELSE
    -- Update existing row: increase stock, refresh pricing
    UPDATE agent_inventory
    SET stock          = stock + p_quantity,
        allocated_price = p_allocated_price,
        dsp_price       = COALESCE(p_dsp_price, dsp_price),
        rsp_price       = COALESCE(p_rsp_price, rsp_price),
        updated_at      = NOW()
    WHERE id = v_agent_inventory_id;
  END IF;

  -- Log inventory transaction for audit trail
  INSERT INTO inventory_transactions (
    company_id,
    variant_id,
    transaction_type,
    quantity,
    from_location,
    to_location,
    performed_by,
    notes
  ) VALUES (
    v_company_id,
    p_variant_id,
    'allocated_to_agent',
    p_quantity,
    'leader_inventory',
    CONCAT('agent_inventory:', p_agent_id),
    p_performed_by,
    CONCAT('Allocated ', p_quantity, ' units to agent ', p_agent_id,
           ' at price ₱', COALESCE(p_allocated_price::TEXT, '0'),
           CASE WHEN p_dsp_price IS NOT NULL THEN CONCAT(', DSP ₱', p_dsp_price::TEXT) ELSE '' END,
           CASE WHEN p_rsp_price IS NOT NULL THEN CONCAT(', RSP ₱', p_rsp_price::TEXT) ELSE '' END)
  );

  -- Return success payload
  RETURN json_build_object(
    'success', true,
    'message', CASE 
      WHEN v_leader_role = 'team_leader' OR v_leader_role = 'manager' 
      THEN CONCAT('Stock allocated successfully. ', p_quantity, ' units deducted from your inventory')
      ELSE 'Stock allocated to agent successfully'
    END,
    'data', json_build_object(
      'agent_id', p_agent_id,
      'variant_id', p_variant_id,
      'quantity', p_quantity,
      'leader_stock_deducted', CASE WHEN v_leader_role IN ('team_leader', 'manager') THEN true ELSE false END
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: allocate_to_leader(uuid, uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_to_leader(p_leader_id uuid, p_variant_id uuid, p_quantity integer, p_performed_by uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_main_inventory_id UUID;
  v_total_stock INTEGER;
  v_allocated_stock INTEGER;
  v_available_stock INTEGER;
  v_unit_price NUMERIC;
  v_selling_price NUMERIC;
  v_dsp_price NUMERIC;
  v_rsp_price NUMERIC;
  v_company_id UUID;
  v_agent_inventory_id UUID;
BEGIN
  -- Get the company_id from the leader's profile
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = p_leader_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Leader not found or has no company');
  END IF;

  -- Get total stock, allocated, and prices from main_inventory
  -- We now use the allocated_stock column directly
  SELECT id, stock, COALESCE(allocated_stock, 0), unit_price, selling_price, dsp_price, rsp_price 
  INTO v_main_inventory_id, v_total_stock, v_allocated_stock, v_unit_price, v_selling_price, v_dsp_price, v_rsp_price
  FROM main_inventory
  WHERE variant_id = p_variant_id
    AND company_id = v_company_id;

  -- Check if inventory exists
  IF v_main_inventory_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Variant not found in main inventory');
  END IF;

  -- Calculate available stock (Total - Allocated)
  v_available_stock := v_total_stock - v_allocated_stock;

  -- Check if enough available stock
  IF v_available_stock < p_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', CONCAT('Insufficient available stock. Available: ', v_available_stock, ', Requested: ', p_quantity)
    );
  END IF;

  -- Update main_inventory: Increase allocated_stock (Persistent Allocation)
  UPDATE main_inventory
  SET allocated_stock = v_allocated_stock + p_quantity,
      updated_at = NOW()
  WHERE id = v_main_inventory_id;
  
  -- Re-fetch new values for response
  v_allocated_stock := v_allocated_stock + p_quantity;
  v_available_stock := v_total_stock - v_allocated_stock;

  -- Check if leader already has this variant in agent_inventory
  SELECT id INTO v_agent_inventory_id
  FROM agent_inventory
  WHERE agent_id = p_leader_id
    AND variant_id = p_variant_id
    AND company_id = v_company_id;

  IF v_agent_inventory_id IS NULL THEN
    -- Insert new record
    INSERT INTO agent_inventory (
      agent_id, variant_id, company_id, stock, allocated_price, dsp_price, rsp_price
    ) VALUES (
      p_leader_id, p_variant_id, v_company_id, p_quantity, v_selling_price, v_dsp_price, v_rsp_price
    )
    RETURNING id INTO v_agent_inventory_id;
  ELSE
    -- Update existing record
    UPDATE agent_inventory
    SET stock = stock + p_quantity,
        allocated_price = v_selling_price,
        dsp_price = v_dsp_price,
        rsp_price = v_rsp_price,
        updated_at = NOW()
    WHERE id = v_agent_inventory_id;
  END IF;

  -- Create transaction record
  INSERT INTO inventory_transactions (
    company_id, variant_id, transaction_type, quantity, from_location, to_location, performed_by, notes
  ) VALUES (
    v_company_id, p_variant_id, 'allocated_to_agent', p_quantity, 'main_inventory', CONCAT('agent_inventory:', p_leader_id), p_performed_by,
    CONCAT('Stock allocated to team leader (Persistent) - Total: ', v_total_stock, ', Allocated: ', v_allocated_stock, ', Avail: ', v_available_stock)
  );

  RETURN json_build_object(
    'success', true,
    'allocated_quantity', p_quantity,
    'total_stock', v_total_stock,
    'allocated_stock_after', v_allocated_stock,
    'available_stock_after', v_available_stock
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: approve_client_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_client_order(p_order_id uuid, p_approver_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order_record RECORD;
  v_company_id UUID;
BEGIN
  -- 1. Fetch the order details
  SELECT * INTO v_order_record
  FROM client_orders
  WHERE id = p_order_id;

  IF v_order_record.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_order_record.status = 'approved' THEN
    RETURN json_build_object('success', false, 'message', 'Order is already approved');
  END IF;

  v_company_id := v_order_record.company_id;

  -- 2. Update order status and approval metadata
  UPDATE client_orders
  SET 
    status = 'approved',
    stage = 'admin_approved',
    approved_by = p_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 3. Record financial transaction (Revenue)
  INSERT INTO financial_transactions (
    company_id,
    transaction_date,
    transaction_type,
    amount,
    status,
    description,
    reference_type,
    reference_id,
    agent_id,
    created_by
  ) VALUES (
    v_company_id,
    CURRENT_DATE,
    'revenue',
    v_order_record.total_amount,
    'completed',
    CONCAT('Revenue from approved order #', v_order_record.order_number),
    'order',
    p_order_id,
    v_order_record.agent_id,
    p_approver_id
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'Order approved and revenue recorded'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: approve_order_and_verify_deposit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_order_and_verify_deposit(p_order_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order_payment_method TEXT;
  v_order_payment_mode TEXT;
  v_order_payment_splits JSONB;
  v_deposit_id UUID;
  v_company_id UUID;
  v_has_cash_or_cheque BOOLEAN := FALSE;
BEGIN
  -- 1. Get order details
  SELECT payment_method, payment_mode, payment_splits, deposit_id, company_id
  INTO v_order_payment_method, v_order_payment_mode, v_order_payment_splits, v_deposit_id, v_company_id
  FROM client_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- 2. Determine whether this order has any CASH/CHEQUE component (FULL or SPLIT)
  v_has_cash_or_cheque := (v_order_payment_method = 'CASH' OR v_order_payment_method = 'CHEQUE');

  IF NOT v_has_cash_or_cheque AND v_order_payment_mode = 'SPLIT' AND v_order_payment_splits IS NOT NULL THEN
    v_has_cash_or_cheque := EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_order_payment_splits) AS elem
      WHERE (elem->>'method') = 'CASH' OR (elem->>'method') = 'CHEQUE'
    );
  END IF;

  -- 3. CRITICAL CHECK: Cash/Cheque (FULL or SPLIT) orders require a deposit_id before approval
  IF v_has_cash_or_cheque AND v_deposit_id IS NULL THEN
    RETURN json_build_object(
      'success', false, 
      'message', 'Cash/Cheque orders cannot be approved without a recorded deposit. Please have the team leader record the deposit first.'
    );
  END IF;

  -- 4. Update order status to approved
  UPDATE client_orders
  SET 
    status = 'approved',
    stage = 'admin_approved',
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 5. If order has CASH/CHEQUE component and deposit_id exists, verify the cash_deposit
  IF v_has_cash_or_cheque AND v_deposit_id IS NOT NULL THEN
    -- Update cash/cheque deposit status to verified
    UPDATE cash_deposits
    SET 
      status = 'verified',
      updated_at = NOW()
    WHERE id = v_deposit_id
    AND company_id = v_company_id;

    -- Update related financial transaction to completed
    UPDATE financial_transactions
    SET 
      status = 'completed',
      updated_at = NOW()
    WHERE reference_type = 'cash_deposit'
    AND reference_id = v_deposit_id
    AND company_id = v_company_id;

    RETURN json_build_object(
      'success', true, 
      'message', 'Order approved and deposit verified',
      'payment_method', v_order_payment_method,
      'payment_mode', v_order_payment_mode,
      'deposit_verified', true
    );
  ELSE
    RETURN json_build_object(
      'success', true, 
      'message', 'Order approved',
      'payment_method', v_order_payment_method,
      'payment_mode', v_order_payment_mode,
      'deposit_verified', false
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: approve_purchase_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_purchase_order(po_id uuid, approver_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    po_record RECORD;
    item_record RECORD;
    existing_inventory RECORD;
BEGIN
    -- Get the purchase order details
    SELECT * INTO po_record
    FROM purchase_orders
    WHERE id = po_id;

    -- Check if PO exists
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Purchase order not found'
        );
    END IF;

    -- Check if already approved
    IF po_record.status = 'approved' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Purchase order is already approved'
        );
    END IF;

    -- Check if rejected
    IF po_record.status = 'rejected' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Cannot approve a rejected purchase order'
        );
    END IF;

    -- Update purchase order status
    UPDATE purchase_orders
    SET 
        status = 'approved',
        approved_by = approver_id,
        approved_at = NOW()
    WHERE id = po_id;

    -- Add items to main_inventory
    FOR item_record IN
        SELECT 
            poi.company_id,
            poi.variant_id,
            poi.quantity,
            v.name as variant_name,
            v.variant_type,
            b.name as brand_name
        FROM purchase_order_items poi
        JOIN variants v ON poi.variant_id = v.id
        JOIN brands b ON v.brand_id = b.id
        WHERE poi.purchase_order_id = po_id
    LOOP
        -- Check if variant already exists in main_inventory
        SELECT * INTO existing_inventory
        FROM main_inventory
        WHERE variant_id = item_record.variant_id
        AND company_id = item_record.company_id;

        IF FOUND THEN
            -- Update existing inventory (use 'stock' column)
            UPDATE main_inventory
            SET 
                stock = stock + item_record.quantity,
                updated_at = NOW()
            WHERE variant_id = item_record.variant_id
            AND company_id = item_record.company_id;
        ELSE
            -- Insert new inventory record (use 'stock' column)
            INSERT INTO main_inventory (
                company_id,
                variant_id,
                stock,
                unit_price,
                reorder_level,
                created_at,
                updated_at
            ) VALUES (
                item_record.company_id,
                item_record.variant_id,
                item_record.quantity,
                0, -- default unit_price, can be updated later
                10, -- default reorder_level, can be updated later
                NOW(),
                NOW()
            );
        END IF;

        -- Create inventory transaction record
        INSERT INTO inventory_transactions (
            company_id,
            variant_id,
            transaction_type,
            quantity,
            reference_type,
            reference_id,
            performed_by,
            notes,
            created_at
        ) VALUES (
            item_record.company_id,
            item_record.variant_id,
            'purchase_order_received',
            item_record.quantity,
            'purchase_order',
            po_id,
            approver_id,
            'Purchase order approved: ' || po_record.po_number || ' - ' || 
                item_record.brand_name || ' ' || item_record.variant_name,
            NOW()
        );
    END LOOP;

    -- Return success
    RETURN json_build_object(
        'success', true,
        'po_number', po_record.po_number
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;


--
-- Name: FUNCTION approve_purchase_order(po_id uuid, approver_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.approve_purchase_order(po_id uuid, approver_id uuid) IS 'Approves a purchase order and adds items to main inventory using the stock column. Returns JSON with success status and PO number.';


--
-- Name: approve_stock_request_by_admin(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_stock_request_by_admin(p_request_id uuid, p_admin_id uuid, p_notes text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_req stock_requests%ROWTYPE;
BEGIN
  -- Lock the request
  SELECT * INTO v_req
  FROM stock_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Stock request not found');
  END IF;

  -- Only process leader→admin step
  IF v_req.status <> 'approved_by_leader' THEN
    RETURN json_build_object('success', false, 'message', 'Request is not awaiting admin approval');
  END IF;

  -- Allocate from main_inventory to leader (does NOT touch main stock, just leader agent_inventory)
  PERFORM allocate_to_leader(
    v_req.leader_id,
    v_req.variant_id,
    v_req.requested_quantity,
    p_admin_id
  );

  -- Mark request as approved by admin
  UPDATE stock_requests
  SET status            = 'approved_by_admin',
      admin_approved_at = NOW(),
      admin_approved_by = p_admin_id,
      admin_notes       = COALESCE(p_notes, admin_notes),
      updated_at        = NOW()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Stock request approved and allocated to leader'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: approve_stock_request_by_leader(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_stock_request_by_leader(p_request_id uuid, p_leader_id uuid, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_request RECORD;
  v_leader_inventory RECORD;
  v_allocated_price DECIMAL(10,2);
  v_dsp_price DECIMAL(10,2);
  v_rsp_price DECIMAL(10,2);
BEGIN
  -- Get the original request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_leader_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not pending');
  END IF;

  -- Check Leader's Inventory for this variant
  SELECT * INTO v_leader_inventory
  FROM agent_inventory
  WHERE agent_id = p_leader_id AND variant_id = v_request.variant_id;

  IF v_leader_inventory IS NULL OR v_leader_inventory.stock < v_request.requested_quantity THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Insufficient leader stock availability'
    );
  END IF;

  -- Get pricing from main_inventory for consistency (or could use leader's inventory price)
  SELECT 
    COALESCE(selling_price, unit_price, 0),
    COALESCE(dsp_price, 0),
    COALESCE(rsp_price, 0)
  INTO v_allocated_price, v_dsp_price, v_rsp_price
  FROM main_inventory 
  WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;

  -- 1. Deduct from Leader's Stock
  UPDATE agent_inventory
  SET stock = stock - v_request.requested_quantity,
      updated_at = NOW()
  WHERE id = v_leader_inventory.id;

  -- 2. Add to Agent's Inventory
  INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
  VALUES (v_request.company_id, v_request.agent_id, v_request.variant_id, v_request.requested_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
  ON CONFLICT (agent_id, variant_id) 
  DO UPDATE SET 
    stock = agent_inventory.stock + v_request.requested_quantity,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price,
    updated_at = NOW();

  -- 3. Mark request as Fulfilled (Directly by Leader)
  UPDATE stock_requests 
  SET 
    status = 'fulfilled',
    leader_approved_at = NOW(),
    leader_approved_by = p_leader_id,
    leader_notes = COALESCE(p_notes, leader_notes),
    fulfilled_at = NOW(),
    fulfilled_by = p_leader_id,
    fulfilled_quantity = v_request.requested_quantity,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request approved and distributed from leader stock',
    'distributed_quantity', v_request.requested_quantity
  );
END;
$$;


--
-- Name: assign_agent_to_leader(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_agent_to_leader(p_agent_id uuid, p_leader_id uuid, p_admin_id uuid, p_team_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_company_id UUID;
    v_leader_role TEXT;
    v_agent_role TEXT;
    v_agent_name TEXT;
    v_sub_team_id UUID;
BEGIN
    -- 1. Verify Admin Permissions
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = p_admin_id 
        AND role IN ('admin', 'super_admin') -- Strict restriction: Only Admins
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only Admins can assign agents');
    END IF;

    -- 2. get company_id from admin/manager
    SELECT company_id INTO v_company_id FROM profiles WHERE id = p_admin_id;

    -- 3. Verify IDs and Roles
    SELECT role INTO v_leader_role FROM profiles WHERE id = p_leader_id AND company_id = v_company_id;
    SELECT role, full_name INTO v_agent_role, v_agent_name FROM profiles WHERE id = p_agent_id AND company_id = v_company_id;

    IF v_leader_role IS NULL OR v_agent_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Agent or Leader not found in your company');
    END IF;

    -- 4. Check Hierarchy & Implement Logic
    
    -- Case A: Admin assigning Manager (Creating a Top-Level Team)
    IF v_leader_role IN ('admin', 'super_admin') THEN
        IF v_agent_role != 'manager' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admins can only have Managers assigned directly');
        END IF;
        
        -- Just insert into leader_teams (Manager Team)
        INSERT INTO leader_teams (agent_id, leader_id, company_id, team_name)
        VALUES (p_agent_id, p_leader_id, v_company_id, p_team_name)
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
            leader_id = EXCLUDED.leader_id,
            team_name = COALESCE(EXCLUDED.team_name, leader_teams.team_name),
            updated_at = NOW();

    -- Case B: Manager assigning Team Leader (Creating a Sub-Team)
    ELSIF v_leader_role = 'manager' THEN
        IF v_agent_role != 'team_leader' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Managers can only have Team Leaders assigned directly');
        END IF;

        -- 1. Create/Ensure Sub-Team Exists for this Team Leader
        -- We name it "{TL Name}'s Team" by default
        INSERT INTO sub_teams (name, manager_id, leader_id, company_id)
        VALUES (COALESCE(v_agent_name, 'Team Leader') || '''s Team', p_leader_id, p_agent_id, v_company_id)
        ON CONFLICT (leader_id) DO NOTHING; -- Already exists, skip

        -- 2. Assign TL to Manager in leader_teams
        INSERT INTO leader_teams (agent_id, leader_id, company_id)
        VALUES (p_agent_id, p_leader_id, v_company_id)
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
            leader_id = EXCLUDED.leader_id,
            updated_at = NOW();

    -- Case C: Team Leader assigning Mobile Sales (Populating Sub-Team)
    ELSIF v_leader_role = 'team_leader' THEN
        IF v_agent_role != 'mobile_sales' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Team Leaders can only have Mobile Sales agents assigned');
        END IF;

        -- 1. Find the Sub-Team led by this Team Leader
        SELECT id INTO v_sub_team_id FROM sub_teams WHERE leader_id = p_leader_id LIMIT 1;
        
        IF v_sub_team_id IS NULL THEN
             RETURN jsonb_build_object('success', false, 'error', 'This Team Leader does not have a sub-team initialized yet.');
        END IF;

        -- 2. Assign Agent to Team Leader AND Sub-Team
        INSERT INTO leader_teams (agent_id, leader_id, company_id, sub_team_id)
        VALUES (p_agent_id, p_leader_id, v_company_id, v_sub_team_id)
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
            leader_id = EXCLUDED.leader_id,
            sub_team_id = EXCLUDED.sub_team_id,
            updated_at = NOW();

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid hierarchy assignment');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Agent assigned successfully');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: confirm_cash_deposit(uuid, numeric, text, text, text, date, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_cash_deposit(p_agent_id uuid, p_amount numeric, p_bank_account text, p_reference_number text, p_deposit_slip_url text, p_deposit_date date, p_order_ids uuid[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_company_id UUID;
    v_deposit_id UUID;
    v_user_id UUID;
BEGIN
    -- Get current user context
    v_user_id := auth.uid();
    
    -- Get company_id from user profile
    SELECT company_id INTO v_company_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_company_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'User company not found');
    END IF;

    -- 1. Create Cash Deposit Record
    INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_slip_url,
        deposit_date,
        status
    ) VALUES (
        v_company_id,
        p_agent_id,
        v_user_id,
        p_amount,
        p_bank_account,
        p_reference_number,
        p_deposit_slip_url,
        p_deposit_date,
        'verified' -- Auto-verify for now as leader is creating it
    ) RETURNING id INTO v_deposit_id;

    -- 2. Update Client Orders
    IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
        UPDATE client_orders
        SET 
            deposit_id = v_deposit_id,
            payment_proof_url = p_deposit_slip_url, -- Also link proof to individual orders for visibility
            updated_at = NOW()
        WHERE id = ANY(p_order_ids)
        AND company_id = v_company_id;
    END IF;

    -- 3. Create Financial Transaction (Revenue)
    INSERT INTO financial_transactions (
        company_id,
        transaction_date,
        transaction_type,
        category,
        amount,
        reference_type,
        reference_id,
        agent_id,
        description,
        status,
        created_by
    ) VALUES (
        v_company_id,
        p_deposit_date,
        'revenue',
        'cash_deposit', 
        p_amount,
        'cash_deposit',
        v_deposit_id,
        p_agent_id,
        format('Cash Deposit: %s - Ref: %s - Bank: %s', p_bank_account, p_reference_number, p_bank_account),
        'completed',
        v_user_id
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Cash deposit recorded successfully',
        'deposit_id', v_deposit_id
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: create_client_order_v2(uuid, uuid, jsonb, text, text, text, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_client_order_v2(p_agent_id uuid, p_client_id uuid, p_items jsonb, p_notes text, p_signature_url text, p_payment_method text, p_payment_proof_url text, p_pricing_strategy text, p_order_date date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_company_id UUID;
  v_client_account_type TEXT;
  v_subtotal DECIMAL(10,2) := 0;
  v_total_amount DECIMAL(10,2) := 0;
  v_item RECORD;
  v_supervisor_id UUID;
BEGIN
  -- 1. Get company_id and account_type
  SELECT company_id, account_type INTO v_company_id, v_client_account_type
  FROM clients WHERE id = p_client_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Client not found');
  END IF;

  -- 2. Generate Order Number
  SELECT generate_order_number(v_company_id) INTO v_order_number;

  -- 3. Calculate totals from JSON items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(total_price DECIMAL) LOOP
    v_total_amount := v_total_amount + v_item.total_price;
  END LOOP;
  v_subtotal := v_total_amount; -- Simplification: subtotal = total for now (no tax/discount logic here yet)

  -- 4. Insert Order
  INSERT INTO client_orders (
    company_id, order_number, agent_id, client_id, client_account_type,
    order_date, subtotal, total_amount, status, stage, notes,
    signature_url, payment_method, payment_proof_url, pricing_strategy
  ) VALUES (
    v_company_id, v_order_number, p_agent_id, p_client_id, v_client_account_type,
    p_order_date, v_subtotal, v_total_amount, 'pending', 'finance_pending', p_notes,
    p_signature_url, p_payment_method, p_payment_proof_url, p_pricing_strategy
  ) RETURNING id INTO v_order_id;

  -- 5. Insert Items and Deduct Stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    variant_id UUID, quantity INTEGER, unit_price DECIMAL, 
    selling_price DECIMAL, dsp_price DECIMAL, rsp_price DECIMAL, total_price DECIMAL
  ) LOOP
    
    -- A. Insert Order Item
    INSERT INTO client_order_items (
      company_id, client_order_id, variant_id, quantity, 
      unit_price, selling_price, dsp_price, rsp_price, total_price
    ) VALUES (
      v_company_id, v_order_id, v_item.variant_id, v_item.quantity,
      v_item.unit_price, v_item.selling_price, v_item.dsp_price, v_item.rsp_price, v_item.total_price
    );

    -- B. Deduct Global Stock (main_inventory)
    UPDATE main_inventory
    SET stock = stock - v_item.quantity, updated_at = NOW()
    WHERE variant_id = v_item.variant_id AND company_id = v_company_id;

    -- C. Deduct Agent Stock (agent_inventory)
    UPDATE agent_inventory
    SET stock = stock - v_item.quantity, updated_at = NOW()
    WHERE agent_id = p_agent_id AND variant_id = v_item.variant_id;

    -- D. Deduct Recursive Supervisor Stock
    FOR v_supervisor_id IN (
      WITH RECURSIVE supervisor_chain AS (
        -- Base case: find the direct leader(s) of the agent
        SELECT leader_id
        FROM leader_teams
        WHERE agent_id = p_agent_id
        
        UNION
        
        -- Recursive step: find the leader(s) of the current leaders
        SELECT lt.leader_id
        FROM leader_teams lt
        JOIN supervisor_chain sc ON lt.agent_id = sc.leader_id
      )
      SELECT leader_id FROM supervisor_chain
    ) LOOP
      UPDATE agent_inventory
      SET stock = stock - v_item.quantity, updated_at = NOW()
      WHERE agent_id = v_supervisor_id AND variant_id = v_item.variant_id;
    END LOOP;

  END LOOP;

  RETURN json_build_object(
    'success', true, 
    'message', 'Order created and stock deducted', 
    'data', json_build_object('id', v_order_id, 'order_number', v_order_number)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: create_company_with_super_admin(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_company_with_super_admin(p_company_name text, p_company_email text, p_super_admin_name text, p_super_admin_email text, p_super_admin_password text DEFAULT 'tempPassword123!'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_result JSON;
BEGIN
  -- Step 1: Create company
  INSERT INTO companies (
    company_name,
    company_email,
    super_admin_name,
    super_admin_email,
    role,
    status
  ) VALUES (
    p_company_name,
    p_company_email,
    p_super_admin_name,
    p_super_admin_email,
    'Super Admin',
    'active'
  )
  RETURNING id INTO v_company_id;

  -- Step 2: Create auth user using Supabase Auth extension
  -- Note: This requires the supabase_auth_admin extension or direct access to auth.users
  -- For now, we'll create the profile and let the user be created via signup or admin panel
  -- The actual auth user creation should be done via Edge Function or API route
  
  -- Generate a temporary user ID (this will be replaced when auth user is created)
  -- Actually, we need to create the auth user first, but we can't do that from a regular function
  -- So we'll return the company data and the client should handle auth user creation via Edge Function
  
  -- For now, return success with company ID
  -- The client will need to call an Edge Function to create the auth user
  
  v_result := json_build_object(
    'success', true,
    'company_id', v_company_id,
    'message', 'Company created. Auth user creation requires Edge Function call.'
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback company creation if anything fails
    IF v_company_id IS NOT NULL THEN
      DELETE FROM companies WHERE id = v_company_id;
    END IF;
    
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: FUNCTION create_company_with_super_admin(p_company_name text, p_company_email text, p_super_admin_name text, p_super_admin_email text, p_super_admin_password text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_company_with_super_admin(p_company_name text, p_company_email text, p_super_admin_name text, p_super_admin_email text, p_super_admin_password text) IS 'Creates a company record. Auth user creation must be handled separately via Edge Function.';


--
-- Name: create_user_profile(uuid, text, text, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_user_profile(p_user_id uuid, p_full_name text, p_email text, p_role text, p_phone text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_status text DEFAULT 'active'::text, p_company_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        phone,
        region,
        city,
        status,
        company_id,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_full_name,
        p_email,
        p_role::text,
        p_phone,
        p_region,
        p_city,
        p_status,
        p_company_id,
        now(),
        now()
    );
EXCEPTION
    WHEN unique_violation THEN
        -- Profile already exists, update it instead
        UPDATE public.profiles
        SET
            full_name = p_full_name,
            email = p_email,
            role = p_role::text,
            phone = p_phone,
            region = p_region,
            city = p_city,
            status = p_status,
            company_id = COALESCE(p_company_id, company_id),
            updated_at = now()
        WHERE id = p_user_id;
END;
$$;


--
-- Name: delete_company_cascade(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_company_cascade(p_company_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    profile_ids UUID[];
BEGIN
    -- Verify the user is a system administrator
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'system_administrator'
    ) THEN
        RAISE EXCEPTION 'Only system administrators can delete companies';
    END IF;

    -- Verify the company exists
    IF NOT EXISTS (
        SELECT 1 FROM companies 
        WHERE id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Company not found';
    END IF;

    -- Step 1: Get all profile IDs that belong to this company
    -- These profiles will be deleted when we delete the company, so we need to clean up their assignments first
    SELECT ARRAY_AGG(id) INTO profile_ids
    FROM profiles 
    WHERE company_id = p_company_id;

    -- Step 2: Set assigned_by to NULL for any assignments where assigned_by references profiles that will be deleted
    -- This prevents foreign key violations when profiles are deleted
    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        UPDATE executive_company_assignments 
        SET assigned_by = NULL
        WHERE assigned_by = ANY(profile_ids);
    END IF;

    -- Step 3: Delete all executive_company_assignments for this company
    -- This removes all executive assignments to the company being deleted
    DELETE FROM executive_company_assignments 
    WHERE company_id = p_company_id;
    
    -- Step 4: Delete any assignments where the executive profile belongs to this company
    -- (even if assigned to other companies) - these executives will be deleted with the company
    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        DELETE FROM executive_company_assignments 
        WHERE executive_id = ANY(profile_ids);
    END IF;

    -- Step 5: Handle nullable foreign keys that reference profiles
    -- Set to NULL any nullable fields that reference profiles that will be deleted
    -- This prevents foreign key violations for nullable references
    -- Note: Non-nullable fields will be handled by CASCADE when the company is deleted
    IF profile_ids IS NOT NULL AND array_length(profile_ids, 1) > 0 THEN
        -- Update stock_requests nullable approval/rejection fields (these are nullable)
        UPDATE stock_requests 
        SET leader_approved_by = NULL 
        WHERE leader_approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        UPDATE stock_requests 
        SET admin_approved_by = NULL 
        WHERE admin_approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        UPDATE stock_requests 
        SET fulfilled_by = NULL 
        WHERE fulfilled_by = ANY(profile_ids) AND company_id = p_company_id;
        
        UPDATE stock_requests 
        SET rejected_by = NULL 
        WHERE rejected_by = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Update client_orders nullable approval field
        UPDATE client_orders 
        SET approved_by = NULL 
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Update purchase_orders nullable approval field
        UPDATE purchase_orders 
        SET approved_by = NULL 
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Update financial_transactions nullable agent_id field
        UPDATE financial_transactions 
        SET agent_id = NULL 
        WHERE agent_id = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Update clients nullable approved_by field
        UPDATE clients 
        SET approved_by = NULL 
        WHERE approved_by = ANY(profile_ids) AND company_id = p_company_id;
        
        -- Note: inventory_transactions.performed_by is NOT NULL, so it will be handled by CASCADE
        -- when the company is deleted (all inventory_transactions for the company will be deleted)
    END IF;

    -- Step 6: Now we can safely delete the company
    -- This will CASCADE delete ALL related records across ALL tables:
    --   - profiles (where company_id = p_company_id)
    --   - brands, variant_types, variants, main_inventory, agent_inventory
    --   - suppliers, purchase_orders, purchase_order_items
    --   - clients, client_orders, client_order_items
    --   - remittances_log, inventory_transactions, financial_transactions
    --   - notifications, leader_teams, stock_requests, stock_request_items
    --   - inventory_returns, inventory_return_items
    --   - cash_deposits, events, system_audit_log
    --   - executive_company_assignments (for this company)
    -- 
    -- Note: Executives have company_id = NULL, so they won't be deleted
    --       Their assignments to this company have already been removed in Step 3
    DELETE FROM companies 
    WHERE id = p_company_id;

    -- If we get here, deletion was successful
    -- All data related to this company has been removed from all tables
END;
$$;


--
-- Name: FUNCTION delete_company_cascade(p_company_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.delete_company_cascade(p_company_id uuid) IS 'Safely deletes a company and all related records. Only system administrators can use this function.';


--
-- Name: delete_inventory_variant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_inventory_variant(p_variant_id uuid, p_company_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Ensure the variant belongs to the company (Multi-tenant check)
    IF NOT EXISTS (
        SELECT 1 FROM variants 
        WHERE id = p_variant_id AND company_id = p_company_id
    ) THEN
        RAISE EXCEPTION 'Variant not found or access denied';
    END IF;

    -- 1. Delete Stock Request Items
    DELETE FROM stock_request_items WHERE variant_id = p_variant_id AND company_id = p_company_id;
    
    -- 2. Delete Stock Requests (if empty or specifically for this variant)
    -- In our schema, stock_requests has variant_id at the top level too
    DELETE FROM stock_requests WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 3. Delete Inventory Transactions
    DELETE FROM inventory_transactions WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 4. Delete Client Order Items
    DELETE FROM client_order_items WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 5. Delete Purchase Order Items
    DELETE FROM purchase_order_items WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 6. Delete Agent Inventory
    DELETE FROM agent_inventory WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 7. Delete Main Inventory
    DELETE FROM main_inventory WHERE variant_id = p_variant_id AND company_id = p_company_id;

    -- 8. Finally, delete the variant itself
    DELETE FROM variants WHERE id = p_variant_id AND company_id = p_company_id;
END;
$$;


--
-- Name: extract_company_initials(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.extract_company_initials(company_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
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


--
-- Name: forward_stock_request_with_leader_qty(uuid, uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forward_stock_request_with_leader_qty(p_request_id uuid, p_leader_id uuid, p_leader_additional_quantity integer DEFAULT 0, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
BEGIN
  -- Get the original request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_leader_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not pending');
  END IF;
  
  -- Calculate total quantity
  v_total_quantity := v_request.requested_quantity + COALESCE(p_leader_additional_quantity, 0);
  
  -- Update the request
  UPDATE stock_requests 
  SET 
    status = 'approved_by_leader',
    leader_additional_quantity = COALESCE(p_leader_additional_quantity, 0),
    is_combined_request = (COALESCE(p_leader_additional_quantity, 0) > 0),
    leader_approved_at = NOW(),
    leader_approved_by = p_leader_id,
    leader_notes = COALESCE(p_notes, leader_notes),
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request forwarded to admin',
    'total_quantity', v_total_quantity,
    'agent_quantity', v_request.requested_quantity,
    'leader_quantity', COALESCE(p_leader_additional_quantity, 0)
  );
END;
$$;


--
-- Name: generate_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_order_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    new_num TEXT;
    date_part TEXT := to_char(CURRENT_DATE, 'YYYYMMDD');
    seq_val INTEGER;
BEGIN
    SELECT nextval('order_number_seq') INTO seq_val;
    new_num := 'ORD-' || date_part || '-' || lpad(seq_val::TEXT, 4, '0');
    RETURN new_num;
END;
$$;


--
-- Name: generate_order_number(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_order_number(p_company_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: generate_po_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_po_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    new_num TEXT;
    date_part TEXT := to_char(CURRENT_DATE, 'YYYYMMDD');
    seq_val INTEGER;
BEGIN
    SELECT nextval('po_number_seq') INTO seq_val;
    new_num := 'PO-' || date_part || '-' || lpad(seq_val::TEXT, 4, '0');
    RETURN new_num;
END;
$$;


--
-- Name: get_auth_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auth_company_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- This query runs with the privileges of the function creator (postgres)
    -- It BYPASSES RLS on the profiles table
    RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid());
END;
$$;


--
-- Name: get_auth_super_admin_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auth_super_admin_company_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN (
        SELECT company_id FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
        AND status = 'active'
    );
END;
$$;


--
-- Name: get_auth_user_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auth_user_company_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN (SELECT company_id FROM profiles WHERE id = auth.uid());
END;
$$;


--
-- Name: get_available_stock(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_available_stock(p_variant_id uuid, p_company_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_stock INTEGER;
  v_allocated INTEGER;
BEGIN
  SELECT stock, COALESCE(allocated_stock, 0) 
  INTO v_stock, v_allocated
  FROM main_inventory 
  WHERE variant_id = p_variant_id AND company_id = p_company_id;
  
  RETURN COALESCE(v_stock, 0) - COALESCE(v_allocated, 0);
END;
$$;


--
-- Name: get_executive_company_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_executive_company_ids(exec_id uuid) RETURNS uuid[]
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT ARRAY_AGG(company_id) 
    FROM executive_company_assignments 
    WHERE executive_id = exec_id
$$;


--
-- Name: get_my_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_company_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid());
END;
$$;


--
-- Name: get_my_executive_company_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_executive_company_ids() RETURNS uuid[]
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT ARRAY_AGG(company_id)
    FROM executive_company_assignments
    WHERE executive_id = auth.uid()
$$;


--
-- Name: get_next_order_sequence(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_order_sequence(p_company_id uuid, p_year text, p_initials text) RETURNS integer
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


--
-- Name: get_remittance_signature_url(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_remittance_signature_url(remittance_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    signature_path text;
    signed_url text;
    user_role text;
    user_id uuid;
    is_authorized boolean := false;
    remittance_record record;
BEGIN
    -- Get current user info
    user_id := auth.uid();
    SELECT role INTO user_role FROM profiles WHERE id = user_id;

    -- Get remittance details
    SELECT * INTO remittance_record 
    FROM remittances_log 
    WHERE id = remittance_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Authorization logic
    IF user_role = 'super_admin' OR user_role = 'admin' THEN
        -- Admins can view all signatures
        is_authorized := true;
    ELSIF user_role = 'manager' THEN
        -- Managers can view signatures from their team hierarchy
        -- Check if the agent is in their direct or indirect team
        is_authorized := EXISTS (
            -- Direct reports
            SELECT 1 FROM leader_teams lt
            WHERE lt.leader_id = user_id 
            AND lt.agent_id = remittance_record.agent_id

            UNION

            -- Indirect reports (sub-team)
            SELECT 1 FROM leader_teams lt1
            INNER JOIN leader_teams lt2 ON lt2.leader_id = lt1.agent_id
            WHERE lt1.leader_id = user_id 
            AND lt2.agent_id = remittance_record.agent_id
        );
    ELSIF user_role = 'team_leader' THEN
        -- Team leaders can view signatures from their direct reports
        is_authorized := EXISTS (
            SELECT 1 FROM leader_teams lt
            WHERE lt.leader_id = user_id 
            AND lt.agent_id = remittance_record.agent_id
        );
    ELSIF user_role = 'mobile_sales' OR user_role = 'sales_agent' THEN
        -- Agents can only view their own signatures
        is_authorized := (remittance_record.agent_id = user_id);
    END IF;

    -- If not authorized, return NULL
    IF NOT is_authorized THEN
        RETURN NULL;
    END IF;

    -- Get signature path from remittance
    signature_path := remittance_record.signature_path;

    IF signature_path IS NULL THEN
        RETURN NULL;
    END IF;

    -- Generate signed URL (valid for 1 hour)
    -- Note: This uses Supabase's storage.get_presigned_url which is available in newer versions
    -- If not available, you'll need to use the client-side approach
    SELECT storage.presigned_url('remittance-signatures', signature_path, 3600)
    INTO signed_url;

    RETURN signed_url;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error generating signed URL: %', SQLERRM;
        RETURN NULL;
END;
$$;


--
-- Name: FUNCTION get_remittance_signature_url(remittance_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_remittance_signature_url(remittance_id uuid) IS 'Generates a signed URL for viewing remittance signatures with proper authorization checks';


--
-- Name: get_super_admin_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_super_admin_company_id() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN (
        SELECT company_id FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
        AND status = 'active'
    );
END;
$$;


--
-- Name: get_unique_company_initials(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unique_company_initials(p_company_id uuid, p_company_name text) RETURNS text
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


--
-- Name: handle_user_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_user_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Delete the user from the auth system
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;


--
-- Name: insert_default_payment_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_default_payment_settings() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO company_payment_settings (
        company_id,
        bank_accounts,
        cash_enabled,
        cheque_enabled,
        gcash_enabled,
        bank_transfer_enabled
    )
    VALUES (
        NEW.id,
        '[]'::jsonb,  -- New companies start with empty bank accounts
        TRUE,         -- Cash enabled by default
        TRUE,         -- Cheque enabled by default
        FALSE,        -- GCash disabled by default
        FALSE         -- Bank transfer disabled until configured
    );
    RETURN NEW;
END;
$$;


--
-- Name: insert_default_shop_types(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_default_shop_types() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO shop_types (company_id, type_name, is_default)
    VALUES 
        (NEW.id, 'Vape Shop', TRUE),
        (NEW.id, 'Sari-Sari Store', TRUE),
        (NEW.id, 'Convenience Store', TRUE)
    ON CONFLICT (company_id, type_name) DO NOTHING;
    RETURN NEW;
END;
$$;


--
-- Name: is_admin_or_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_super_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'super_admin')
    );
END;
$$;


--
-- Name: is_auth_admin_or_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_auth_admin_or_super_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'super_admin')
    );
END;
$$;


--
-- Name: is_auth_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_auth_super_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
        AND status = 'active'
    );
END;
$$;


--
-- Name: is_auth_system_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_auth_system_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'system_administrator'
    );
END;
$$;


--
-- Name: is_executive(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_executive() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'executive'
    )
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
        AND status = 'active'
    );
END;
$$;


--
-- Name: is_system_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_system_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND role = 'system_admin'
  );
END;
$$;


--
-- Name: is_system_administrator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_system_administrator() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'system_administrator'
    );
END;
$$;


--
-- Name: leader_accept_and_distribute_stock(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leader_accept_and_distribute_stock(p_request_id uuid, p_leader_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
  v_agent_quantity INTEGER;
  v_leader_quantity INTEGER;
  v_allocated_price DECIMAL(10,2);
  v_dsp_price DECIMAL(10,2);
  v_rsp_price DECIMAL(10,2);
BEGIN
  -- Get the approved request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_leader_id AND status = 'approved_by_admin';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not approved by admin');
  END IF;
  
  -- Calculate quantities
  v_agent_quantity := v_request.requested_quantity;
  v_leader_quantity := COALESCE(v_request.leader_additional_quantity, 0);
  v_total_quantity := v_agent_quantity + v_leader_quantity;
  
  -- Get pricing from main_inventory
  SELECT 
    COALESCE(selling_price, unit_price, 0),
    COALESCE(dsp_price, 0),
    COALESCE(rsp_price, 0)
  INTO v_allocated_price, v_dsp_price, v_rsp_price
  FROM main_inventory 
  WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;
  
  -- IMPORTANT CHANGE: We do NOT reduce main_inventory.stock or allocated_stock.
  -- The stock stays "Allocated" in main_inventory to represent it is no longer available.
  
  -- 2. Add leader's portion to leader's inventory (if any)
  IF v_leader_quantity > 0 THEN
    INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
    VALUES (v_request.company_id, p_leader_id, v_request.variant_id, v_leader_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
    ON CONFLICT (agent_id, variant_id) 
    DO UPDATE SET 
      stock = agent_inventory.stock + v_leader_quantity,
      allocated_price = EXCLUDED.allocated_price,
      dsp_price = EXCLUDED.dsp_price,
      rsp_price = EXCLUDED.rsp_price,
      updated_at = NOW();
  END IF;
  
  -- 3. Add agent's portion to agent's inventory
  INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
  VALUES (v_request.company_id, v_request.agent_id, v_request.variant_id, v_agent_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
  ON CONFLICT (agent_id, variant_id) 
  DO UPDATE SET 
    stock = agent_inventory.stock + v_agent_quantity,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price,
    updated_at = NOW();
  
  -- 4. Mark request as fulfilled
  UPDATE stock_requests 
  SET 
    status = 'fulfilled',
    fulfilled_at = NOW(),
    fulfilled_by = p_leader_id,
    fulfilled_quantity = v_total_quantity,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Stock distributed successfully (Persisted in Allocated)',
    'total_distributed', v_total_quantity,
    'agent_received', v_agent_quantity,
    'leader_received', v_leader_quantity
  );
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: sub_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    manager_id uuid NOT NULL,
    leader_id uuid NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: mobile_sales_ids(public.sub_teams); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mobile_sales_ids(sub_team_row public.sub_teams) RETURNS uuid[]
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(
    ARRAY_AGG(agent_id), 
    '{}'::UUID[]
  )
  FROM leader_teams
  WHERE sub_team_id = sub_team_row.id;
$$;


--
-- Name: mobile_sales_members(public.sub_teams); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mobile_sales_members(sub_team_row public.sub_teams) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', p.id,
        'name', p.full_name,
        'email', p.email,
        'region', p.region,
        'avatar_url', p.avatar_url
      )
    ),
    '[]'::JSONB
  )
  FROM leader_teams lt
  JOIN profiles p ON lt.agent_id = p.id
  WHERE lt.sub_team_id = sub_team_row.id;
$$;


--
-- Name: reject_client_order(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_client_order(p_order_id uuid, p_approver_id uuid, p_reason text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- 1. Validate order
  IF NOT EXISTS (SELECT 1 FROM client_orders WHERE id = p_order_id) THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- 2. Update order status
  UPDATE client_orders
  SET 
    status = 'rejected',
    stage = 'admin_rejected',
    notes = COALESCE(notes, '') || E'\nRejection Reason: ' || COALESCE(p_reason, 'No reason provided'),
    approved_by = p_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'Order rejected successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: reject_purchase_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_purchase_order(po_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    po_record RECORD;
BEGIN
    -- Get the purchase order details
    SELECT * INTO po_record
    FROM purchase_orders
    WHERE id = po_id;

    -- Check if PO exists
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Purchase order not found'
        );
    END IF;

    -- Check if already approved (can't reject an approved PO)
    IF po_record.status = 'approved' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Cannot reject an already approved purchase order'
        );
    END IF;

    -- Check if already rejected
    IF po_record.status = 'rejected' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Purchase order is already rejected'
        );
    END IF;

    -- Update purchase order status to rejected
    UPDATE purchase_orders
    SET 
        status = 'rejected'
    WHERE id = po_id;

    -- Return success
    RETURN json_build_object(
        'success', true,
        'po_number', po_record.po_number
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;


--
-- Name: FUNCTION reject_purchase_order(po_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reject_purchase_order(po_id uuid) IS 'Rejects a purchase order. Returns JSON with success status and PO number.';


--
-- Name: reject_stock_request(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_stock_request(p_request_id uuid, p_rejector_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Get the request and verify it belongs to this leader
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_rejector_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Request not found or not pending'
    );
  END IF;

  -- Update the request status to rejected
  UPDATE stock_requests 
  SET 
    status = 'rejected',
    rejected_at = NOW(),
    rejected_by = p_rejector_id,
    rejection_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Request rejected successfully'
  );
END;
$$;


--
-- Name: FUNCTION reject_stock_request(p_request_id uuid, p_rejector_id uuid, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reject_stock_request(p_request_id uuid, p_rejector_id uuid, p_reason text) IS 'Allows team leaders to reject stock requests from their team members when they cannot fulfill them';


--
-- Name: remit_inventory_to_leader(uuid, uuid, uuid, uuid[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remit_inventory_to_leader(p_agent_id uuid, p_leader_id uuid, p_performed_by uuid, p_order_ids uuid[], p_signature_url text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID;
  v_leader_company_id UUID;
  v_items_remitted INTEGER := 0;
  v_total_units_remitted INTEGER := 0;
  v_orders_count INTEGER := 0;
  v_total_revenue DECIMAL(10,2) := 0;
  v_remittance_id UUID;
  v_item RECORD;
  v_leader_inventory_id UUID;
  
  -- Cash vars
  v_cash_orders UUID[];
  v_cash_total DECIMAL(10,2) := 0;
  v_cash_deposit_id UUID;
  
  -- Cheque vars
  v_cheque_orders UUID[];
  v_cheque_total DECIMAL(10,2) := 0;
  v_cheque_deposit_id UUID;

  v_reference_number TEXT;
BEGIN
  -- 1. Validate Agent and Get Company
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Agent not found');
  END IF;

  -- 2. Validate Leader
  SELECT company_id INTO v_leader_company_id
  FROM profiles
  WHERE id = p_leader_id;

  IF v_leader_company_id IS NULL OR v_leader_company_id != v_company_id THEN
    RETURN json_build_object('success', false, 'message', 'Invalid leader or company mismatch');
  END IF;

  -- 3. UNSOLD INVENTORY - Skiped (Agent keeps stock)
  v_items_remitted := 0;
  v_total_units_remitted := 0;

  -- 4. PROCESS SOLD INVENTORY (Orders)
  IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
    
    -- Calculate orders count
    SELECT COUNT(*)
    INTO v_orders_count
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;

    -- Calculate total_revenue: ONLY cash + cheque portions (for both FULL and SPLIT payments)
    -- For FULL payments: count total_amount only if payment_method is CASH or CHEQUE
    -- For SPLIT payments: sum only cash + cheque amounts from payment_splits
    SELECT COALESCE(SUM(
      CASE 
        -- FULL payment: only count if CASH or CHEQUE
        WHEN payment_mode IS NULL OR payment_mode = 'FULL' THEN
          CASE 
            WHEN payment_method IN ('CASH', 'CHEQUE') THEN total_amount
            ELSE 0
          END
        -- SPLIT payment: sum cash + cheque portions from payment_splits
        WHEN payment_mode = 'SPLIT' THEN
          COALESCE((
            SELECT SUM((split->>'amount')::DECIMAL(10,2))
            FROM jsonb_array_elements(payment_splits) AS split
            WHERE (split->>'method') IN ('CASH', 'CHEQUE')
          ), 0)
        ELSE 0
      END
    ), 0)
    INTO v_total_revenue
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;

    -- ========================================================================
    -- PROCESS CASH ORDERS (including cash portions from split payments)
    -- ========================================================================
    -- Get orders with cash payment (FULL CASH or SPLIT with cash portion)
    WITH cash_order_amounts AS (
      SELECT 
        id,
        CASE 
          -- FULL payment: use total_amount if CASH
          WHEN (payment_mode IS NULL OR payment_mode = 'FULL') AND payment_method = 'CASH' THEN total_amount
          -- SPLIT payment: sum cash portions
          WHEN payment_mode = 'SPLIT' THEN
            COALESCE((
              SELECT SUM((split->>'amount')::DECIMAL(10,2))
              FROM jsonb_array_elements(payment_splits) AS split
              WHERE (split->>'method') = 'CASH'
            ), 0)
          ELSE 0
        END AS cash_amount
      FROM client_orders
      WHERE id = ANY(p_order_ids)
      AND company_id = v_company_id
      AND deposit_id IS NULL
    )
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(cash_amount), 0)
    INTO 
      v_cash_orders,
      v_cash_total
    FROM cash_order_amounts
    WHERE cash_amount > 0;

    -- If there are cash orders, create a CASH deposit
    IF v_cash_orders IS NOT NULL AND array_length(v_cash_orders, 1) > 0 AND v_cash_total > 0 THEN
      -- Generate reference number: REMIT-CASH-{date}-{agent_id first 8 chars}
      v_reference_number := 'REMIT-CASH-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(p_agent_id::text, 1, 8);

      INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status,
        deposit_type -- Set type explicitly
      ) VALUES (
        v_company_id,
        p_agent_id,
        p_performed_by,
        v_cash_total,
        'Cash Remittance',
        v_reference_number,
        CURRENT_DATE,
        'pending_verification',
        'CASH'
      ) RETURNING id INTO v_cash_deposit_id;

      -- Link cash orders to the deposit
      UPDATE client_orders
      SET 
        deposit_id = v_cash_deposit_id,
        updated_at = NOW()
      WHERE id = ANY(v_cash_orders)
      AND company_id = v_company_id;

      -- Financial Transaction for Cash
      INSERT INTO financial_transactions (
        company_id, transaction_date, transaction_type, category, amount, reference_type, reference_id, agent_id, description, status, created_by
      ) VALUES (
        v_company_id, CURRENT_DATE, 'revenue', 'cash_deposit', v_cash_total, 'cash_deposit', v_cash_deposit_id, p_agent_id,
        format('Cash Remittance: %s - %s orders', v_reference_number, array_length(v_cash_orders, 1)),
        'pending', p_performed_by
      );
    END IF;

    -- ========================================================================
    -- PROCESS CHEQUE ORDERS (including cheque portions from split payments)
    -- ========================================================================
    -- Get orders with cheque payment (FULL CHEQUE or SPLIT with cheque portion)
    WITH cheque_order_amounts AS (
      SELECT 
        id,
        CASE 
          -- FULL payment: use total_amount if CHEQUE
          WHEN (payment_mode IS NULL OR payment_mode = 'FULL') AND payment_method = 'CHEQUE' THEN total_amount
          -- SPLIT payment: sum cheque portions
          WHEN payment_mode = 'SPLIT' THEN
            COALESCE((
              SELECT SUM((split->>'amount')::DECIMAL(10,2))
              FROM jsonb_array_elements(payment_splits) AS split
              WHERE (split->>'method') = 'CHEQUE'
            ), 0)
          ELSE 0
        END AS cheque_amount
      FROM client_orders
      WHERE id = ANY(p_order_ids)
      AND company_id = v_company_id
      AND deposit_id IS NULL
    )
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(cheque_amount), 0)
    INTO 
      v_cheque_orders,
      v_cheque_total
    FROM cheque_order_amounts
    WHERE cheque_amount > 0;

    -- If there are cheque orders, create a CHEQUE deposit
    IF v_cheque_orders IS NOT NULL AND array_length(v_cheque_orders, 1) > 0 AND v_cheque_total > 0 THEN
      -- Generate reference number: REMIT-CHQ-{date}-{agent_id first 8 chars}
      v_reference_number := 'REMIT-CHQ-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(p_agent_id::text, 1, 8);

      INSERT INTO cash_deposits (
        company_id,
        agent_id,
        performed_by,
        amount,
        bank_account,
        reference_number,
        deposit_date,
        status,
        deposit_type -- Set type explicitly
      ) VALUES (
        v_company_id,
        p_agent_id,
        p_performed_by,
        v_cheque_total,
        'Cheque Remittance', -- Placeholder
        v_reference_number,
        CURRENT_DATE,
        'pending_verification',
        'CHEQUE'
      ) RETURNING id INTO v_cheque_deposit_id;

      -- Link cheque orders to the deposit
      UPDATE client_orders
      SET 
        deposit_id = v_cheque_deposit_id,
        updated_at = NOW()
      WHERE id = ANY(v_cheque_orders)
      AND company_id = v_company_id;

      -- Financial Transaction for Cheque
      INSERT INTO financial_transactions (
        company_id, transaction_date, transaction_type, category, amount, reference_type, reference_id, agent_id, description, status, created_by
      ) VALUES (
        v_company_id, CURRENT_DATE, 'revenue', 'cash_deposit', v_cheque_total, 'cash_deposit', v_cheque_deposit_id, p_agent_id,
        format('Cheque Remittance: %s - %s orders', v_reference_number, array_length(v_cheque_orders, 1)),
        'pending', p_performed_by
      );
    END IF;


    -- Mark all orders as remitted
    UPDATE client_orders
    SET remitted = TRUE, updated_at = NOW()
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;
    
  END IF;

  -- 5. CREATE REMITTANCE LOG
  INSERT INTO remittances_log (
    company_id, agent_id, leader_id, remittance_date,
    items_remitted, total_units, orders_count, total_revenue,
    order_ids, signature_url, signature_path
  ) VALUES (
    v_company_id, p_agent_id, p_leader_id, CURRENT_DATE,
    v_items_remitted, v_total_units_remitted, v_orders_count, v_total_revenue,
    p_order_ids, p_signature_url, p_signature_path
  ) RETURNING id INTO v_remittance_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'Remittance processed successfully.',
    'remittance_id', v_remittance_id,
    'cash_orders_count', COALESCE(array_length(v_cash_orders, 1), 0),
    'cash_amount', v_cash_total,
    'cheque_orders_count', COALESCE(array_length(v_cheque_orders, 1), 0),
    'cheque_amount', v_cheque_total,
    'total_orders_count', v_orders_count,
    'total_revenue', v_total_revenue
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: remit_inventory_to_leader(uuid, uuid, uuid, uuid[], text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remit_inventory_to_leader(p_agent_id uuid, p_leader_id uuid, p_performed_by uuid, p_order_ids uuid[], p_signature_url text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text, p_bank_order_notes jsonb DEFAULT NULL::jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID;
  v_leader_company_id UUID;
  v_items_remitted INTEGER := 0;
  v_total_units_remitted INTEGER := 0;
  v_orders_count INTEGER := 0;
  v_total_revenue DECIMAL(10,2) := 0;
  v_remittance_id UUID;
  
  -- Cash vars
  v_cash_orders UUID[];
  v_cash_total DECIMAL(10,2) := 0;
  v_cash_deposit_id UUID;
  
  -- Cheque vars (Everything else)
  v_cheque_orders UUID[];
  v_cheque_total DECIMAL(10,2) := 0;
  v_cheque_deposit_id UUID;

  v_reference_number TEXT;
BEGIN
  -- 1. Validate Agent and Get Company
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Agent not found');
  END IF;

  -- 2. Validate Leader
  SELECT company_id INTO v_leader_company_id
  FROM profiles
  WHERE id = p_leader_id;

  IF v_leader_company_id IS NULL OR v_leader_company_id != v_company_id THEN
    RETURN json_build_object('success', false, 'message', 'Invalid leader or company mismatch');
  END IF;

  -- 3. UNSOLD INVENTORY - Skipped
  v_items_remitted := 0;
  v_total_units_remitted := 0;

  -- 4. PROCESS SOLD INVENTORY (Orders)
  IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
    
    -- Calculate generic totals
    SELECT 
      COUNT(*), 
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_orders_count,
      v_total_revenue
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;

    -- ========================================================================
    -- PROCESS CASH ORDERS
    -- ========================================================================
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_cash_orders,
      v_cash_total
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND payment_method = 'CASH'
    AND deposit_id IS NULL;

    IF v_cash_orders IS NOT NULL AND array_length(v_cash_orders, 1) > 0 THEN
      
      v_reference_number := 'REMIT-CASH-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(p_agent_id::text, 1, 8) || '-' || EXTRACT(EPOCH FROM NOW())::TEXT;

      INSERT INTO cash_deposits (
        company_id, agent_id, performed_by, amount, bank_account,
        reference_number, deposit_date, status, deposit_type
      ) VALUES (
        v_company_id, p_agent_id, p_performed_by, v_cash_total, 'Cash Remittance',
        v_reference_number, CURRENT_DATE, 'pending_verification', 'CASH'
      ) RETURNING id INTO v_cash_deposit_id;

      UPDATE client_orders
      SET deposit_id = v_cash_deposit_id, updated_at = NOW()
      WHERE id = ANY(v_cash_orders);

      INSERT INTO financial_transactions (
        company_id, transaction_date, transaction_type, category, amount, reference_type, reference_id, agent_id, description, status, created_by
      ) VALUES (
        v_company_id, CURRENT_DATE, 'revenue', 'cash_deposit', v_cash_total, 'cash_deposit', v_cash_deposit_id, p_agent_id,
        format('Cash Remittance: %s', v_reference_number), 'pending', p_performed_by
      );
    END IF;

    -- ========================================================================
    -- PROCESS CHEQUE ORDERS (ALL OTHER ORDERS)
    -- ========================================================================
    -- NOTE: We intentionally select ANY order that is NOT 'CASH'. 
    -- This acts as a catch-all to ensure nothing is lost.
    SELECT 
      ARRAY_AGG(id),
      COALESCE(SUM(total_amount), 0)
    INTO 
      v_cheque_orders,
      v_cheque_total
    FROM client_orders
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id
    AND (payment_method != 'CASH' OR payment_method IS NULL)
    AND deposit_id IS NULL;

    IF v_cheque_orders IS NOT NULL AND array_length(v_cheque_orders, 1) > 0 THEN
      
      v_reference_number := 'REMIT-CHQ-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(p_agent_id::text, 1, 8) || '-' || EXTRACT(EPOCH FROM NOW())::TEXT;

      INSERT INTO cash_deposits (
        company_id, agent_id, performed_by, amount, bank_account,
        reference_number, deposit_date, status, deposit_type
      ) VALUES (
        v_company_id, p_agent_id, p_performed_by, v_cheque_total, 'Cheque Remittance',
        v_reference_number, CURRENT_DATE, 'pending_verification', 'CHEQUE'
      ) RETURNING id INTO v_cheque_deposit_id;

      UPDATE client_orders
      SET deposit_id = v_cheque_deposit_id, updated_at = NOW()
      WHERE id = ANY(v_cheque_orders);

      INSERT INTO financial_transactions (
        company_id, transaction_date, transaction_type, category, amount, reference_type, reference_id, agent_id, description, status, created_by
      ) VALUES (
        v_company_id, CURRENT_DATE, 'revenue', 'cash_deposit', v_cheque_total, 'cash_deposit', v_cheque_deposit_id, p_agent_id,
        format('Cheque Remittance: %s', v_reference_number), 'pending', p_performed_by
      );
    END IF;

    -- Mark ALL selected orders as remitted
    UPDATE client_orders
    SET remitted = TRUE, updated_at = NOW()
    WHERE id = ANY(p_order_ids)
    AND company_id = v_company_id;
    
  END IF;

  -- 5. CREATE REMITTANCE LOG
  INSERT INTO remittances_log (
    company_id, agent_id, leader_id, remittance_date,
    items_remitted, total_units, orders_count, total_revenue,
    order_ids, signature_url, signature_path
  ) VALUES (
    v_company_id, p_agent_id, p_leader_id, CURRENT_DATE,
    v_items_remitted, v_total_units_remitted, v_orders_count, v_total_revenue,
    p_order_ids, p_signature_url, p_signature_path
  ) RETURNING id INTO v_remittance_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'Remittance processed successfully.',
    'remittance_id', v_remittance_id,
    'cash_deposits_created', (v_cash_deposit_id IS NOT NULL),
    'cheque_deposits_created', (v_cheque_deposit_id IS NOT NULL)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: remove_agent_from_team(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_agent_from_team(p_agent_id uuid, p_admin_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_assignment_id UUID;
  v_leader_id UUID;
  v_company_id UUID;
  v_role TEXT;
BEGIN
  -- 1. Check if agent is assigned to a team
  SELECT id, leader_id, company_id INTO v_assignment_id, v_leader_id, v_company_id
  FROM leader_teams
  WHERE agent_id = p_agent_id;

  IF v_assignment_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agent is not assigned to any team'
    );
  END IF;

  -- 2. Verify Admin/Manager Permissions (Optional strict check, but current logic relies on client-side check + admin_id param presence)
  -- (We can add strict check here if needed, but sticking to core logic for now)

  -- 3. Check role of the agent being removed
  SELECT role INTO v_role FROM profiles WHERE id = p_agent_id;

  -- 4. If Team Leader, delete their Sub-Team
  IF v_role = 'team_leader' THEN
     DELETE FROM sub_teams WHERE leader_id = p_agent_id;
  END IF;

  -- 5. Delete the assignment (Leader Teams)
  DELETE FROM leader_teams
  WHERE id = v_assignment_id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'message', 'Agent successfully removed from team',
    'company_id', v_company_id,
    'leader_id', v_leader_id,
    'agent_id', p_agent_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: requester_tl_receive_stock(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.requester_tl_receive_stock(p_request_id uuid, p_signature_url text, p_signature_path text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_requester_id UUID;
  v_requester_role TEXT;
  v_request RECORD;
  v_source_quantity INTEGER;
  v_requester_quantity INTEGER;
  v_transfer_quantity INTEGER;
  v_source_name TEXT;
  v_requester_name TEXT;
BEGIN
  -- Get requester TL info
  SELECT id, role INTO v_requester_id, v_requester_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate requester is a team leader
  IF v_requester_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can receive stock'
    );
  END IF;
  
  -- Get request details
  SELECT * INTO v_request
  FROM tl_stock_requests
  WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request not found'
    );
  END IF;
  
  -- Validate request status
  IF v_request.status != 'pending_receipt' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending receipt'
    );
  END IF;
  
  -- Validate this is the requester TL
  IF v_request.requester_leader_id != v_requester_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are not the requester for this request'
    );
  END IF;
  
  v_transfer_quantity := v_request.admin_approved_quantity;
  
  -- Get current quantities
  SELECT COALESCE(stock, 0) INTO v_source_quantity
  FROM agent_inventory
  WHERE agent_id = v_request.source_leader_id
  AND variant_id = v_request.variant_id;
  
  SELECT COALESCE(stock, 0) INTO v_requester_quantity
  FROM agent_inventory
  WHERE agent_id = v_requester_id
  AND variant_id = v_request.variant_id;
  
  -- Final validation of source stock
  IF v_source_quantity < v_transfer_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source TL has insufficient stock',
      'available', v_source_quantity,
      'required', v_transfer_quantity
    );
  END IF;
  
  -- Deduct from source TL
  UPDATE agent_inventory
  SET stock = stock - v_transfer_quantity
  WHERE agent_id = v_request.source_leader_id
  AND variant_id = v_request.variant_id;
  
  -- Add to requester TL (insert or update)
  INSERT INTO agent_inventory (agent_id, variant_id, stock, company_id, allocated_price, dsp_price, rsp_price)
  SELECT 
    v_requester_id,
    v_request.variant_id,
    v_transfer_quantity,
    v_request.company_id,
    COALESCE(source.allocated_price, 0),
    COALESCE(source.dsp_price, 0),
    COALESCE(source.rsp_price, 0)
  FROM agent_inventory source
  WHERE source.agent_id = v_request.source_leader_id
  AND source.variant_id = v_request.variant_id
  ON CONFLICT (agent_id, variant_id)
  DO UPDATE SET 
    stock = agent_inventory.stock + v_transfer_quantity,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price;
  
  -- Update request to completed
  UPDATE tl_stock_requests
  SET 
    status = 'completed',
    received_at = NOW(),
    received_by = v_requester_id,
    received_quantity = v_transfer_quantity,
    received_signature_url = p_signature_url,
    received_signature_path = p_signature_path
  WHERE id = p_request_id;
  
  -- Get names for notifications
  SELECT full_name INTO v_source_name
  FROM profiles WHERE id = v_request.source_leader_id;
  
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_requester_id;
  
  -- Notify source TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.source_leader_id,
    'stock_transfer_completed',
    'Stock Transfer Completed',
    v_requester_name || ' has received ' || v_transfer_quantity || ' units from stock request ' || v_request.request_number,
    '/inventory/leader-inventory'
  );
  
  -- Notify admins
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  SELECT 
    v_request.company_id,
    profiles.id,
    'stock_transfer_completed',
    'TL Stock Transfer Completed',
    'Stock request ' || v_request.request_number || ' completed: ' || v_transfer_quantity || ' units transferred from ' || v_source_name || ' to ' || v_requester_name,
    '/inventory/admin-tl-requests'
  FROM profiles
  WHERE company_id = v_request.company_id
  AND role IN ('admin', 'super_admin')
  AND status = 'active';
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'transferred_quantity', v_transfer_quantity
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: return_inventory_to_leader(uuid, uuid, text, text, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.return_inventory_to_leader(p_agent_id uuid, p_receiver_id uuid, p_return_type text, p_return_reason text, p_reason_notes text, p_items jsonb, p_signature_url text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID;
  v_return_id UUID;
  v_item JSONB;
  v_variant_id UUID;
  v_quantity INTEGER;
  v_agent_stock INTEGER;
  v_allocated_price NUMERIC(10,2);
  v_dsp_price NUMERIC(10,2);
  v_rsp_price NUMERIC(10,2);
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
BEGIN
  -- 1. Validate agent and get company
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = p_agent_id;
  
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Agent not found');
  END IF;

  -- 2. Validate receiver belongs to same company
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_receiver_id 
    AND company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Invalid receiver or company mismatch');
  END IF;

  -- 3. Validate return type
  IF p_return_type NOT IN ('full', 'partial') THEN
    RETURN json_build_object('success', false, 'message', 'Invalid return type');
  END IF;

  -- 4. Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No items specified for return');
  END IF;

  -- 5. Create return record
  INSERT INTO inventory_returns (
    company_id, agent_id, receiver_id, return_type,
    return_reason, reason_notes, signature_url, signature_path
  ) VALUES (
    v_company_id, p_agent_id, p_receiver_id, p_return_type,
    p_return_reason, p_reason_notes, p_signature_url, p_signature_path
  ) RETURNING id INTO v_return_id;

  -- 6. Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    -- Validate quantity
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity % for variant %', v_quantity, v_variant_id;
    END IF;

    -- Get agent's current stock and pricing
    SELECT stock, allocated_price, dsp_price, rsp_price
    INTO v_agent_stock, v_allocated_price, v_dsp_price, v_rsp_price
    FROM agent_inventory
    WHERE agent_id = p_agent_id 
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    -- Validate sufficient stock
    IF v_agent_stock IS NULL THEN
      RAISE EXCEPTION 'Variant % not found in agent inventory', v_variant_id;
    END IF;

    IF v_agent_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant %. Available: %, Requested: %', 
        v_variant_id, v_agent_stock, v_quantity;
    END IF;

    -- Deduct from agent's inventory
    UPDATE agent_inventory
    SET stock = stock - v_quantity, 
        updated_at = NOW()
    WHERE agent_id = p_agent_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    -- Add to receiver's inventory (check if exists first, then update or insert)
    -- This approach works with or without the unique constraint
    IF EXISTS (
      SELECT 1 FROM agent_inventory 
      WHERE agent_id = p_receiver_id 
        AND variant_id = v_variant_id 
        AND company_id = v_company_id
    ) THEN
      -- Update existing record
      UPDATE agent_inventory
      SET 
        stock = stock + v_quantity,
        updated_at = NOW()
      WHERE agent_id = p_receiver_id
        AND variant_id = v_variant_id
        AND company_id = v_company_id;
    ELSE
      -- Insert new record
      INSERT INTO agent_inventory (
        agent_id, variant_id, company_id, stock, 
        allocated_price, dsp_price, rsp_price, updated_at
      ) VALUES (
        p_receiver_id, v_variant_id, v_company_id, v_quantity,
        v_allocated_price, v_dsp_price, v_rsp_price, NOW()
      );
    END IF;

    -- Log return item
    INSERT INTO inventory_return_items (
      return_id, variant_id, quantity, allocated_price
    ) VALUES (
      v_return_id, v_variant_id, v_quantity, v_allocated_price
    );

    -- Log inventory transaction
    INSERT INTO inventory_transactions (
      company_id,
      variant_id,
      transaction_type,
      quantity,
      from_location,
      to_location,
      performed_by,
      notes
    ) VALUES (
      v_company_id,
      v_variant_id,
      'return',
      v_quantity,
      CONCAT('agent_inventory:', p_agent_id),
      CONCAT('agent_inventory:', p_receiver_id),
      p_agent_id,
      CONCAT('Returned ', v_quantity, ' units to leader. Reason: ', p_return_reason, CASE WHEN p_reason_notes IS NOT NULL AND p_reason_notes <> '' THEN CONCAT(' - ', p_reason_notes) ELSE '' END)
    );

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  -- 7. Return success with summary
  RETURN json_build_object(
    'success', true,
    'message', 'Inventory returned successfully',
    'return_id', v_return_id,
    'items_returned', v_total_items,
    'total_quantity', v_total_quantity,
    'return_type', p_return_type
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false, 
      'message', SQLERRM
    );
END;
$$;


--
-- Name: return_inventory_to_main(uuid, jsonb, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.return_inventory_to_main(p_leader_id uuid, p_items jsonb, p_performed_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_signature_url text DEFAULT NULL::text, p_signature_path text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID;
  v_item JSONB;
  v_variant_id UUID;
  v_quantity INTEGER;
  v_leader_stock INTEGER;
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
  v_performer UUID;
BEGIN
  v_performer := COALESCE(p_performed_by, p_leader_id);

  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = p_leader_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Leader not found');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No items specified');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Invalid quantity for variant ' || v_variant_id);
    END IF;

    SELECT stock INTO v_leader_stock
    FROM agent_inventory
    WHERE agent_id = p_leader_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    IF v_leader_stock IS NULL OR v_leader_stock < v_quantity THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Insufficient stock for variant. Leader has: ' || COALESCE(v_leader_stock::TEXT, '0') || ', requested: ' || v_quantity
      );
    END IF;

    UPDATE agent_inventory
    SET stock = stock - v_quantity,
        updated_at = NOW()
    WHERE agent_id = p_leader_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    UPDATE main_inventory
    SET
      allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_quantity),
      updated_at = NOW()
    WHERE variant_id = v_variant_id
      AND company_id = v_company_id;

    INSERT INTO inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      from_location, to_location, performed_by, notes,
      signature_url, signature_path
    ) VALUES (
      v_company_id, v_variant_id, 'return_to_main', v_quantity,
      CONCAT('agent_inventory:', p_leader_id), 'main_inventory',
      v_performer,
      COALESCE(p_reason, 'Leader returned stock to main inventory'),
      p_signature_url, p_signature_path
    );

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Stock returned to main inventory',
    'items_returned', v_total_items,
    'total_quantity', v_total_quantity
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;


--
-- Name: set_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_company_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    IF NEW.company_id IS NULL THEN
        NEW.company_id := get_my_company_id();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: source_tl_approve_request(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.source_tl_approve_request(p_request_id uuid, p_signature_url text, p_signature_path text, p_notes text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_source_id UUID;
  v_source_role TEXT;
  v_request RECORD;
  v_available_quantity INTEGER;
  v_requester_name TEXT;
BEGIN
  -- Get source TL info
  SELECT id, role INTO v_source_id, v_source_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate source is a team leader
  IF v_source_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can approve requests'
    );
  END IF;
  
  -- Get request details
  SELECT * INTO v_request
  FROM tl_stock_requests
  WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request not found'
    );
  END IF;
  
  -- Validate request status
  IF v_request.status != 'pending_source_tl' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending your approval'
    );
  END IF;
  
  -- Validate this is the source TL
  IF v_request.source_leader_id != v_source_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are not the source team leader for this request'
    );
  END IF;
  
  -- Re-validate sufficient stock (in case it changed)
  SELECT COALESCE(stock, 0) INTO v_available_quantity
  FROM agent_inventory
  WHERE agent_id = v_source_id
  AND variant_id = v_request.variant_id;
  
  IF v_available_quantity IS NULL THEN
    v_available_quantity := 0;
  END IF;
  
  IF v_available_quantity < v_request.admin_approved_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient stock',
      'available_quantity', v_available_quantity,
      'required_quantity', v_request.admin_approved_quantity
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'pending_receipt',
    source_tl_approved_at = NOW(),
    source_tl_approved_by = v_source_id,
    source_tl_signature_url = p_signature_url,
    source_tl_signature_path = p_signature_path,
    source_tl_notes = p_notes
  WHERE id = p_request_id;
  
  -- Get requester name for notification
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  -- Notify requester TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.requester_leader_id,
    'stock_ready_for_receipt',
    'Stock Ready for Receipt',
    'Your stock request ' || v_request.request_number || ' has been approved. Please sign to receive.',
    '/inventory/tl-stock-requests'
  );
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: source_tl_reject_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.source_tl_reject_request(p_request_id uuid, p_reason text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_source_id UUID;
  v_source_role TEXT;
  v_request RECORD;
  v_requester_name TEXT;
  v_source_name TEXT;
BEGIN
  -- Get source TL info
  SELECT id, role INTO v_source_id, v_source_role
  FROM profiles
  WHERE id = auth.uid();
  
  -- Validate source is a team leader
  IF v_source_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can reject requests'
    );
  END IF;
  
  -- Get request details
  SELECT * INTO v_request
  FROM tl_stock_requests
  WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request not found'
    );
  END IF;
  
  -- Validate request status
  IF v_request.status != 'pending_source_tl' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Request is not pending your approval'
    );
  END IF;
  
  -- Validate this is the source TL
  IF v_request.source_leader_id != v_source_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are not the source team leader for this request'
    );
  END IF;
  
  -- Update request
  UPDATE tl_stock_requests
  SET 
    status = 'source_tl_rejected',
    rejected_at = NOW(),
    rejected_by = v_source_id,
    rejection_reason = p_reason
  WHERE id = p_request_id;
  
  -- Get names for notifications
  SELECT full_name INTO v_requester_name
  FROM profiles WHERE id = v_request.requester_leader_id;
  
  SELECT full_name INTO v_source_name
  FROM profiles WHERE id = v_source_id;
  
  -- Notify requester TL
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  VALUES (
    v_request.company_id,
    v_request.requester_leader_id,
    'stock_request_rejected',
    'Stock Request Rejected',
    v_source_name || ' rejected your stock request ' || v_request.request_number || '. Reason: ' || p_reason,
    '/inventory/tl-stock-requests'
  );
  
  -- Notify admins
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  SELECT 
    v_request.company_id,
    profiles.id,
    'stock_request_rejected',
    'TL Stock Request Rejected',
    v_source_name || ' rejected stock request ' || v_request.request_number || ' from ' || v_requester_name,
    '/inventory/admin-tl-requests'
  FROM profiles
  WHERE company_id = v_request.company_id
  AND role IN ('admin', 'super_admin')
  AND status = 'active';
  
  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: submit_tl_stock_request(uuid, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_tl_stock_request(p_company_id uuid, p_source_leader_id uuid, p_variant_id uuid, p_requested_quantity integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_requester_id UUID;
  v_requester_role TEXT;
  v_source_role TEXT;
  v_request_number TEXT;
  v_request_id UUID;
  v_date_str TEXT;
  v_count INTEGER;
BEGIN
  -- Get requester info
  SELECT id, role INTO v_requester_id, v_requester_role
  FROM profiles
  WHERE id = auth.uid() AND company_id = p_company_id;
  
  -- Validate requester is a team leader
  IF v_requester_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can submit stock requests'
    );
  END IF;
  
  -- Validate source is a team leader
  SELECT role INTO v_source_role
  FROM profiles
  WHERE id = p_source_leader_id AND company_id = p_company_id;
  
  IF v_source_role IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source team leader not found'
    );
  END IF;
  
  IF v_source_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source must be a team leader'
    );
  END IF;
  
  -- Validate requester and source are different
  IF v_requester_id = p_source_leader_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot request from yourself'
    );
  END IF;
  
  -- Generate unique request number
  v_date_str := TO_CHAR(NOW(), 'YYYYMMDD');
  
  -- Get count of requests today for this company
  SELECT COUNT(*) INTO v_count
  FROM tl_stock_requests
  WHERE company_id = p_company_id
  AND created_at::DATE = CURRENT_DATE;
  
  v_request_number := 'TLREQ-' || v_date_str || '-' || LPAD((v_count + 1)::TEXT, 4, '0');
  
  -- Insert request
  INSERT INTO tl_stock_requests (
    company_id,
    request_number,
    requester_leader_id,
    source_leader_id,
    variant_id,
    requested_quantity,
    status
  ) VALUES (
    p_company_id,
    v_request_number,
    v_requester_id,
    p_source_leader_id,
    p_variant_id,
    p_requested_quantity,
    'pending_admin'
  ) RETURNING id INTO v_request_id;
  
  -- Insert notification for admins
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  SELECT 
    p_company_id,
    profiles.id,
    'stock_request',
    'New TL Stock Request',
    'Team Leader ' || (SELECT full_name FROM profiles WHERE id = v_requester_id) || 
    ' requests stock from ' || (SELECT full_name FROM profiles WHERE id = p_source_leader_id),
    '/inventory/admin-tl-requests'
  FROM profiles
  WHERE company_id = p_company_id
  AND role IN ('admin', 'super_admin')
  AND status = 'active';
  
  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: submit_tl_stock_request(uuid, uuid, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_tl_stock_request(p_company_id uuid, p_source_leader_id uuid, p_manager_id uuid, p_variant_id uuid, p_requested_quantity integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_requester_id UUID;
  v_requester_role TEXT;
  v_source_role TEXT;
  v_request_number TEXT;
  v_request_id UUID;
  v_date_str TEXT;
  v_count INTEGER;
BEGIN
  -- Get requester info
  SELECT id, role INTO v_requester_id, v_requester_role
  FROM profiles
  WHERE id = auth.uid() AND company_id = p_company_id;
  
  -- Validate requester is a team leader
  IF v_requester_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only team leaders can submit stock requests'
    );
  END IF;
  
  -- Validate source is a team leader
  SELECT role INTO v_source_role
  FROM profiles
  WHERE id = p_source_leader_id AND company_id = p_company_id;
  
  IF v_source_role IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source team leader not found'
    );
  END IF;
  
  IF v_source_role != 'team_leader' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source must be a team leader'
    );
  END IF;
  
  -- Validate requester and source are different
  IF v_requester_id = p_source_leader_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot request from yourself'
    );
  END IF;
  
  -- Generate unique request number
  v_date_str := TO_CHAR(NOW(), 'YYYYMMDD');
  
  -- Get count of requests today for this company
  SELECT COUNT(*) INTO v_count
  FROM tl_stock_requests
  WHERE company_id = p_company_id
  AND created_at::DATE = CURRENT_DATE;
  
  v_request_number := 'TLREQ-' || v_date_str || '-' || LPAD((v_count + 1)::TEXT, 4, '0');
  
  -- Insert request
  INSERT INTO tl_stock_requests (
    company_id,
    request_number,
    requester_leader_id,
    source_leader_id,
    manager_id,
    variant_id,
    requested_quantity,
    status
  ) VALUES (
    p_company_id,
    v_request_number,
    v_requester_id,
    p_source_leader_id,
    p_manager_id,
    p_variant_id,
    p_requested_quantity,
    'pending_admin'
  ) RETURNING id INTO v_request_id;
  
  -- Insert notification for admins
  INSERT INTO notifications (company_id, user_id, type, title, message, link)
  SELECT 
    p_company_id,
    profiles.id,
    'stock_request',
    'New TL Stock Request',
    'Team Leader ' || (SELECT full_name FROM profiles WHERE id = v_requester_id) || 
    ' requests stock from ' || (SELECT full_name FROM profiles WHERE id = p_source_leader_id),
    '/inventory/admin-tl-requests'
  FROM profiles
  WHERE company_id = p_company_id
  AND role IN ('admin', 'super_admin')
  AND status = 'active';
  
  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


--
-- Name: sync_variant_type_from_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_variant_type_from_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.variant_type_id IS NOT NULL THEN
        SELECT name INTO NEW.variant_type
        FROM variant_types
        WHERE id = NEW.variant_type_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_agent_monthly_targets_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_monthly_targets_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_company_pricing_permissions(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_company_pricing_permissions(p_team_leader_pricing jsonb, p_mobile_sales_pricing jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_user_role TEXT;
    v_updated_company RECORD;
BEGIN
    -- 1. Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Unauthorized: No user session'
        );
    END IF;

    -- 2. Get user's company_id and role
    SELECT company_id, role 
    INTO v_company_id, v_user_role
    FROM profiles 
    WHERE id = v_user_id;

    IF v_company_id IS NULL THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'User does not belong to any company'
        );
    END IF;

    -- 3. Verify user is super_admin or admin
    IF v_user_role NOT IN ('super_admin', 'admin') THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Unauthorized: Only Super Admin or Admin can update pricing permissions'
        );
    END IF;

    -- 4. Validate pricing columns (must be array of valid pricing types)
    IF NOT (
        jsonb_typeof(p_team_leader_pricing) = 'array' AND
        jsonb_typeof(p_mobile_sales_pricing) = 'array' AND
        jsonb_array_length(p_team_leader_pricing) > 0 AND
        jsonb_array_length(p_mobile_sales_pricing) > 0
    ) THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Invalid pricing columns. Must be non-empty arrays.'
        );
    END IF;

    -- 5. Validate that arrays only contain valid pricing column names
    IF NOT (
        p_team_leader_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb AND
        p_mobile_sales_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb
    ) THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Pricing columns must only contain: selling_price, dsp_price, or rsp_price'
        );
    END IF;

    -- 6. Update ONLY the two pricing columns for the user's company
    UPDATE companies
    SET 
        team_leader_allowed_pricing = p_team_leader_pricing,
        mobile_sales_allowed_pricing = p_mobile_sales_pricing,
        updated_at = NOW()
    WHERE id = v_company_id
    RETURNING * INTO v_updated_company;

    -- 7. Return success with updated data
    RETURN json_build_object(
        'success', true,
        'message', 'Pricing permissions updated successfully',
        'data', row_to_json(v_updated_company)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Database error: ' || SQLERRM
        );
END;
$$;


--
-- Name: FUNCTION update_company_pricing_permissions(p_team_leader_pricing jsonb, p_mobile_sales_pricing jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_company_pricing_permissions(p_team_leader_pricing jsonb, p_mobile_sales_pricing jsonb) IS 'Securely updates ONLY the pricing permission columns for super_admin/admin. Cannot modify other company fields.';


--
-- Name: update_payment_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_payment_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_tl_stock_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tl_stock_requests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: delete_leaf_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: agent_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_inventory (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    stock integer DEFAULT 0,
    allocated_price numeric(10,2) DEFAULT 0,
    dsp_price numeric(10,2) DEFAULT 0,
    rsp_price numeric(10,2) DEFAULT 0,
    status text DEFAULT 'available'::text,
    allocated_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_inventory_status_check CHECK ((status = ANY (ARRAY['available'::text, 'low'::text, 'none'::text])))
);


--
-- Name: TABLE agent_inventory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_inventory IS 'Agent-allocated inventory per company';


--
-- Name: agent_monthly_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_monthly_targets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    agent_id uuid NOT NULL,
    target_month date NOT NULL,
    target_clients integer,
    target_revenue numeric(12,2),
    target_qty integer,
    target_orders integer,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE agent_monthly_targets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_monthly_targets IS 'Monthly sales targets for agents (KPI tracking)';


--
-- Name: COLUMN agent_monthly_targets.target_month; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_monthly_targets.target_month IS 'First day of the target month (YYYY-MM-01)';


--
-- Name: COLUMN agent_monthly_targets.target_clients; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_monthly_targets.target_clients IS 'Target number of new clients for the month';


--
-- Name: COLUMN agent_monthly_targets.target_revenue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_monthly_targets.target_revenue IS 'Target revenue amount for the month';


--
-- Name: COLUMN agent_monthly_targets.target_qty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_monthly_targets.target_qty IS 'Target total quantity to sell for the month';


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- Name: TABLE brands; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brands IS 'Product brands per company';


--
-- Name: business_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    action_type text NOT NULL,
    action_category text NOT NULL,
    action_description text NOT NULL,
    user_id uuid,
    user_name text,
    user_email text,
    user_role text,
    affected_user_id uuid,
    affected_user_name text,
    affected_client_id uuid,
    affected_client_name text,
    details jsonb,
    reference_type text,
    reference_id text,
    reference_number text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE business_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.business_audit_log IS 'Business-level audit trail - one entry per business action';


--
-- Name: COLUMN business_audit_log.action_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_audit_log.action_type IS 'Specific business action identifier';


--
-- Name: COLUMN business_audit_log.action_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_audit_log.action_category IS 'High-level category for filtering';


--
-- Name: COLUMN business_audit_log.action_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_audit_log.action_description IS 'Human-readable description of what happened';


--
-- Name: COLUMN business_audit_log.details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_audit_log.details IS 'Flexible JSONB field for action-specific data';


--
-- Name: business_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_operations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid,
    user_id uuid,
    user_email text,
    user_name text,
    user_role text,
    operation_category text NOT NULL,
    operation_type text NOT NULL,
    operation_name text NOT NULL,
    description text NOT NULL,
    page_path text,
    target_type text,
    target_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text,
    error_message text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE business_operations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.business_operations IS 'Logs high-level business operations performed through the application, capturing who did what, when, and with what result. Complementary to system_audit_log which tracks low-level data changes.';


--
-- Name: COLUMN business_operations.operation_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_operations.operation_category IS 'High-level category: order, stock, client, user, finance, purchase_order, team';


--
-- Name: COLUMN business_operations.operation_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_operations.operation_type IS 'Action type: approve, reject, allocate, request, create, update, delete, transfer';


--
-- Name: COLUMN business_operations.operation_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_operations.operation_name IS 'Technical name of the RPC function that was called';


--
-- Name: COLUMN business_operations.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_operations.description IS 'Human-readable description of what happened, built with business context';


--
-- Name: COLUMN business_operations.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_operations.metadata IS 'Additional context as JSON: order numbers, client names, amounts, quantities, etc.';


--
-- Name: COLUMN business_operations.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_operations.status IS 'Operation status: pending (started), success (completed), failed (error occurred)';


--
-- Name: COLUMN business_operations.duration_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_operations.duration_ms IS 'How long the operation took to execute in milliseconds';


--
-- Name: cash_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_deposits (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    performed_by uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    bank_account text NOT NULL,
    reference_number text,
    deposit_slip_url text,
    deposit_date date DEFAULT CURRENT_DATE,
    status text DEFAULT 'pending_verification'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deposit_type text DEFAULT 'CASH'::text,
    notes text,
    CONSTRAINT cash_deposits_status_check CHECK ((status = ANY (ARRAY['pending_verification'::text, 'verified'::text, 'rejected'::text]))),
    CONSTRAINT check_deposit_type CHECK ((deposit_type = ANY (ARRAY['CASH'::text, 'CHEQUE'::text])))
);


--
-- Name: COLUMN cash_deposits.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cash_deposits.notes IS 'Optional notes or remarks recorded by the team leader when submitting a deposit';


--
-- Name: client_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: client_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_order_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    client_order_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    selling_price numeric(10,2) DEFAULT 0,
    dsp_price numeric(10,2) DEFAULT 0,
    rsp_price numeric(10,2) DEFAULT 0,
    total_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE client_order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.client_order_items IS 'Client order line items';


--
-- Name: client_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_orders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    order_number text NOT NULL,
    agent_id uuid NOT NULL,
    client_id uuid NOT NULL,
    client_account_type text NOT NULL,
    order_date date NOT NULL,
    subtotal numeric(10,2) DEFAULT 0,
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(10,2) DEFAULT 0,
    discount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) DEFAULT 0,
    status text DEFAULT 'pending'::text,
    notes text,
    signature_url text,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_method text,
    payment_proof_url text,
    stage text,
    pricing_strategy text DEFAULT 'rsp'::text,
    remitted boolean DEFAULT false NOT NULL,
    deposit_id uuid,
    bank_type text,
    agent_remittance_notes text,
    payment_mode text DEFAULT 'FULL'::text,
    payment_splits jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT client_orders_bank_type_check CHECK ((bank_type = ANY (ARRAY['Unionbank'::text, 'BPI'::text, 'PBCOM'::text]))),
    CONSTRAINT client_orders_client_account_type_check CHECK ((client_account_type = ANY (ARRAY['Key Accounts'::text, 'Standard Accounts'::text]))),
    CONSTRAINT client_orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['GCASH'::text, 'BANK_TRANSFER'::text, 'CASH'::text, 'CHEQUE'::text]))),
    CONSTRAINT client_orders_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['FULL'::text, 'SPLIT'::text]))),
    CONSTRAINT client_orders_pricing_strategy_check CHECK ((pricing_strategy = ANY (ARRAY['rsp'::text, 'dsp'::text, 'special'::text]))),
    CONSTRAINT client_orders_stage_check CHECK ((stage = ANY (ARRAY['agent_pending'::text, 'finance_pending'::text, 'leader_approved'::text, 'admin_approved'::text, 'leader_rejected'::text, 'admin_rejected'::text]))),
    CONSTRAINT client_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: TABLE client_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.client_orders IS 'Client orders per company';


--
-- Name: COLUMN client_orders.stage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.client_orders.stage IS 'Current approval stage of the order: agent_pending, finance_pending, leader_approved, admin_approved, leader_rejected, admin_rejected';


--
-- Name: COLUMN client_orders.pricing_strategy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.client_orders.pricing_strategy IS 'The pricing strategy used for this order (rsp, dsp, or special)';


--
-- Name: COLUMN client_orders.remitted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.client_orders.remitted IS 'Indicates if this order was included in a remittance report (for reporting/tracking only - sold orders are not actually returned)';


--
-- Name: COLUMN client_orders.bank_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.client_orders.bank_type IS 'Bank name used for bank transfer payments. Only populated when payment_method is BANK_TRANSFER.';


--
-- Name: COLUMN client_orders.agent_remittance_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.client_orders.agent_remittance_notes IS 'Agent notes/remarks added during end-of-day remittance, particularly for bank transfer orders';


--
-- Name: COLUMN client_orders.payment_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.client_orders.payment_mode IS 'Payment mode: FULL (current flow, single method) or SPLIT (2-3 methods)';


--
-- Name: COLUMN client_orders.payment_splits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.client_orders.payment_splits IS 'Split payment details: [{method, bank, amount, proof_url}]. Empty for FULL payment.';


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid,
    name text NOT NULL,
    email text,
    phone text,
    company text,
    address text,
    photo_url text,
    photo_timestamp timestamp with time zone,
    location_latitude numeric(10,8),
    location_longitude numeric(11,8),
    location_accuracy numeric(10,2),
    location_captured_at timestamp with time zone,
    total_orders integer DEFAULT 0,
    total_spent numeric(10,2) DEFAULT 0,
    account_type text DEFAULT 'Standard Accounts'::text,
    category text DEFAULT 'Open'::text,
    status text DEFAULT 'active'::text,
    approval_status text DEFAULT 'pending'::text,
    approval_notes text,
    approval_requested_at timestamp with time zone,
    approved_at timestamp with time zone,
    approved_by uuid,
    last_order_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    has_forge boolean DEFAULT false NOT NULL,
    city text,
    cor_url text,
    contact_person text,
    tin text,
    tax_status text DEFAULT 'Tax Exempt'::text,
    brand_ids uuid[] DEFAULT ARRAY[]::uuid[],
    shop_type text,
    inside_store_photo_url text,
    CONSTRAINT clients_account_type_check CHECK ((account_type = ANY (ARRAY['Key Accounts'::text, 'Standard Accounts'::text]))),
    CONSTRAINT clients_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT clients_category_check CHECK ((category = ANY (ARRAY['Permanently Closed'::text, 'Renovating'::text, 'Open'::text]))),
    CONSTRAINT clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: TABLE clients; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.clients IS 'Clients per company';


--
-- Name: COLUMN clients.has_forge; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.has_forge IS 'Indicates whether the client has Forge brand products';


--
-- Name: COLUMN clients.city; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.city IS 'City where the client is located, used for territory assignment';


--
-- Name: COLUMN clients.cor_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.cor_url IS 'URL to Certificate of Registration image (PNG/JPG)';


--
-- Name: COLUMN clients.contact_person; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.contact_person IS 'Contact person name for the client';


--
-- Name: COLUMN clients.tin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.tin IS 'Tax Identification Number of the client';


--
-- Name: COLUMN clients.tax_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.tax_status IS 'Tax status of the client: "Tax on Sales" or "Tax Exempt"';


--
-- Name: COLUMN clients.brand_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.brand_ids IS 'Array of brand IDs that the client is holding. Populated from the brands table based on company_id.';


--
-- Name: COLUMN clients.shop_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.shop_type IS 'Type of shop (e.g., Vape Shop, Sari-Sari Store, Convenience Store, or custom type)';


--
-- Name: COLUMN clients.inside_store_photo_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.inside_store_photo_url IS 'Optional URL to photo taken inside the store at registration (stored in client-photos bucket)';


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_name text NOT NULL,
    company_email text NOT NULL,
    super_admin_name text NOT NULL,
    super_admin_email text NOT NULL,
    role text DEFAULT 'Super Admin'::text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    team_leader_allowed_pricing jsonb DEFAULT '["selling_price", "dsp_price", "rsp_price"]'::jsonb NOT NULL,
    mobile_sales_allowed_pricing jsonb DEFAULT '["rsp_price"]'::jsonb NOT NULL,
    company_account_type text DEFAULT 'Standard Accounts'::text,
    CONSTRAINT check_company_account_type CHECK ((company_account_type = ANY (ARRAY['Key Accounts'::text, 'Standard Accounts'::text]))),
    CONSTRAINT companies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
    CONSTRAINT valid_pricing_columns CHECK ((((team_leader_allowed_pricing IS NULL) OR (team_leader_allowed_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb)) AND ((mobile_sales_allowed_pricing IS NULL) OR (mobile_sales_allowed_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb))))
);


--
-- Name: TABLE companies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.companies IS 'Multi-tenant companies table - root of data segregation';


--
-- Name: COLUMN companies.team_leader_allowed_pricing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.team_leader_allowed_pricing IS 'Array of allowed pricing columns for team leaders when creating orders. Options: selling_price (custom), dsp_price (distributor), rsp_price (retail). Unit price is never included for security.';


--
-- Name: COLUMN companies.mobile_sales_allowed_pricing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.mobile_sales_allowed_pricing IS 'Array of allowed pricing columns for mobile sales when creating orders. Options: selling_price (custom), dsp_price (distributor), rsp_price (retail). Unit price is never included for security. Default is rsp_price only for field sales.';


--
-- Name: company_payment_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_payment_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    bank_accounts jsonb DEFAULT '[]'::jsonb,
    gcash_number text,
    gcash_name text,
    gcash_qr_url text,
    cash_enabled boolean DEFAULT true,
    cheque_enabled boolean DEFAULT true,
    gcash_enabled boolean DEFAULT false,
    bank_transfer_enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE company_payment_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_payment_settings IS 'Company-specific payment configuration including bank accounts, GCash, and payment method toggles';


--
-- Name: COLUMN company_payment_settings.bank_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_payment_settings.bank_accounts IS 'JSONB array of bank configurations with optional QR codes';


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    actor_role text NOT NULL,
    performed_by text NOT NULL,
    actor_label text,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    target_label text,
    details jsonb DEFAULT '{}'::jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_actor_role_check CHECK ((actor_role = ANY (ARRAY['system'::text, 'admin'::text, 'leader'::text, 'sales_agent'::text, 'finance'::text, 'manager'::text])))
);


--
-- Name: TABLE events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.events IS 'Centralized event logging table for audit trail and history tracking';


--
-- Name: COLUMN events.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.company_id IS 'Company isolation - each company has separate events';


--
-- Name: COLUMN events.actor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.actor_id IS 'User who performed the action';


--
-- Name: COLUMN events.actor_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.actor_role IS 'Role of the actor at the time of the event';


--
-- Name: COLUMN events.performed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.performed_by IS 'Human-readable name of the actor (for display)';


--
-- Name: COLUMN events.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.action IS 'Type of action performed (insert, update, delete, approve, etc.)';


--
-- Name: COLUMN events.target_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.target_type IS 'Type of entity affected (client_order, profile, etc.)';


--
-- Name: COLUMN events.target_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.target_id IS 'ID of the affected entity';


--
-- Name: COLUMN events.details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.details IS 'Additional context and metadata in JSON format';


--
-- Name: executive_company_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.executive_company_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    executive_id uuid NOT NULL,
    company_id uuid NOT NULL,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE executive_company_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.executive_company_assignments IS 'Junction table mapping executives to companies they can view';


--
-- Name: financial_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_transactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    transaction_date date NOT NULL,
    transaction_type text NOT NULL,
    category text,
    amount numeric(10,2) NOT NULL,
    reference_type text,
    reference_id uuid,
    agent_id uuid,
    description text,
    status text DEFAULT 'pending'::text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT financial_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT financial_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['revenue'::text, 'expense'::text, 'commission'::text, 'refund'::text])))
);


--
-- Name: TABLE financial_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.financial_transactions IS 'Financial transactions per company';


--
-- Name: inventory_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_return_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    return_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    allocated_price numeric(10,2),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT inventory_return_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: inventory_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_returns (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    return_date timestamp without time zone DEFAULT now() NOT NULL,
    return_type text NOT NULL,
    return_reason text NOT NULL,
    reason_notes text,
    signature_url text,
    signature_path text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT inventory_returns_return_type_check CHECK ((return_type = ANY (ARRAY['full'::text, 'partial'::text])))
);


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    transaction_type text NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    from_location text,
    to_location text,
    reference_type text,
    reference_id uuid,
    performed_by uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    signature_url text,
    signature_path text,
    CONSTRAINT inventory_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['purchase_order_received'::text, 'allocated_to_agent'::text, 'order_fulfilled'::text, 'adjustment'::text, 'return'::text, 'return_to_main'::text])))
);


--
-- Name: TABLE inventory_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_transactions IS 'Inventory transaction history per company';


--
-- Name: leader_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leader_teams (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    leader_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sub_team_id uuid,
    team_name text
);


--
-- Name: TABLE leader_teams; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.leader_teams IS 'Team assignments (leader-agent relationships) per company';


--
-- Name: main_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.main_inventory (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    stock integer DEFAULT 0,
    unit_price numeric(10,2) DEFAULT 0,
    selling_price numeric(10,2) DEFAULT 0,
    dsp_price numeric(10,2) DEFAULT 0,
    rsp_price numeric(10,2) DEFAULT 0,
    reorder_level integer DEFAULT 100,
    status text DEFAULT 'in-stock'::text,
    last_restocked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    allocated_stock integer DEFAULT 0,
    CONSTRAINT main_inventory_status_check CHECK ((status = ANY (ARRAY['in-stock'::text, 'low-stock'::text, 'out-of-stock'::text])))
);


--
-- Name: TABLE main_inventory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.main_inventory IS 'Central inventory per company';


--
-- Name: COLUMN main_inventory.allocated_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.main_inventory.allocated_stock IS 'Stock reserved for approved requests but not yet distributed. Available = stock - allocated_stock';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    notification_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    reference_type text,
    reference_id uuid,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['order_created'::text, 'order_approved'::text, 'order_rejected'::text, 'inventory_low'::text, 'inventory_allocated'::text, 'purchase_order_approved'::text, 'new_client'::text, 'system_message'::text, 'stock_request_created'::text, 'stock_request_approved'::text, 'stock_request_rejected'::text])))
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'User notifications per company';


--
-- Name: order_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: po_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.po_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    company_id uuid,
    email text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    phone text,
    region text,
    address text,
    city text,
    country text,
    status text DEFAULT 'active'::text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['system_administrator'::text, 'super_admin'::text, 'admin'::text, 'finance'::text, 'manager'::text, 'team_leader'::text, 'mobile_sales'::text, 'executive'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'User profiles linked to companies for multi-tenant isolation';


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE purchase_order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.purchase_order_items IS 'Purchase order line items';


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    po_number text NOT NULL,
    supplier_id uuid NOT NULL,
    order_date date NOT NULL,
    expected_delivery_date date,
    subtotal numeric(10,2) DEFAULT 0,
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(10,2) DEFAULT 0,
    discount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) DEFAULT 0,
    status text DEFAULT 'pending'::text,
    notes text,
    created_by uuid NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'delivered'::text])))
);


--
-- Name: TABLE purchase_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.purchase_orders IS 'Purchase orders per company';


--
-- Name: remittances_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remittances_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    leader_id uuid NOT NULL,
    remittance_date date NOT NULL,
    remitted_at timestamp with time zone DEFAULT now(),
    items_remitted integer DEFAULT 0,
    total_units integer DEFAULT 0,
    orders_count integer DEFAULT 0,
    total_revenue numeric(10,2) DEFAULT 0,
    order_ids uuid[] DEFAULT ARRAY[]::uuid[],
    signature_url text,
    signature_path text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE remittances_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.remittances_log IS 'Log of stock remittances from agents to leaders';


--
-- Name: shop_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    type_name text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: TABLE shop_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shop_types IS 'Stores shop type categories for clients, including default and custom types per company';


--
-- Name: stock_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_request_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    stock_request_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    requested_quantity integer NOT NULL,
    fulfilled_quantity integer DEFAULT 0,
    unit_price numeric(10,2),
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE stock_request_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_request_items IS 'Stock request line items';


--
-- Name: stock_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    request_number text NOT NULL,
    agent_id uuid NOT NULL,
    leader_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    requested_quantity integer NOT NULL,
    requested_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    leader_approved_at timestamp with time zone,
    leader_approved_by uuid,
    leader_notes text,
    admin_approved_at timestamp with time zone,
    admin_approved_by uuid,
    admin_notes text,
    fulfilled_at timestamp with time zone,
    fulfilled_by uuid,
    fulfilled_quantity integer,
    rejected_at timestamp with time zone,
    rejected_by uuid,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    leader_additional_quantity integer DEFAULT 0,
    is_combined_request boolean DEFAULT false,
    CONSTRAINT stock_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved_by_leader'::text, 'approved_by_admin'::text, 'rejected'::text, 'fulfilled'::text])))
);


--
-- Name: TABLE stock_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_requests IS 'Stock requests per company';


--
-- Name: COLUMN stock_requests.leader_additional_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_requests.leader_additional_quantity IS 'Additional quantity the team leader requests for themselves when forwarding agent request to admin';


--
-- Name: COLUMN stock_requests.is_combined_request; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_requests.is_combined_request IS 'True if this request includes leader additional quantity (combined agent + leader request)';


--
-- Name: sub_teams_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.sub_teams_overview WITH (security_invoker='on') AS
 SELECT st.id,
    st.name AS team_name,
    st.leader_id,
    l.full_name AS leader_name,
    st.manager_id,
    m.full_name AS manager_name,
    st.company_id,
    public.mobile_sales_ids(st.*) AS member_ids,
    public.mobile_sales_members(st.*) AS members_details,
    st.created_at,
    st.updated_at
   FROM ((public.sub_teams st
     LEFT JOIN public.profiles l ON ((st.leader_id = l.id)))
     LEFT JOIN public.profiles m ON ((st.manager_id = m.id)));


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    company_name text NOT NULL,
    contact_person text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    address text NOT NULL,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT suppliers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: TABLE suppliers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.suppliers IS 'Suppliers per company';


--
-- Name: system_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    table_name text NOT NULL,
    operation text NOT NULL,
    record_id text NOT NULL,
    user_id uuid,
    user_email text,
    user_role text,
    old_data jsonb,
    new_data jsonb,
    changed_fields text[],
    description text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    user_name text,
    CONSTRAINT system_audit_log_operation_check CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: TABLE system_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_audit_log IS 'Comprehensive audit trail with realtime subscriptions enabled';


--
-- Name: COLUMN system_audit_log.table_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_audit_log.table_name IS 'Name of the table that was modified';


--
-- Name: COLUMN system_audit_log.operation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_audit_log.operation IS 'Type of operation: INSERT, UPDATE, or DELETE';


--
-- Name: COLUMN system_audit_log.record_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_audit_log.record_id IS 'ID of the record that was modified';


--
-- Name: COLUMN system_audit_log.old_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_audit_log.old_data IS 'Complete record data before the change (for UPDATE and DELETE)';


--
-- Name: COLUMN system_audit_log.new_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_audit_log.new_data IS 'Complete record data after the change (for INSERT and UPDATE)';


--
-- Name: COLUMN system_audit_log.changed_fields; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_audit_log.changed_fields IS 'Array of field names that were modified (for UPDATE operations)';


--
-- Name: COLUMN system_audit_log.user_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_audit_log.user_name IS 'Full name of the user who performed the action';


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    agent_id uuid NOT NULL,
    leader_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text,
    priority text DEFAULT 'medium'::text,
    due_date timestamp with time zone,
    "time" text,
    notes text,
    attachment_url text,
    given_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    client_id uuid,
    location_latitude double precision,
    location_longitude double precision,
    location_address text,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: task_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_details AS
 SELECT t.id,
    t.leader_id,
    l.full_name AS leader_name,
    l.email AS leader_email,
    t.agent_id,
    a.full_name AS agent_name,
    a.email AS agent_email,
    t.client_id,
    c.name AS client_name,
    c.company AS client_company,
    c.location_latitude AS client_latitude,
    c.location_longitude AS client_longitude,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.created_at,
    t.given_at,
    t.completed_at,
    t.due_date,
    t."time",
    t.notes,
    t.attachment_url,
    t.location_latitude,
    t.location_longitude,
    t.location_address,
        CASE
            WHEN (t.status = 'completed'::text) THEN 'on_time'::text
            WHEN ((t.due_date < now()) AND (t.status <> 'completed'::text)) THEN 'overdue'::text
            WHEN ((t.due_date < (now() + '1 day'::interval)) AND (t.status <> 'completed'::text)) THEN 'due_soon'::text
            ELSE 'on_time'::text
        END AS urgency_status,
    t.company_id
   FROM (((public.tasks t
     LEFT JOIN public.profiles l ON ((t.leader_id = l.id)))
     LEFT JOIN public.profiles a ON ((t.agent_id = a.id)))
     LEFT JOIN public.clients c ON ((t.client_id = c.id)));


--
-- Name: tl_stock_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tl_stock_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    request_number text NOT NULL,
    requester_leader_id uuid NOT NULL,
    source_leader_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    requested_quantity integer NOT NULL,
    status text DEFAULT 'pending_admin'::text NOT NULL,
    admin_approved_at timestamp with time zone,
    admin_approved_by uuid,
    admin_approved_quantity integer,
    admin_notes text,
    source_tl_approved_at timestamp with time zone,
    source_tl_approved_by uuid,
    source_tl_signature_url text,
    source_tl_signature_path text,
    source_tl_notes text,
    received_at timestamp with time zone,
    received_by uuid,
    received_quantity integer,
    received_signature_url text,
    received_signature_path text,
    rejected_at timestamp with time zone,
    rejected_by uuid,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT different_team_leaders CHECK ((requester_leader_id <> source_leader_id)),
    CONSTRAINT tl_stock_requests_requested_quantity_check CHECK ((requested_quantity > 0)),
    CONSTRAINT tl_stock_requests_status_check CHECK ((status = ANY (ARRAY['pending_admin'::text, 'admin_approved'::text, 'admin_rejected'::text, 'pending_source_tl'::text, 'source_tl_approved'::text, 'source_tl_rejected'::text, 'pending_receipt'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: variant_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    description text,
    color_code text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE variant_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.variant_types IS 'Variant types per company - allows dynamic type management';


--
-- Name: variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    brand_id uuid,
    name text NOT NULL,
    variant_type text NOT NULL,
    description text,
    sku text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    variant_type_id uuid NOT NULL,
    is_active boolean DEFAULT true
);


--
-- Name: TABLE variants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.variants IS 'Product variants (flavors/batteries) per company';


--
-- Name: COLUMN variants.variant_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.variants.variant_type IS 'Legacy variant type string - automatically synced from variant_type_id by trigger';


--
-- Name: visit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    agent_id uuid NOT NULL,
    client_id uuid NOT NULL,
    task_id uuid,
    visited_at timestamp with time zone DEFAULT now(),
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    address text,
    is_within_radius boolean DEFAULT false,
    distance_meters double precision,
    radius_limit_meters double precision DEFAULT 100.0,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_02_26; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_26 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_27; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_27 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_02_28; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_02_28 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_03_01; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_03_01 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_03_02; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_03_02 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_03_03; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_03_03 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_03_04; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_03_04 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_03_05; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_03_05 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_2026_02_26; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_26 FOR VALUES FROM ('2026-02-26 00:00:00') TO ('2026-02-27 00:00:00');


--
-- Name: messages_2026_02_27; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_27 FOR VALUES FROM ('2026-02-27 00:00:00') TO ('2026-02-28 00:00:00');


--
-- Name: messages_2026_02_28; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_02_28 FOR VALUES FROM ('2026-02-28 00:00:00') TO ('2026-03-01 00:00:00');


--
-- Name: messages_2026_03_01; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_03_01 FOR VALUES FROM ('2026-03-01 00:00:00') TO ('2026-03-02 00:00:00');


--
-- Name: messages_2026_03_02; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_03_02 FOR VALUES FROM ('2026-03-02 00:00:00') TO ('2026-03-03 00:00:00');


--
-- Name: messages_2026_03_03; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_03_03 FOR VALUES FROM ('2026-03-03 00:00:00') TO ('2026-03-04 00:00:00');


--
-- Name: messages_2026_03_04; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_03_04 FOR VALUES FROM ('2026-03-04 00:00:00') TO ('2026-03-05 00:00:00');


--
-- Name: messages_2026_03_05; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_03_05 FOR VALUES FROM ('2026-03-05 00:00:00') TO ('2026-03-06 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: agent_inventory agent_inventory_agent_id_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_inventory
    ADD CONSTRAINT agent_inventory_agent_id_variant_id_key UNIQUE (agent_id, variant_id);


--
-- Name: agent_inventory agent_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_inventory
    ADD CONSTRAINT agent_inventory_pkey PRIMARY KEY (id);


--
-- Name: agent_inventory agent_inventory_unique_constraint; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_inventory
    ADD CONSTRAINT agent_inventory_unique_constraint UNIQUE (agent_id, variant_id, company_id);


--
-- Name: CONSTRAINT agent_inventory_unique_constraint ON agent_inventory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT agent_inventory_unique_constraint ON public.agent_inventory IS 'Ensures each agent has only one inventory record per variant per company';


--
-- Name: agent_monthly_targets agent_monthly_targets_agent_id_target_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_monthly_targets
    ADD CONSTRAINT agent_monthly_targets_agent_id_target_month_key UNIQUE (agent_id, target_month);


--
-- Name: agent_monthly_targets agent_monthly_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_monthly_targets
    ADD CONSTRAINT agent_monthly_targets_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: business_audit_log business_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_audit_log
    ADD CONSTRAINT business_audit_log_pkey PRIMARY KEY (id);


--
-- Name: business_operations business_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_operations
    ADD CONSTRAINT business_operations_pkey PRIMARY KEY (id);


--
-- Name: cash_deposits cash_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_pkey PRIMARY KEY (id);


--
-- Name: client_brands client_brands_client_id_brand_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_brands
    ADD CONSTRAINT client_brands_client_id_brand_id_key UNIQUE (client_id, brand_id);


--
-- Name: client_brands client_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_brands
    ADD CONSTRAINT client_brands_pkey PRIMARY KEY (id);


--
-- Name: client_order_items client_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_order_items
    ADD CONSTRAINT client_order_items_pkey PRIMARY KEY (id);


--
-- Name: client_orders client_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_orders
    ADD CONSTRAINT client_orders_order_number_key UNIQUE (order_number);


--
-- Name: client_orders client_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_orders
    ADD CONSTRAINT client_orders_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_payment_settings company_payment_settings_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_payment_settings
    ADD CONSTRAINT company_payment_settings_company_id_key UNIQUE (company_id);


--
-- Name: company_payment_settings company_payment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_payment_settings
    ADD CONSTRAINT company_payment_settings_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: executive_company_assignments executive_company_assignments_executive_id_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_executive_id_company_id_key UNIQUE (executive_id, company_id);


--
-- Name: executive_company_assignments executive_company_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_pkey PRIMARY KEY (id);


--
-- Name: financial_transactions financial_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (id);


--
-- Name: inventory_return_items inventory_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_return_items
    ADD CONSTRAINT inventory_return_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_returns inventory_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_returns
    ADD CONSTRAINT inventory_returns_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: leader_teams leader_teams_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leader_teams
    ADD CONSTRAINT leader_teams_agent_id_key UNIQUE (agent_id);


--
-- Name: leader_teams leader_teams_leader_id_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leader_teams
    ADD CONSTRAINT leader_teams_leader_id_agent_id_key UNIQUE (leader_id, agent_id);


--
-- Name: leader_teams leader_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leader_teams
    ADD CONSTRAINT leader_teams_pkey PRIMARY KEY (id);


--
-- Name: main_inventory main_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.main_inventory
    ADD CONSTRAINT main_inventory_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_company_id_key UNIQUE (company_id, po_number);


--
-- Name: remittances_log remittances_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittances_log
    ADD CONSTRAINT remittances_log_pkey PRIMARY KEY (id);


--
-- Name: shop_types shop_types_company_id_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_types
    ADD CONSTRAINT shop_types_company_id_type_name_key UNIQUE (company_id, type_name);


--
-- Name: shop_types shop_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_types
    ADD CONSTRAINT shop_types_pkey PRIMARY KEY (id);


--
-- Name: stock_request_items stock_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_request_items
    ADD CONSTRAINT stock_request_items_pkey PRIMARY KEY (id);


--
-- Name: stock_requests stock_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_pkey PRIMARY KEY (id);


--
-- Name: sub_teams sub_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_teams
    ADD CONSTRAINT sub_teams_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: system_audit_log system_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_audit_log
    ADD CONSTRAINT system_audit_log_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tl_stock_requests tl_stock_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_pkey PRIMARY KEY (id);


--
-- Name: tl_stock_requests tl_stock_requests_request_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_request_number_key UNIQUE (request_number);


--
-- Name: sub_teams unique_leader_sub_team; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_teams
    ADD CONSTRAINT unique_leader_sub_team UNIQUE (leader_id);


--
-- Name: variant_types variant_types_company_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_types
    ADD CONSTRAINT variant_types_company_id_name_key UNIQUE (company_id, name);


--
-- Name: variant_types variant_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_types
    ADD CONSTRAINT variant_types_pkey PRIMARY KEY (id);


--
-- Name: variants variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_pkey PRIMARY KEY (id);


--
-- Name: visit_logs visit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_26 messages_2026_02_26_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_26
    ADD CONSTRAINT messages_2026_02_26_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_27 messages_2026_02_27_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_27
    ADD CONSTRAINT messages_2026_02_27_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_02_28 messages_2026_02_28_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_02_28
    ADD CONSTRAINT messages_2026_02_28_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_03_01 messages_2026_03_01_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_03_01
    ADD CONSTRAINT messages_2026_03_01_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_03_02 messages_2026_03_02_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_03_02
    ADD CONSTRAINT messages_2026_03_02_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_03_03 messages_2026_03_03_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_03_03
    ADD CONSTRAINT messages_2026_03_03_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_03_04 messages_2026_03_04_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_03_04
    ADD CONSTRAINT messages_2026_03_04_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_03_05 messages_2026_03_05_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_03_05
    ADD CONSTRAINT messages_2026_03_05_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: idx_agent_inventory_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_inventory_agent_id ON public.agent_inventory USING btree (agent_id);


--
-- Name: idx_agent_inventory_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_inventory_company_id ON public.agent_inventory USING btree (company_id);


--
-- Name: idx_agent_inventory_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_inventory_status ON public.agent_inventory USING btree (status);


--
-- Name: idx_agent_inventory_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_inventory_variant_id ON public.agent_inventory USING btree (variant_id);


--
-- Name: idx_agent_monthly_targets_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_monthly_targets_agent_id ON public.agent_monthly_targets USING btree (agent_id);


--
-- Name: idx_agent_monthly_targets_agent_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_monthly_targets_agent_month ON public.agent_monthly_targets USING btree (agent_id, target_month);


--
-- Name: idx_agent_monthly_targets_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_monthly_targets_month ON public.agent_monthly_targets USING btree (target_month);


--
-- Name: idx_audit_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_company_id ON public.system_audit_log USING btree (company_id);


--
-- Name: idx_audit_company_table_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_company_table_date ON public.system_audit_log USING btree (company_id, table_name, created_at DESC);


--
-- Name: idx_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created_at ON public.system_audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_operation ON public.system_audit_log USING btree (operation);


--
-- Name: idx_audit_record_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_record_id ON public.system_audit_log USING btree (record_id);


--
-- Name: idx_audit_table_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_table_name ON public.system_audit_log USING btree (table_name);


--
-- Name: idx_audit_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user_id ON public.system_audit_log USING btree (user_id);


--
-- Name: idx_brands_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_company_id ON public.brands USING btree (company_id);


--
-- Name: idx_brands_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_is_active ON public.brands USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_brands_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brands_name ON public.brands USING btree (name);


--
-- Name: idx_business_audit_action_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_action_category ON public.business_audit_log USING btree (action_category);


--
-- Name: idx_business_audit_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_action_type ON public.business_audit_log USING btree (action_type);


--
-- Name: idx_business_audit_affected_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_affected_client ON public.business_audit_log USING btree (affected_client_id);


--
-- Name: idx_business_audit_affected_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_affected_user ON public.business_audit_log USING btree (affected_user_id);


--
-- Name: idx_business_audit_company_category_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_company_category_date ON public.business_audit_log USING btree (company_id, action_category, created_at DESC);


--
-- Name: idx_business_audit_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_company_id ON public.business_audit_log USING btree (company_id);


--
-- Name: idx_business_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_created_at ON public.business_audit_log USING btree (created_at DESC);


--
-- Name: idx_business_audit_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_audit_user_id ON public.business_audit_log USING btree (user_id);


--
-- Name: idx_business_operations_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_category ON public.business_operations USING btree (operation_category);


--
-- Name: idx_business_operations_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_company_id ON public.business_operations USING btree (company_id);


--
-- Name: idx_business_operations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_created_at ON public.business_operations USING btree (created_at DESC);


--
-- Name: idx_business_operations_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_metadata ON public.business_operations USING gin (metadata);


--
-- Name: idx_business_operations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_status ON public.business_operations USING btree (status);


--
-- Name: idx_business_operations_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_target ON public.business_operations USING btree (target_type, target_id);


--
-- Name: idx_business_operations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_type ON public.business_operations USING btree (operation_type);


--
-- Name: idx_business_operations_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_user_created ON public.business_operations USING btree (user_id, created_at DESC);


--
-- Name: idx_business_operations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_operations_user_id ON public.business_operations USING btree (user_id);


--
-- Name: idx_cash_deposits_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_deposits_agent_id ON public.cash_deposits USING btree (agent_id);


--
-- Name: idx_cash_deposits_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_deposits_company_id ON public.cash_deposits USING btree (company_id);


--
-- Name: idx_cash_deposits_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_deposits_date ON public.cash_deposits USING btree (deposit_date);


--
-- Name: idx_cash_deposits_deposit_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cash_deposits_deposit_type ON public.cash_deposits USING btree (deposit_type);


--
-- Name: idx_client_order_items_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_order_items_company_id ON public.client_order_items USING btree (company_id);


--
-- Name: idx_client_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_order_items_order_id ON public.client_order_items USING btree (client_order_id);


--
-- Name: idx_client_order_items_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_order_items_variant_id ON public.client_order_items USING btree (variant_id);


--
-- Name: idx_client_orders_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_agent_id ON public.client_orders USING btree (agent_id);


--
-- Name: idx_client_orders_bank_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_bank_type ON public.client_orders USING btree (bank_type);


--
-- Name: idx_client_orders_client_account_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_client_account_type ON public.client_orders USING btree (client_account_type);


--
-- Name: idx_client_orders_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_client_id ON public.client_orders USING btree (client_id);


--
-- Name: idx_client_orders_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_company_id ON public.client_orders USING btree (company_id);


--
-- Name: idx_client_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_created_at ON public.client_orders USING btree (created_at DESC);


--
-- Name: idx_client_orders_deposit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_deposit_id ON public.client_orders USING btree (deposit_id);


--
-- Name: idx_client_orders_order_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_order_number ON public.client_orders USING btree (order_number);


--
-- Name: idx_client_orders_payment_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_payment_mode ON public.client_orders USING btree (payment_mode);


--
-- Name: idx_client_orders_payment_splits; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_payment_splits ON public.client_orders USING gin (payment_splits);


--
-- Name: idx_client_orders_pricing_strategy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_pricing_strategy ON public.client_orders USING btree (pricing_strategy);


--
-- Name: idx_client_orders_remittance_notes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_remittance_notes ON public.client_orders USING btree (agent_id, remitted) WHERE (agent_remittance_notes IS NOT NULL);


--
-- Name: idx_client_orders_remitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_remitted ON public.client_orders USING btree (remitted);


--
-- Name: idx_client_orders_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_stage ON public.client_orders USING btree (stage);


--
-- Name: idx_client_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_status ON public.client_orders USING btree (status);


--
-- Name: idx_client_orders_status_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_orders_status_stage ON public.client_orders USING btree (status, stage);


--
-- Name: idx_clients_account_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_account_type ON public.clients USING btree (account_type);


--
-- Name: idx_clients_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_agent_id ON public.clients USING btree (agent_id);


--
-- Name: idx_clients_approval_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_approval_status ON public.clients USING btree (approval_status);


--
-- Name: idx_clients_brand_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_brand_ids ON public.clients USING gin (brand_ids);


--
-- Name: idx_clients_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_category ON public.clients USING btree (category);


--
-- Name: idx_clients_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_city ON public.clients USING btree (city);


--
-- Name: idx_clients_company_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_company_city ON public.clients USING btree (company_id, city);


--
-- Name: idx_clients_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_company_id ON public.clients USING btree (company_id);


--
-- Name: idx_clients_contact_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_contact_person ON public.clients USING btree (contact_person);


--
-- Name: idx_clients_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_created_at ON public.clients USING btree (created_at);


--
-- Name: idx_clients_has_forge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_has_forge ON public.clients USING btree (has_forge);


--
-- Name: idx_clients_shop_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_shop_type ON public.clients USING btree (shop_type);


--
-- Name: idx_clients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_status ON public.clients USING btree (status);


--
-- Name: idx_clients_tin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_tin ON public.clients USING btree (tin);


--
-- Name: idx_companies_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_email ON public.companies USING btree (company_email);


--
-- Name: idx_companies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_status ON public.companies USING btree (status);


--
-- Name: idx_events_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_action ON public.events USING btree (action);


--
-- Name: idx_events_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_actor_id ON public.events USING btree (actor_id);


--
-- Name: idx_events_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_company_id ON public.events USING btree (company_id);


--
-- Name: idx_events_company_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_company_occurred ON public.events USING btree (company_id, occurred_at DESC);


--
-- Name: idx_events_details; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_details ON public.events USING gin (details);


--
-- Name: idx_events_occurred_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_occurred_at ON public.events USING btree (occurred_at DESC);


--
-- Name: idx_events_target_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_target_type ON public.events USING btree (target_type);


--
-- Name: idx_executive_assignments_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executive_assignments_company_id ON public.executive_company_assignments USING btree (company_id);


--
-- Name: idx_executive_assignments_executive_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_executive_assignments_executive_id ON public.executive_company_assignments USING btree (executive_id);


--
-- Name: idx_financial_transactions_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_agent_id ON public.financial_transactions USING btree (agent_id);


--
-- Name: idx_financial_transactions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_company_id ON public.financial_transactions USING btree (company_id);


--
-- Name: idx_financial_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_date ON public.financial_transactions USING btree (transaction_date);


--
-- Name: idx_financial_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_status ON public.financial_transactions USING btree (status);


--
-- Name: idx_financial_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_transactions_type ON public.financial_transactions USING btree (transaction_type);


--
-- Name: idx_inventory_return_items_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_return_items_return ON public.inventory_return_items USING btree (return_id);


--
-- Name: idx_inventory_return_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_return_items_variant ON public.inventory_return_items USING btree (variant_id);


--
-- Name: idx_inventory_returns_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_returns_agent ON public.inventory_returns USING btree (agent_id, return_date DESC);


--
-- Name: idx_inventory_returns_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_returns_company ON public.inventory_returns USING btree (company_id, return_date DESC);


--
-- Name: idx_inventory_returns_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_returns_receiver ON public.inventory_returns USING btree (receiver_id, return_date DESC);


--
-- Name: idx_inventory_transactions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_company_id ON public.inventory_transactions USING btree (company_id);


--
-- Name: idx_inventory_transactions_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_reference ON public.inventory_transactions USING btree (reference_type, reference_id);


--
-- Name: idx_inventory_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_type ON public.inventory_transactions USING btree (transaction_type);


--
-- Name: idx_inventory_transactions_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_variant_id ON public.inventory_transactions USING btree (variant_id);


--
-- Name: idx_leader_teams_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leader_teams_agent ON public.leader_teams USING btree (agent_id, company_id);


--
-- Name: idx_leader_teams_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leader_teams_agent_id ON public.leader_teams USING btree (agent_id);


--
-- Name: idx_leader_teams_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leader_teams_company_id ON public.leader_teams USING btree (company_id);


--
-- Name: idx_leader_teams_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leader_teams_leader ON public.leader_teams USING btree (leader_id, company_id);


--
-- Name: idx_leader_teams_leader_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leader_teams_leader_id ON public.leader_teams USING btree (leader_id);


--
-- Name: idx_leader_teams_sub_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leader_teams_sub_team_id ON public.leader_teams USING btree (sub_team_id);


--
-- Name: idx_main_inventory_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_main_inventory_company_id ON public.main_inventory USING btree (company_id);


--
-- Name: idx_main_inventory_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_main_inventory_status ON public.main_inventory USING btree (status);


--
-- Name: idx_main_inventory_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_main_inventory_variant_id ON public.main_inventory USING btree (variant_id);


--
-- Name: idx_notifications_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_company_id ON public.notifications USING btree (company_id);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (notification_type);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_payment_settings_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_settings_company_id ON public.company_payment_settings USING btree (company_id);


--
-- Name: idx_profiles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id);


--
-- Name: INDEX idx_profiles_company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_profiles_company_id IS 'Optimizes profile fetches by company';


--
-- Name: idx_profiles_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_company_status ON public.profiles USING btree (company_id, status);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_profiles_role_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role_company ON public.profiles USING btree (role, company_id) WHERE (role = ANY (ARRAY['mobile_sales'::text, 'team_leader'::text, 'manager'::text]));


--
-- Name: idx_profiles_role_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role_status ON public.profiles USING btree (role, status);


--
-- Name: idx_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_status ON public.profiles USING btree (status);


--
-- Name: idx_purchase_order_items_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_items_company_id ON public.purchase_order_items USING btree (company_id);


--
-- Name: idx_purchase_order_items_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_items_po_id ON public.purchase_order_items USING btree (purchase_order_id);


--
-- Name: idx_purchase_order_items_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_items_variant_id ON public.purchase_order_items USING btree (variant_id);


--
-- Name: idx_purchase_orders_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_company_id ON public.purchase_orders USING btree (company_id);


--
-- Name: idx_purchase_orders_po_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_po_number ON public.purchase_orders USING btree (po_number);


--
-- Name: idx_purchase_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_purchase_orders_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_supplier_id ON public.purchase_orders USING btree (supplier_id);


--
-- Name: idx_remittances_log_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remittances_log_agent_id ON public.remittances_log USING btree (agent_id);


--
-- Name: idx_remittances_log_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remittances_log_company_id ON public.remittances_log USING btree (company_id);


--
-- Name: idx_remittances_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remittances_log_created_at ON public.remittances_log USING btree (created_at DESC);


--
-- Name: idx_remittances_log_leader_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remittances_log_leader_id ON public.remittances_log USING btree (leader_id);


--
-- Name: idx_remittances_log_remittance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remittances_log_remittance_date ON public.remittances_log USING btree (remittance_date);


--
-- Name: idx_remittances_log_remitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remittances_log_remitted_at ON public.remittances_log USING btree (remitted_at);


--
-- Name: idx_shop_types_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_types_company_id ON public.shop_types USING btree (company_id);


--
-- Name: idx_shop_types_is_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shop_types_is_default ON public.shop_types USING btree (is_default);


--
-- Name: idx_stock_request_items_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_request_items_company_id ON public.stock_request_items USING btree (company_id);


--
-- Name: idx_stock_request_items_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_request_items_request_id ON public.stock_request_items USING btree (stock_request_id);


--
-- Name: idx_stock_request_items_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_request_items_variant_id ON public.stock_request_items USING btree (variant_id);


--
-- Name: idx_stock_requests_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_requests_agent_id ON public.stock_requests USING btree (agent_id);


--
-- Name: idx_stock_requests_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_requests_company_id ON public.stock_requests USING btree (company_id);


--
-- Name: idx_stock_requests_leader_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_requests_leader_id ON public.stock_requests USING btree (leader_id);


--
-- Name: idx_stock_requests_request_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_requests_request_number ON public.stock_requests USING btree (request_number);


--
-- Name: idx_stock_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_requests_status ON public.stock_requests USING btree (status);


--
-- Name: idx_sub_teams_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_teams_company_id ON public.sub_teams USING btree (company_id);


--
-- Name: idx_sub_teams_leader_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_teams_leader_id ON public.sub_teams USING btree (leader_id);


--
-- Name: idx_sub_teams_manager_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_teams_manager_id ON public.sub_teams USING btree (manager_id);


--
-- Name: idx_suppliers_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_company_id ON public.suppliers USING btree (company_id);


--
-- Name: idx_suppliers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_status ON public.suppliers USING btree (status);


--
-- Name: idx_tl_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tl_requests_company ON public.tl_stock_requests USING btree (company_id);


--
-- Name: idx_tl_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tl_requests_created_at ON public.tl_stock_requests USING btree (created_at DESC);


--
-- Name: idx_tl_requests_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tl_requests_requester ON public.tl_stock_requests USING btree (requester_leader_id);


--
-- Name: idx_tl_requests_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tl_requests_source ON public.tl_stock_requests USING btree (source_leader_id);


--
-- Name: idx_tl_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tl_requests_status ON public.tl_stock_requests USING btree (status);


--
-- Name: idx_variant_types_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variant_types_company_id ON public.variant_types USING btree (company_id);


--
-- Name: idx_variant_types_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variant_types_is_active ON public.variant_types USING btree (is_active);


--
-- Name: idx_variant_types_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variant_types_name ON public.variant_types USING btree (name);


--
-- Name: idx_variants_brand_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_brand_id ON public.variants USING btree (brand_id);


--
-- Name: idx_variants_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_company_id ON public.variants USING btree (company_id);


--
-- Name: idx_variants_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_is_active ON public.variants USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_variants_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_type ON public.variants USING btree (variant_type);


--
-- Name: idx_variants_variant_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_variant_type ON public.variants USING btree (variant_type);


--
-- Name: idx_visit_logs_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_logs_agent_id ON public.visit_logs USING btree (agent_id);


--
-- Name: idx_visit_logs_check_in_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_logs_check_in_time ON public.visit_logs USING btree (visited_at DESC);


--
-- Name: idx_visit_logs_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_logs_client_id ON public.visit_logs USING btree (client_id);


--
-- Name: idx_visit_logs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_logs_company_id ON public.visit_logs USING btree (company_id);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_26_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_26_inserted_at_topic_idx ON realtime.messages_2026_02_26 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_27_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_27_inserted_at_topic_idx ON realtime.messages_2026_02_27 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_02_28_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_02_28_inserted_at_topic_idx ON realtime.messages_2026_02_28 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_03_01_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_03_01_inserted_at_topic_idx ON realtime.messages_2026_03_01 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_03_02_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_03_02_inserted_at_topic_idx ON realtime.messages_2026_03_02 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_03_03_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_03_03_inserted_at_topic_idx ON realtime.messages_2026_03_03 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_03_04_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_03_04_inserted_at_topic_idx ON realtime.messages_2026_03_04 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_03_05_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_03_05_inserted_at_topic_idx ON realtime.messages_2026_03_05 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_02_26_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_26_inserted_at_topic_idx;


--
-- Name: messages_2026_02_26_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_26_pkey;


--
-- Name: messages_2026_02_27_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_27_inserted_at_topic_idx;


--
-- Name: messages_2026_02_27_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_27_pkey;


--
-- Name: messages_2026_02_28_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_02_28_inserted_at_topic_idx;


--
-- Name: messages_2026_02_28_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_02_28_pkey;


--
-- Name: messages_2026_03_01_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_03_01_inserted_at_topic_idx;


--
-- Name: messages_2026_03_01_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_03_01_pkey;


--
-- Name: messages_2026_03_02_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_03_02_inserted_at_topic_idx;


--
-- Name: messages_2026_03_02_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_03_02_pkey;


--
-- Name: messages_2026_03_03_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_03_03_inserted_at_topic_idx;


--
-- Name: messages_2026_03_03_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_03_03_pkey;


--
-- Name: messages_2026_03_04_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_03_04_inserted_at_topic_idx;


--
-- Name: messages_2026_03_04_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_03_04_pkey;


--
-- Name: messages_2026_03_05_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_03_05_inserted_at_topic_idx;


--
-- Name: messages_2026_03_05_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_03_05_pkey;


--
-- Name: sub_teams handle_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.sub_teams FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: profiles on_profile_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_delete AFTER DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_user_delete();


--
-- Name: variants sync_variant_type_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_variant_type_trigger BEFORE INSERT OR UPDATE OF variant_type_id ON public.variants FOR EACH ROW EXECUTE FUNCTION public.sync_variant_type_from_id();


--
-- Name: companies trigger_insert_default_payment_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_insert_default_payment_settings AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.insert_default_payment_settings();


--
-- Name: companies trigger_insert_default_shop_types; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_insert_default_shop_types AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.insert_default_shop_types();


--
-- Name: agent_monthly_targets trigger_update_agent_monthly_targets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_agent_monthly_targets_updated_at BEFORE UPDATE ON public.agent_monthly_targets FOR EACH ROW EXECUTE FUNCTION public.update_agent_monthly_targets_updated_at();


--
-- Name: company_payment_settings trigger_update_payment_settings_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_payment_settings_timestamp BEFORE UPDATE ON public.company_payment_settings FOR EACH ROW EXECUTE FUNCTION public.update_payment_settings_updated_at();


--
-- Name: agent_inventory update_agent_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_agent_inventory_updated_at BEFORE UPDATE ON public.agent_inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: brands update_brands_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: business_operations update_business_operations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_business_operations_updated_at BEFORE UPDATE ON public.business_operations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_orders update_client_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_client_orders_updated_at BEFORE UPDATE ON public.client_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: companies update_companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: executive_company_assignments update_executive_company_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_executive_company_assignments_updated_at BEFORE UPDATE ON public.executive_company_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financial_transactions update_financial_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_financial_transactions_updated_at BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leader_teams update_leader_teams_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_leader_teams_updated_at BEFORE UPDATE ON public.leader_teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: main_inventory update_main_inventory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_main_inventory_updated_at BEFORE UPDATE ON public.main_inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: purchase_orders update_purchase_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: remittances_log update_remittances_log_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_remittances_log_updated_at BEFORE UPDATE ON public.remittances_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stock_requests update_stock_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_stock_requests_updated_at BEFORE UPDATE ON public.stock_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers update_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tl_stock_requests update_tl_stock_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tl_stock_requests_updated_at BEFORE UPDATE ON public.tl_stock_requests FOR EACH ROW EXECUTE FUNCTION public.update_tl_stock_requests_updated_at();


--
-- Name: variant_types update_variant_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_variant_types_updated_at BEFORE UPDATE ON public.variant_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: variants update_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_variants_updated_at BEFORE UPDATE ON public.variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: agent_inventory agent_inventory_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_inventory
    ADD CONSTRAINT agent_inventory_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_inventory agent_inventory_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_inventory
    ADD CONSTRAINT agent_inventory_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_inventory agent_inventory_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_inventory
    ADD CONSTRAINT agent_inventory_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: agent_monthly_targets agent_monthly_targets_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_monthly_targets
    ADD CONSTRAINT agent_monthly_targets_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: agent_monthly_targets agent_monthly_targets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_monthly_targets
    ADD CONSTRAINT agent_monthly_targets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: brands brands_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: brands brands_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: business_audit_log business_audit_log_affected_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_audit_log
    ADD CONSTRAINT business_audit_log_affected_client_id_fkey FOREIGN KEY (affected_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: business_audit_log business_audit_log_affected_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_audit_log
    ADD CONSTRAINT business_audit_log_affected_user_id_fkey FOREIGN KEY (affected_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: business_audit_log business_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_audit_log
    ADD CONSTRAINT business_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: business_audit_log business_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_audit_log
    ADD CONSTRAINT business_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: business_operations business_operations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_operations
    ADD CONSTRAINT business_operations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: business_operations business_operations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_operations
    ADD CONSTRAINT business_operations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: cash_deposits cash_deposits_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: cash_deposits cash_deposits_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cash_deposits cash_deposits_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_deposits
    ADD CONSTRAINT cash_deposits_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);


--
-- Name: client_brands client_brands_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_brands
    ADD CONSTRAINT client_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;


--
-- Name: client_brands client_brands_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_brands
    ADD CONSTRAINT client_brands_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_order_items client_order_items_client_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_order_items
    ADD CONSTRAINT client_order_items_client_order_id_fkey FOREIGN KEY (client_order_id) REFERENCES public.client_orders(id) ON DELETE CASCADE;


--
-- Name: client_order_items client_order_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_order_items
    ADD CONSTRAINT client_order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: client_order_items client_order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_order_items
    ADD CONSTRAINT client_order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: client_orders client_orders_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_orders
    ADD CONSTRAINT client_orders_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: client_orders client_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_orders
    ADD CONSTRAINT client_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: client_orders client_orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_orders
    ADD CONSTRAINT client_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;


--
-- Name: client_orders client_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_orders
    ADD CONSTRAINT client_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: client_orders client_orders_deposit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_orders
    ADD CONSTRAINT client_orders_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.cash_deposits(id) ON DELETE SET NULL;


--
-- Name: clients clients_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: clients clients_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: clients clients_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_payment_settings company_payment_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_payment_settings
    ADD CONSTRAINT company_payment_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: events events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: events events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: executive_company_assignments executive_company_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
-- Name: executive_company_assignments executive_company_assignments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: executive_company_assignments executive_company_assignments_executive_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.executive_company_assignments
    ADD CONSTRAINT executive_company_assignments_executive_id_fkey FOREIGN KEY (executive_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: financial_transactions financial_transactions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: financial_transactions financial_transactions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: financial_transactions financial_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: inventory_return_items inventory_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_return_items
    ADD CONSTRAINT inventory_return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.inventory_returns(id) ON DELETE CASCADE;


--
-- Name: inventory_return_items inventory_return_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_return_items
    ADD CONSTRAINT inventory_return_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: inventory_returns inventory_returns_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_returns
    ADD CONSTRAINT inventory_returns_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: inventory_returns inventory_returns_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_returns
    ADD CONSTRAINT inventory_returns_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: inventory_returns inventory_returns_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_returns
    ADD CONSTRAINT inventory_returns_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id);


--
-- Name: inventory_transactions inventory_transactions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: inventory_transactions inventory_transactions_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id);


--
-- Name: inventory_transactions inventory_transactions_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: leader_teams leader_teams_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leader_teams
    ADD CONSTRAINT leader_teams_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: leader_teams leader_teams_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leader_teams
    ADD CONSTRAINT leader_teams_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: leader_teams leader_teams_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leader_teams
    ADD CONSTRAINT leader_teams_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: leader_teams leader_teams_sub_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leader_teams
    ADD CONSTRAINT leader_teams_sub_team_id_fkey FOREIGN KEY (sub_team_id) REFERENCES public.sub_teams(id) ON DELETE SET NULL;


--
-- Name: main_inventory main_inventory_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.main_inventory
    ADD CONSTRAINT main_inventory_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: main_inventory main_inventory_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.main_inventory
    ADD CONSTRAINT main_inventory_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items purchase_order_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items purchase_order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: purchase_orders purchase_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: remittances_log remittances_log_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittances_log
    ADD CONSTRAINT remittances_log_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: remittances_log remittances_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittances_log
    ADD CONSTRAINT remittances_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: remittances_log remittances_log_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remittances_log
    ADD CONSTRAINT remittances_log_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: shop_types shop_types_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_types
    ADD CONSTRAINT shop_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: shop_types shop_types_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_types
    ADD CONSTRAINT shop_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: stock_request_items stock_request_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_request_items
    ADD CONSTRAINT stock_request_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: stock_request_items stock_request_items_stock_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_request_items
    ADD CONSTRAINT stock_request_items_stock_request_id_fkey FOREIGN KEY (stock_request_id) REFERENCES public.stock_requests(id) ON DELETE CASCADE;


--
-- Name: stock_request_items stock_request_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_request_items
    ADD CONSTRAINT stock_request_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: stock_requests stock_requests_admin_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_admin_approved_by_fkey FOREIGN KEY (admin_approved_by) REFERENCES public.profiles(id);


--
-- Name: stock_requests stock_requests_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: stock_requests stock_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: stock_requests stock_requests_fulfilled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_fulfilled_by_fkey FOREIGN KEY (fulfilled_by) REFERENCES public.profiles(id);


--
-- Name: stock_requests stock_requests_leader_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_leader_approved_by_fkey FOREIGN KEY (leader_approved_by) REFERENCES public.profiles(id);


--
-- Name: stock_requests stock_requests_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: stock_requests stock_requests_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.profiles(id);


--
-- Name: stock_requests stock_requests_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_requests
    ADD CONSTRAINT stock_requests_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id) ON DELETE CASCADE;


--
-- Name: sub_teams sub_teams_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_teams
    ADD CONSTRAINT sub_teams_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sub_teams sub_teams_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_teams
    ADD CONSTRAINT sub_teams_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: sub_teams sub_teams_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_teams
    ADD CONSTRAINT sub_teams_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: system_audit_log system_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_audit_log
    ADD CONSTRAINT system_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tl_stock_requests tl_stock_requests_admin_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_admin_approved_by_fkey FOREIGN KEY (admin_approved_by) REFERENCES public.profiles(id);


--
-- Name: tl_stock_requests tl_stock_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tl_stock_requests tl_stock_requests_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);


--
-- Name: tl_stock_requests tl_stock_requests_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.profiles(id);


--
-- Name: tl_stock_requests tl_stock_requests_requester_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_requester_leader_id_fkey FOREIGN KEY (requester_leader_id) REFERENCES public.profiles(id);


--
-- Name: tl_stock_requests tl_stock_requests_source_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_source_leader_id_fkey FOREIGN KEY (source_leader_id) REFERENCES public.profiles(id);


--
-- Name: tl_stock_requests tl_stock_requests_source_tl_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_source_tl_approved_by_fkey FOREIGN KEY (source_tl_approved_by) REFERENCES public.profiles(id);


--
-- Name: tl_stock_requests tl_stock_requests_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tl_stock_requests
    ADD CONSTRAINT tl_stock_requests_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variants(id);


--
-- Name: variant_types variant_types_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_types
    ADD CONSTRAINT variant_types_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: variants variants_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: variants variants_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: variants variants_variant_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variants
    ADD CONSTRAINT variants_variant_type_id_fkey FOREIGN KEY (variant_type_id) REFERENCES public.variant_types(id) ON DELETE RESTRICT;


--
-- Name: visit_logs visit_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: visit_logs visit_logs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: visit_logs visit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: visit_logs visit_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_logs
    ADD CONSTRAINT visit_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: brands Admins and managers can insert brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can insert brands" ON public.brands FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.company_id = brands.company_id) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'manager'::text]))))));


--
-- Name: variants Admins and managers can insert variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and managers can insert variants" ON public.variants FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.brands
     JOIN public.profiles ON ((profiles.company_id = brands.company_id)))
  WHERE ((brands.id = variants.brand_id) AND (profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'manager'::text]))))));


--
-- Name: agent_monthly_targets Admins can delete all targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete all targets" ON public.agent_monthly_targets FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text]))))));


--
-- Name: shop_types Admins can delete custom shop types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete custom shop types" ON public.shop_types FOR DELETE USING (((is_default = false) AND (company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: variant_types Admins can delete variant types in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete variant types in their company" ON public.variant_types FOR DELETE USING (((company_id = public.get_my_company_id()) AND public.is_admin_or_super_admin() AND (NOT (EXISTS ( SELECT 1
   FROM public.variants
  WHERE (variants.variant_type_id = variant_types.id))))));


--
-- Name: profiles Admins can insert profiles in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert profiles in their company" ON public.profiles FOR INSERT WITH CHECK (((company_id = public.get_auth_company_id()) AND public.is_auth_admin_or_super_admin()));


--
-- Name: variant_types Admins can insert variant types in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert variant types in their company" ON public.variant_types FOR INSERT WITH CHECK (((company_id = public.get_my_company_id()) AND public.is_admin_or_super_admin()));


--
-- Name: agent_monthly_targets Admins can manage all targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all targets" ON public.agent_monthly_targets FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text]))))));


--
-- Name: agent_monthly_targets Admins can update all targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all targets" ON public.agent_monthly_targets FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text]))))));


--
-- Name: profiles Admins can update profiles in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update profiles in their company" ON public.profiles FOR UPDATE USING (((company_id = public.get_auth_company_id()) AND public.is_auth_admin_or_super_admin())) WITH CHECK (((company_id = public.get_auth_company_id()) AND public.is_auth_admin_or_super_admin()));


--
-- Name: tl_stock_requests Admins can update requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update requests" ON public.tl_stock_requests FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (profiles.company_id = tl_stock_requests.company_id)))));


--
-- Name: shop_types Admins can update shop types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update shop types" ON public.shop_types FOR UPDATE USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));


--
-- Name: variant_types Admins can update variant types in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update variant types in their company" ON public.variant_types FOR UPDATE USING (((company_id = public.get_my_company_id()) AND public.is_admin_or_super_admin())) WITH CHECK (((company_id = public.get_my_company_id()) AND public.is_admin_or_super_admin()));


--
-- Name: events Admins can view all events in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all events in their company" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'finance'::text])) AND (profiles.company_id = events.company_id)))));


--
-- Name: tl_stock_requests Admins can view all requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all requests" ON public.tl_stock_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (profiles.company_id = tl_stock_requests.company_id)))));


--
-- Name: agent_monthly_targets Admins can view all targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all targets" ON public.agent_monthly_targets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text]))))));


--
-- Name: visit_logs Admins can view company visit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view company visit logs" ON public.visit_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR (p.role = 'super_admin'::text)) AND (p.company_id = visit_logs.company_id)))));


--
-- Name: sub_teams Admins view all sub-teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all sub-teams" ON public.sub_teams FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));


--
-- Name: visit_logs Agents can add visit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can add visit logs" ON public.visit_logs FOR INSERT WITH CHECK ((agent_id = auth.uid()));


--
-- Name: inventory_returns Agents can create returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can create returns" ON public.inventory_returns FOR INSERT WITH CHECK ((agent_id = auth.uid()));


--
-- Name: tasks Agents can insert own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can insert own tasks" ON public.tasks FOR INSERT WITH CHECK ((agent_id = auth.uid()));


--
-- Name: tasks Agents can update own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can update own tasks" ON public.tasks FOR UPDATE USING ((agent_id = auth.uid()));


--
-- Name: agent_monthly_targets Agents can view own targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view own targets" ON public.agent_monthly_targets FOR SELECT USING ((agent_id = auth.uid()));


--
-- Name: tasks Agents can view own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view own tasks" ON public.tasks FOR SELECT USING ((agent_id = auth.uid()));


--
-- Name: visit_logs Agents can view own visit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view own visit logs" ON public.visit_logs FOR SELECT USING ((agent_id = auth.uid()));


--
-- Name: events Authenticated users can insert events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert events" ON public.events FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.company_id = events.company_id)))));


--
-- Name: agent_inventory Executives can view agent inventory from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view agent inventory from assigned companies" ON public.agent_inventory FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: companies Executives can view assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view assigned companies" ON public.companies FOR SELECT USING ((public.is_executive() AND (id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: brands Executives can view brands from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view brands from assigned companies" ON public.brands FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: clients Executives can view clients from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view clients from assigned companies" ON public.clients FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: main_inventory Executives can view inventory from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view inventory from assigned companies" ON public.main_inventory FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: inventory_transactions Executives can view inventory transactions from assigned compan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view inventory transactions from assigned compan" ON public.inventory_transactions FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: client_order_items Executives can view order items from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view order items from assigned companies" ON public.client_order_items FOR SELECT USING ((public.is_executive() AND (EXISTS ( SELECT 1
   FROM public.client_orders
  WHERE ((client_orders.id = client_order_items.client_order_id) AND (client_orders.company_id = ANY (public.get_my_executive_company_ids())))))));


--
-- Name: client_orders Executives can view orders from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view orders from assigned companies" ON public.client_orders FOR SELECT USING ((public.is_executive() AND ((company_id = ANY (public.get_my_executive_company_ids())) OR (auth.uid() = agent_id))));


--
-- Name: profiles Executives can view profiles from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view profiles from assigned companies" ON public.profiles FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: remittances_log Executives can view remittances from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view remittances from assigned companies" ON public.remittances_log FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: executive_company_assignments Executives can view their own assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view their own assignments" ON public.executive_company_assignments FOR SELECT USING ((executive_id = auth.uid()));


--
-- Name: financial_transactions Executives can view transactions from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view transactions from assigned companies" ON public.financial_transactions FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: variants Executives can view variants from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view variants from assigned companies" ON public.variants FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: visit_logs Executives can view visit logs from assigned companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Executives can view visit logs from assigned companies" ON public.visit_logs FOR SELECT USING ((public.is_executive() AND (company_id = ANY (public.get_my_executive_company_ids()))));


--
-- Name: agent_monthly_targets Leaders can delete team targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can delete team targets" ON public.agent_monthly_targets FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'team_leader'::text) AND (agent_monthly_targets.agent_id IN ( SELECT leader_teams.agent_id
           FROM public.leader_teams
          WHERE (leader_teams.leader_id = auth.uid())))))));


--
-- Name: agent_monthly_targets Leaders can manage team targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage team targets" ON public.agent_monthly_targets FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'team_leader'::text) AND (agent_monthly_targets.agent_id IN ( SELECT leader_teams.agent_id
           FROM public.leader_teams
          WHERE (leader_teams.leader_id = auth.uid())))))));


--
-- Name: tasks Leaders can manage team tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can manage team tasks" ON public.tasks USING (((EXISTS ( SELECT 1
   FROM public.leader_teams lt
  WHERE ((lt.leader_id = auth.uid()) AND (lt.agent_id = tasks.agent_id)))) OR (leader_id = auth.uid())));


--
-- Name: agent_monthly_targets Leaders can update team targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can update team targets" ON public.agent_monthly_targets FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'team_leader'::text) AND (agent_monthly_targets.agent_id IN ( SELECT leader_teams.agent_id
           FROM public.leader_teams
          WHERE (leader_teams.leader_id = auth.uid())))))));


--
-- Name: events Leaders can view team events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can view team events" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text) AND (profiles.company_id = events.company_id) AND ((events.actor_id = auth.uid()) OR (events.actor_id IN ( SELECT leader_teams.agent_id
           FROM public.leader_teams
          WHERE (leader_teams.leader_id = auth.uid()))) OR ((events.details ->> 'leader_id'::text) = (auth.uid())::text))))));


--
-- Name: tasks Leaders can view team tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can view team tasks" ON public.tasks FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.leader_teams lt
  WHERE ((lt.leader_id = auth.uid()) AND (lt.agent_id = tasks.agent_id)))) OR (leader_id = auth.uid())));


--
-- Name: visit_logs Leaders can view team visit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can view team visit logs" ON public.visit_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.leader_teams lt
  WHERE ((lt.leader_id = auth.uid()) AND (lt.agent_id = visit_logs.agent_id)))));


--
-- Name: agent_monthly_targets Leaders can view their team targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders can view their team targets" ON public.agent_monthly_targets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'team_leader'::text) AND (agent_monthly_targets.agent_id IN ( SELECT leader_teams.agent_id
           FROM public.leader_teams
          WHERE (leader_teams.leader_id = auth.uid())))))));


--
-- Name: sub_teams Leaders view company sub-teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leaders view company sub-teams" ON public.sub_teams FOR SELECT TO authenticated USING (((leader_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text) AND (profiles.company_id = sub_teams.company_id))))));


--
-- Name: tasks Managers can manage company tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can manage company tasks" ON public.tasks USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'manager'::text) AND (p.company_id = tasks.company_id)))));


--
-- Name: tasks Managers can view company tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view company tasks" ON public.tasks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'manager'::text) AND (p.company_id = tasks.company_id)))));


--
-- Name: visit_logs Managers can view company visit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view company visit logs" ON public.visit_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'manager'::text) AND (p.company_id = visit_logs.company_id)))));


--
-- Name: agent_monthly_targets Managers can view their team targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can view their team targets" ON public.agent_monthly_targets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'manager'::text) AND (agent_monthly_targets.agent_id IN ( SELECT lt2.agent_id
           FROM (public.leader_teams lt1
             JOIN public.leader_teams lt2 ON ((lt2.leader_id = lt1.agent_id)))
          WHERE ((lt1.leader_id = auth.uid()) AND (lt2.agent_id IN ( SELECT profiles.id
                   FROM public.profiles
                  WHERE (profiles.role = 'mobile_sales'::text))))))))));


--
-- Name: sub_teams Managers view own sub-teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers view own sub-teams" ON public.sub_teams FOR SELECT TO authenticated USING ((manager_id = auth.uid()));


--
-- Name: clients Managers view team clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers view team clients" ON public.clients FOR SELECT USING (((auth.uid() = agent_id) OR (EXISTS ( SELECT 1
   FROM public.leader_teams
  WHERE ((leader_teams.leader_id = auth.uid()) AND (leader_teams.agent_id = clients.agent_id)))) OR (EXISTS ( SELECT 1
   FROM (public.leader_teams sub
     JOIN public.leader_teams parent ON ((sub.leader_id = parent.agent_id)))
  WHERE ((parent.leader_id = auth.uid()) AND (sub.agent_id = clients.agent_id))))));


--
-- Name: sub_teams Members view assigned sub-team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view assigned sub-team" ON public.sub_teams FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.leader_teams
  WHERE ((leader_teams.sub_team_id = sub_teams.id) AND (leader_teams.agent_id = auth.uid())))));


--
-- Name: events Sales agents can view their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales agents can view their own events" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mobile_sales'::text, 'sales_agent'::text])) AND (profiles.company_id = events.company_id) AND ((events.actor_id = auth.uid()) OR ((events.details ->> 'agent_id'::text) = (auth.uid())::text))))));


--
-- Name: company_payment_settings Super admin and finance can delete payment settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin and finance can delete payment settings" ON public.company_payment_settings FOR DELETE USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text]))))));


--
-- Name: company_payment_settings Super admin and finance can insert payment settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin and finance can insert payment settings" ON public.company_payment_settings FOR INSERT WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text]))))));


--
-- Name: company_payment_settings Super admin and finance can update payment settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin and finance can update payment settings" ON public.company_payment_settings FOR UPDATE USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text])))))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text]))))));


--
-- Name: agent_inventory Super admin can delete agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete agent_inventory in their company" ON public.agent_inventory FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: brands Super admin can delete brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete brands in their company" ON public.brands FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_order_items Super admin can delete client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete client_order_items in their company" ON public.client_order_items FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_orders Super admin can delete client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete client_orders in their company" ON public.client_orders FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: clients Super admin can delete clients in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete clients in their company" ON public.clients FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: financial_transactions Super admin can delete financial_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete financial_transactions in their company" ON public.financial_transactions FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: inventory_transactions Super admin can delete inventory_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete inventory_transactions in their company" ON public.inventory_transactions FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: leader_teams Super admin can delete leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete leader_teams in their company" ON public.leader_teams FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: main_inventory Super admin can delete main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete main_inventory in their company" ON public.main_inventory FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: notifications Super admin can delete notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete notifications in their company" ON public.notifications FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: profiles Super admin can delete profiles in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete profiles in their company" ON public.profiles FOR DELETE USING ((public.is_auth_super_admin() AND (company_id = public.get_auth_super_admin_company_id()) AND (id <> auth.uid())));


--
-- Name: purchase_order_items Super admin can delete purchase_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete purchase_order_items in their company" ON public.purchase_order_items FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: purchase_orders Super admin can delete purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete purchase_orders in their company" ON public.purchase_orders FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: remittances_log Super admin can delete remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete remittances_log in their company" ON public.remittances_log FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_request_items Super admin can delete stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete stock_request_items in their company" ON public.stock_request_items FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_requests Super admin can delete stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete stock_requests in their company" ON public.stock_requests FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: suppliers Super admin can delete suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete suppliers in their company" ON public.suppliers FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: variants Super admin can delete variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can delete variants in their company" ON public.variants FOR DELETE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: agent_inventory Super admin can insert agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert agent_inventory in their company" ON public.agent_inventory FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: brands Super admin can insert brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert brands in their company" ON public.brands FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_order_items Super admin can insert client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert client_order_items in their company" ON public.client_order_items FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_orders Super admin can insert client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert client_orders in their company" ON public.client_orders FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: clients Super admin can insert clients in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert clients in their company" ON public.clients FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: financial_transactions Super admin can insert financial_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert financial_transactions in their company" ON public.financial_transactions FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: inventory_transactions Super admin can insert inventory_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert inventory_transactions in their company" ON public.inventory_transactions FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: leader_teams Super admin can insert leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert leader_teams in their company" ON public.leader_teams FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: main_inventory Super admin can insert main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert main_inventory in their company" ON public.main_inventory FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: notifications Super admin can insert notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert notifications in their company" ON public.notifications FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: profiles Super admin can insert profiles in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert profiles in their company" ON public.profiles FOR INSERT WITH CHECK ((public.is_auth_super_admin() AND (company_id = public.get_auth_super_admin_company_id())));


--
-- Name: purchase_order_items Super admin can insert purchase_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert purchase_order_items in their company" ON public.purchase_order_items FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: purchase_orders Super admin can insert purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert purchase_orders in their company" ON public.purchase_orders FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: remittances_log Super admin can insert remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert remittances_log in their company" ON public.remittances_log FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_request_items Super admin can insert stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert stock_request_items in their company" ON public.stock_request_items FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_requests Super admin can insert stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert stock_requests in their company" ON public.stock_requests FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: suppliers Super admin can insert suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert suppliers in their company" ON public.suppliers FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: variants Super admin can insert variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can insert variants in their company" ON public.variants FOR INSERT WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: agent_inventory Super admin can update all agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all agent_inventory in their company" ON public.agent_inventory FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: brands Super admin can update all brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all brands in their company" ON public.brands FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_order_items Super admin can update all client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all client_order_items in their company" ON public.client_order_items FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_orders Super admin can update all client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all client_orders in their company" ON public.client_orders FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: clients Super admin can update all clients in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all clients in their company" ON public.clients FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: financial_transactions Super admin can update all financial_transactions in their comp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all financial_transactions in their comp" ON public.financial_transactions FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: inventory_transactions Super admin can update all inventory_transactions in their comp; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all inventory_transactions in their comp" ON public.inventory_transactions FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: leader_teams Super admin can update all leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all leader_teams in their company" ON public.leader_teams FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: main_inventory Super admin can update all main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all main_inventory in their company" ON public.main_inventory FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: notifications Super admin can update all notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all notifications in their company" ON public.notifications FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: profiles Super admin can update all profiles in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all profiles in their company" ON public.profiles FOR UPDATE USING ((public.is_auth_super_admin() AND (company_id = public.get_auth_super_admin_company_id()))) WITH CHECK ((public.is_auth_super_admin() AND (company_id = public.get_auth_super_admin_company_id())));


--
-- Name: purchase_order_items Super admin can update all purchase_order_items in their compan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all purchase_order_items in their compan" ON public.purchase_order_items FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: purchase_orders Super admin can update all purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all purchase_orders in their company" ON public.purchase_orders FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: remittances_log Super admin can update all remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all remittances_log in their company" ON public.remittances_log FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_request_items Super admin can update all stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all stock_request_items in their company" ON public.stock_request_items FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_requests Super admin can update all stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all stock_requests in their company" ON public.stock_requests FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: suppliers Super admin can update all suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all suppliers in their company" ON public.suppliers FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: variants Super admin can update all variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can update all variants in their company" ON public.variants FOR UPDATE USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id()))) WITH CHECK ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: agent_inventory Super admin can view all agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all agent_inventory in their company" ON public.agent_inventory FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: brands Super admin can view all brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all brands in their company" ON public.brands FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_order_items Super admin can view all client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all client_order_items in their company" ON public.client_order_items FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: client_orders Super admin can view all client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all client_orders in their company" ON public.client_orders FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: clients Super admin can view all clients in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all clients in their company" ON public.clients FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: financial_transactions Super admin can view all financial_transactions in their compan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all financial_transactions in their compan" ON public.financial_transactions FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: inventory_transactions Super admin can view all inventory_transactions in their compan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all inventory_transactions in their compan" ON public.inventory_transactions FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: leader_teams Super admin can view all leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all leader_teams in their company" ON public.leader_teams FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: main_inventory Super admin can view all main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all main_inventory in their company" ON public.main_inventory FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: notifications Super admin can view all notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all notifications in their company" ON public.notifications FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: profiles Super admin can view all profiles in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all profiles in their company" ON public.profiles FOR SELECT USING ((public.is_auth_super_admin() AND (company_id = public.get_auth_super_admin_company_id())));


--
-- Name: purchase_order_items Super admin can view all purchase_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all purchase_order_items in their company" ON public.purchase_order_items FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: purchase_orders Super admin can view all purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all purchase_orders in their company" ON public.purchase_orders FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: remittances_log Super admin can view all remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all remittances_log in their company" ON public.remittances_log FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_request_items Super admin can view all stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all stock_request_items in their company" ON public.stock_request_items FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: stock_requests Super admin can view all stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all stock_requests in their company" ON public.stock_requests FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: suppliers Super admin can view all suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all suppliers in their company" ON public.suppliers FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: variants Super admin can view all variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all variants in their company" ON public.variants FOR SELECT USING ((public.is_super_admin() AND (company_id = public.get_super_admin_company_id())));


--
-- Name: events Super admins can view all events in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can view all events in their company" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text) AND (profiles.company_id = events.company_id)))));


--
-- Name: companies System administrators can delete companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can delete companies" ON public.companies FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text)))));


--
-- Name: companies System administrators can insert companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can insert companies" ON public.companies FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text)))));


--
-- Name: executive_company_assignments System administrators can manage executive assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can manage executive assignments" ON public.executive_company_assignments USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text)))));


--
-- Name: companies System administrators can update companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can update companies" ON public.companies FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text)))));


--
-- Name: agent_inventory System administrators can view all agent_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all agent_inventory" ON public.agent_inventory FOR SELECT USING (public.is_system_administrator());


--
-- Name: brands System administrators can view all brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all brands" ON public.brands FOR SELECT USING (public.is_system_administrator());


--
-- Name: client_order_items System administrators can view all client_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all client_order_items" ON public.client_order_items FOR SELECT USING (public.is_system_administrator());


--
-- Name: client_orders System administrators can view all client_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all client_orders" ON public.client_orders FOR SELECT USING (public.is_system_administrator());


--
-- Name: clients System administrators can view all clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all clients" ON public.clients FOR SELECT USING (public.is_system_administrator());


--
-- Name: companies System administrators can view all companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all companies" ON public.companies FOR SELECT USING (public.is_system_administrator());


--
-- Name: events System administrators can view all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all events" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text)))));


--
-- Name: financial_transactions System administrators can view all financial_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all financial_transactions" ON public.financial_transactions FOR SELECT USING (public.is_system_administrator());


--
-- Name: inventory_transactions System administrators can view all inventory_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all inventory_transactions" ON public.inventory_transactions FOR SELECT USING (public.is_system_administrator());


--
-- Name: leader_teams System administrators can view all leader_teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all leader_teams" ON public.leader_teams FOR SELECT USING (public.is_system_administrator());


--
-- Name: main_inventory System administrators can view all main_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all main_inventory" ON public.main_inventory FOR SELECT USING (public.is_system_administrator());


--
-- Name: notifications System administrators can view all notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all notifications" ON public.notifications FOR SELECT USING (public.is_system_administrator());


--
-- Name: profiles System administrators can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all profiles" ON public.profiles FOR SELECT USING (public.is_auth_system_admin());


--
-- Name: purchase_order_items System administrators can view all purchase_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all purchase_order_items" ON public.purchase_order_items FOR SELECT USING (public.is_system_administrator());


--
-- Name: purchase_orders System administrators can view all purchase_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all purchase_orders" ON public.purchase_orders FOR SELECT USING (public.is_system_administrator());


--
-- Name: remittances_log System administrators can view all remittances_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all remittances_log" ON public.remittances_log FOR SELECT USING (public.is_system_administrator());


--
-- Name: stock_request_items System administrators can view all stock_request_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all stock_request_items" ON public.stock_request_items FOR SELECT USING (public.is_system_administrator());


--
-- Name: stock_requests System administrators can view all stock_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all stock_requests" ON public.stock_requests FOR SELECT USING (public.is_system_administrator());


--
-- Name: suppliers System administrators can view all suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all suppliers" ON public.suppliers FOR SELECT USING (public.is_system_administrator());


--
-- Name: variants System administrators can view all variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System administrators can view all variants" ON public.variants FOR SELECT USING (public.is_system_administrator());


--
-- Name: inventory_return_items System can insert return items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert return items" ON public.inventory_return_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.inventory_returns
  WHERE ((inventory_returns.id = inventory_return_items.return_id) AND (inventory_returns.agent_id = auth.uid())))));


--
-- Name: inventory_returns System can update returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can update returns" ON public.inventory_returns FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text]))))));


--
-- Name: tl_stock_requests Team leaders can create requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team leaders can create requests" ON public.tl_stock_requests FOR INSERT WITH CHECK (((auth.uid() = requester_leader_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text) AND (profiles.company_id = tl_stock_requests.company_id))))));


--
-- Name: tl_stock_requests Team leaders can update for receipt; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team leaders can update for receipt" ON public.tl_stock_requests FOR UPDATE USING ((((auth.uid() = requester_leader_id) AND (status = 'pending_receipt'::text)) OR ((auth.uid() = source_leader_id) AND (status = 'pending_source_tl'::text))));


--
-- Name: tl_stock_requests Team leaders can view their own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team leaders can view their own requests" ON public.tl_stock_requests FOR SELECT USING ((((auth.uid() = requester_leader_id) OR (auth.uid() = source_leader_id)) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (profiles.company_id = tl_stock_requests.company_id))))));


--
-- Name: clients Team members can view company clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can view company clients" ON public.clients FOR SELECT TO authenticated USING ((company_id = public.get_auth_user_company_id()));


--
-- Name: cash_deposits Team members can view company deposits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can view company deposits" ON public.cash_deposits FOR SELECT TO authenticated USING ((company_id = public.get_auth_user_company_id()));


--
-- Name: profiles Team members can view company profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can view company profiles" ON public.profiles FOR SELECT TO authenticated USING ((company_id = public.get_auth_user_company_id()));


--
-- Name: agent_inventory Users can delete agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete agent_inventory in their company" ON public.agent_inventory FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: brands Users can delete brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete brands in their company" ON public.brands FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: client_brands Users can delete client brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete client brands" ON public.client_brands FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_brands.client_id) AND ((c.agent_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = auth.uid()) AND (p.company_id = c.company_id) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'team_leader'::text, 'executive'::text]))))))))));


--
-- Name: client_order_items Users can delete client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete client_order_items in their company" ON public.client_order_items FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: client_orders Users can delete client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete client_orders in their company" ON public.client_orders FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: clients Users can delete clients with proper permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete clients with proper permissions" ON public.clients FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) AND (profiles.company_id = clients.company_id)))));


--
-- Name: financial_transactions Users can delete financial_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete financial_transactions in their company" ON public.financial_transactions FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: inventory_transactions Users can delete inventory_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete inventory_transactions in their company" ON public.inventory_transactions FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: leader_teams Users can delete leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete leader_teams in their company" ON public.leader_teams FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: main_inventory Users can delete main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete main_inventory in their company" ON public.main_inventory FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: notifications Users can delete notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete notifications in their company" ON public.notifications FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: purchase_order_items Users can delete purchase_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete purchase_order_items in their company" ON public.purchase_order_items FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: purchase_orders Users can delete purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete purchase_orders in their company" ON public.purchase_orders FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: remittances_log Users can delete remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete remittances_log in their company" ON public.remittances_log FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: stock_request_items Users can delete stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete stock_request_items in their company" ON public.stock_request_items FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: stock_requests Users can delete stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete stock_requests in their company" ON public.stock_requests FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: suppliers Users can delete suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete suppliers in their company" ON public.suppliers FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: variants Users can delete variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete variants in their company" ON public.variants FOR DELETE USING ((company_id = public.get_auth_company_id()));


--
-- Name: agent_inventory Users can insert agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert agent_inventory in their company" ON public.agent_inventory FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: brands Users can insert brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert brands in their company" ON public.brands FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: cash_deposits Users can insert cash_deposits in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert cash_deposits in their company" ON public.cash_deposits FOR INSERT WITH CHECK ((company_id = public.get_my_company_id()));


--
-- Name: client_brands Users can insert client brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert client brands" ON public.client_brands FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_brands.client_id) AND ((c.agent_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = auth.uid()) AND (p.company_id = c.company_id) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'team_leader'::text, 'executive'::text]))))))))));


--
-- Name: client_order_items Users can insert client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert client_order_items in their company" ON public.client_order_items FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: client_orders Users can insert client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert client_orders in their company" ON public.client_orders FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: clients Users can insert clients with proper permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert clients with proper permissions" ON public.clients FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text) AND (profiles.company_id = clients.company_id)))) OR ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.company_id = clients.company_id)))) AND (agent_id = auth.uid())) OR ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mobile_sales'::text, 'team_leader'::text])) AND (profiles.company_id = clients.company_id)))) AND (agent_id = auth.uid()))));


--
-- Name: financial_transactions Users can insert financial_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert financial_transactions in their company" ON public.financial_transactions FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: inventory_transactions Users can insert inventory_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert inventory_transactions in their company" ON public.inventory_transactions FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: leader_teams Users can insert leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert leader_teams in their company" ON public.leader_teams FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: main_inventory Users can insert main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert main_inventory in their company" ON public.main_inventory FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: notifications Users can insert notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert notifications in their company" ON public.notifications FOR INSERT WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: purchase_order_items Users can insert purchase_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert purchase_order_items in their company" ON public.purchase_order_items FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: purchase_orders Users can insert purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert purchase_orders in their company" ON public.purchase_orders FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: remittances_log Users can insert remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert remittances_log in their company" ON public.remittances_log FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: shop_types Users can insert shop types for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert shop types for their company" ON public.shop_types FOR INSERT WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: stock_request_items Users can insert stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert stock_request_items in their company" ON public.stock_request_items FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: stock_requests Users can insert stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert stock_requests in their company" ON public.stock_requests FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: suppliers Users can insert suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert suppliers in their company" ON public.suppliers FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: variants Users can insert variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert variants in their company" ON public.variants FOR INSERT WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: brands Users can read brands from their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read brands from their company" ON public.brands FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.company_id = brands.company_id)))));


--
-- Name: variants Users can read variants from their company brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read variants from their company brands" ON public.variants FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.brands
     JOIN public.profiles ON ((profiles.company_id = brands.company_id)))
  WHERE ((brands.id = variants.brand_id) AND (profiles.id = auth.uid())))));


--
-- Name: profiles Users can see own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can see own profile" ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: agent_inventory Users can update agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update agent_inventory in their company" ON public.agent_inventory FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: brands Users can update brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update brands in their company" ON public.brands FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: cash_deposits Users can update cash_deposits in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update cash_deposits in their company" ON public.cash_deposits FOR UPDATE USING ((company_id = public.get_my_company_id())) WITH CHECK ((company_id = public.get_my_company_id()));


--
-- Name: client_order_items Users can update client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update client_order_items in their company" ON public.client_order_items FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: client_orders Users can update client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update client_orders in their company" ON public.client_orders FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: clients Users can update clients with proper permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update clients with proper permissions" ON public.clients FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text) AND (profiles.company_id = clients.company_id)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.company_id = clients.company_id)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text) AND (profiles.company_id = clients.company_id)))) OR ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'mobile_sales'::text) AND (profiles.company_id = clients.company_id)))) AND (agent_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team_leader'::text])) OR ((profiles.role = 'mobile_sales'::text) AND (clients.agent_id = auth.uid()))) AND (profiles.company_id = clients.company_id)))));


--
-- Name: financial_transactions Users can update financial_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update financial_transactions in their company" ON public.financial_transactions FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: inventory_transactions Users can update inventory_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update inventory_transactions in their company" ON public.inventory_transactions FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: leader_teams Users can update leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update leader_teams in their company" ON public.leader_teams FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: main_inventory Users can update main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update main_inventory in their company" ON public.main_inventory FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: notifications Users can update notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update notifications in their company" ON public.notifications FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: purchase_order_items Users can update purchase_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update purchase_order_items in their company" ON public.purchase_order_items FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: purchase_orders Users can update purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update purchase_orders in their company" ON public.purchase_orders FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: remittances_log Users can update remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update remittances_log in their company" ON public.remittances_log FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: stock_request_items Users can update stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update stock_request_items in their company" ON public.stock_request_items FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: stock_requests Users can update stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update stock_requests in their company" ON public.stock_requests FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: suppliers Users can update suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update suppliers in their company" ON public.suppliers FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: variants Users can update variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update variants in their company" ON public.variants FOR UPDATE USING ((company_id = public.get_auth_company_id())) WITH CHECK ((company_id = public.get_auth_company_id()));


--
-- Name: agent_inventory Users can view agent_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view agent_inventory in their company" ON public.agent_inventory FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: brands Users can view brands in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view brands in their company" ON public.brands FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: cash_deposits Users can view cash_deposits in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view cash_deposits in their company" ON public.cash_deposits FOR SELECT USING ((company_id = public.get_my_company_id()));


--
-- Name: client_brands Users can view client brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view client brands" ON public.client_brands FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_brands.client_id) AND (c.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))));


--
-- Name: client_order_items Users can view client_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view client_order_items in their company" ON public.client_order_items FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: client_orders Users can view client_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view client_orders in their company" ON public.client_orders FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: clients Users can view clients with proper permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view clients with proper permissions" ON public.clients FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text) AND (profiles.company_id = clients.company_id)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text) AND (profiles.company_id = clients.company_id)))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text) AND (profiles.company_id = clients.company_id)))) OR ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'mobile_sales'::text) AND (profiles.company_id = clients.company_id)))) AND (agent_id = auth.uid()))));


--
-- Name: financial_transactions Users can view financial_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view financial_transactions in their company" ON public.financial_transactions FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: inventory_transactions Users can view inventory_transactions in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view inventory_transactions in their company" ON public.inventory_transactions FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: leader_teams Users can view leader_teams in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view leader_teams in their company" ON public.leader_teams FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: main_inventory Users can view main_inventory in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view main_inventory in their company" ON public.main_inventory FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: notifications Users can view notifications in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view notifications in their company" ON public.notifications FOR SELECT USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can view profiles in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view profiles in their company" ON public.profiles FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: purchase_order_items Users can view purchase_order_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view purchase_order_items in their company" ON public.purchase_order_items FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: purchase_orders Users can view purchase_orders in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view purchase_orders in their company" ON public.purchase_orders FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: remittances_log Users can view remittances_log in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view remittances_log in their company" ON public.remittances_log FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: inventory_return_items Users can view return items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view return items" ON public.inventory_return_items FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.inventory_returns
  WHERE ((inventory_returns.id = inventory_return_items.return_id) AND ((inventory_returns.agent_id = auth.uid()) OR (inventory_returns.receiver_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text])))))));


--
-- Name: stock_request_items Users can view stock_request_items in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view stock_request_items in their company" ON public.stock_request_items FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: stock_requests Users can view stock_requests in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view stock_requests in their company" ON public.stock_requests FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: suppliers Users can view suppliers in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view suppliers in their company" ON public.suppliers FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: company_payment_settings Users can view their company payment settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their company payment settings" ON public.company_payment_settings FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: shop_types Users can view their company shop types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their company shop types" ON public.shop_types FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: companies Users can view their own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own company" ON public.companies FOR SELECT USING ((id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: inventory_returns Users can view their own returns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own returns" ON public.inventory_returns FOR SELECT USING (((agent_id = auth.uid()) OR (receiver_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text])))))));


--
-- Name: variant_types Users can view variant types in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view variant types in their company" ON public.variant_types FOR SELECT USING ((company_id = public.get_my_company_id()));


--
-- Name: variants Users can view variants in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view variants in their company" ON public.variants FOR SELECT USING ((company_id = public.get_auth_company_id()));


--
-- Name: agent_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_monthly_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_monthly_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: business_audit_log business_audit_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_audit_insert_policy ON public.business_audit_log FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['system_administrator'::text, 'super_admin'::text, 'admin'::text]))))));


--
-- Name: business_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: business_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: business_operations business_operations_agent_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_operations_agent_view ON public.business_operations FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mobile_sales'::text, 'sales_agent'::text])))))));


--
-- Name: business_operations business_operations_executive_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_operations_executive_view ON public.business_operations FOR SELECT TO authenticated USING ((company_id IN ( SELECT executive_company_assignments.company_id
   FROM public.executive_company_assignments
  WHERE (executive_company_assignments.executive_id = auth.uid()))));


--
-- Name: business_operations business_operations_finance_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_operations_finance_view ON public.business_operations FOR SELECT TO authenticated USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'finance'::text)))) AND (operation_category = ANY (ARRAY['order'::text, 'finance'::text]))));


--
-- Name: business_operations business_operations_leader_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_operations_leader_view ON public.business_operations FOR SELECT TO authenticated USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text)))) AND ((user_id = auth.uid()) OR (user_id IN ( SELECT leader_teams.agent_id
   FROM public.leader_teams
  WHERE (leader_teams.leader_id = auth.uid()))))));


--
-- Name: business_operations business_operations_manager_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_operations_manager_view ON public.business_operations FOR SELECT TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));


--
-- Name: business_operations business_operations_super_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_operations_super_admin_all ON public.business_operations TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'system_administrator'::text]))))));


--
-- Name: cash_deposits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_deposits ENABLE ROW LEVEL SECURITY;

--
-- Name: client_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: client_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: client_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_payment_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_payment_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: executive_company_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.executive_company_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: system_audit_log finance_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_audit_access ON public.system_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'finance'::text)))) AND (table_name = ANY (ARRAY['client_orders'::text, 'cash_deposits'::text, 'financial_transactions'::text, 'purchase_orders'::text, 'remittances_log'::text, 'client_order_items'::text, 'purchase_order_items'::text]))));


--
-- Name: POLICY finance_audit_access ON system_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY finance_audit_access ON public.system_audit_log IS 'Finance users can only view financial-related audit logs';


--
-- Name: business_audit_log finance_business_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_business_audit_access ON public.business_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'finance'::text)))) AND (action_category = ANY (ARRAY['orders'::text, 'finance'::text, 'cash_deposits'::text, 'purchase_orders'::text]))));


--
-- Name: financial_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: leader_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leader_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: main_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.main_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: system_audit_log manager_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY manager_audit_access ON public.system_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))) AND ((user_id = auth.uid()) OR (user_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE ((profiles.role = 'team_leader'::text) AND (profiles.company_id = ( SELECT profiles_1.company_id
           FROM public.profiles profiles_1
          WHERE (profiles_1.id = auth.uid())))))) OR (user_id IN ( SELECT leader_teams.agent_id
   FROM public.leader_teams
  WHERE (leader_teams.leader_id IN ( SELECT profiles.id
           FROM public.profiles
          WHERE ((profiles.role = 'team_leader'::text) AND (profiles.company_id = ( SELECT profiles_1.company_id
                   FROM public.profiles profiles_1
                  WHERE (profiles_1.id = auth.uid())))))))))));


--
-- Name: POLICY manager_audit_access ON system_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY manager_audit_access ON public.system_audit_log IS 'Managers can view audit logs for their teams and sub-teams';


--
-- Name: business_audit_log manager_business_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY manager_business_audit_access ON public.business_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))) AND ((user_id = auth.uid()) OR (user_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE ((profiles.role = 'team_leader'::text) AND (profiles.company_id = ( SELECT profiles_1.company_id
           FROM public.profiles profiles_1
          WHERE (profiles_1.id = auth.uid())))))) OR (user_id IN ( SELECT leader_teams.agent_id
   FROM public.leader_teams
  WHERE (leader_teams.leader_id IN ( SELECT profiles.id
           FROM public.profiles
          WHERE ((profiles.role = 'team_leader'::text) AND (profiles.company_id = ( SELECT profiles_1.company_id
                   FROM public.profiles profiles_1
                  WHERE (profiles_1.id = auth.uid())))))))))));


--
-- Name: system_audit_log mobile_sales_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mobile_sales_audit_access ON public.system_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mobile_sales'::text, 'sales_agent'::text])))))));


--
-- Name: POLICY mobile_sales_audit_access ON system_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY mobile_sales_audit_access ON public.system_audit_log IS 'Mobile sales and sales agents can only view their own audit logs';


--
-- Name: business_audit_log mobile_sales_business_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mobile_sales_business_audit_access ON public.business_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['mobile_sales'::text, 'sales_agent'::text])))))));


--
-- Name: system_audit_log no_deletes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_deletes ON public.system_audit_log FOR DELETE USING (false);


--
-- Name: business_audit_log no_deletes_business; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_deletes_business ON public.business_audit_log FOR DELETE USING (false);


--
-- Name: system_audit_log no_direct_modifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_direct_modifications ON public.system_audit_log FOR INSERT WITH CHECK (false);


--
-- Name: system_audit_log no_updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_updates ON public.system_audit_log FOR UPDATE USING (false);


--
-- Name: business_audit_log no_updates_business; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_updates_business ON public.business_audit_log FOR UPDATE USING (false);


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: remittances_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.remittances_log ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop_types ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_request_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_request_items ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: sub_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sub_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: system_audit_log super_admin_admin_all_audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_admin_all_audit ON public.system_audit_log FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: POLICY super_admin_admin_all_audit ON system_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY super_admin_admin_all_audit ON public.system_audit_log IS 'Super admins and admins can view all audit logs in their company';


--
-- Name: business_audit_log super_admin_admin_all_business_audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_admin_all_business_audit ON public.business_audit_log FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: system_audit_log system_administrator_all_audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY system_administrator_all_audit ON public.system_audit_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text)))));


--
-- Name: business_audit_log system_administrator_all_business_audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY system_administrator_all_business_audit ON public.business_audit_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'system_administrator'::text)))));


--
-- Name: system_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: system_audit_log team_leader_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_leader_audit_access ON public.system_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text)))) AND ((user_id = auth.uid()) OR (user_id IN ( SELECT leader_teams.agent_id
   FROM public.leader_teams
  WHERE (leader_teams.leader_id = auth.uid()))))));


--
-- Name: POLICY team_leader_audit_access ON system_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY team_leader_audit_access ON public.system_audit_log IS 'Team leaders can view audit logs for their assigned agents';


--
-- Name: business_audit_log team_leader_business_audit_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_leader_business_audit_access ON public.business_audit_log FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text)))) AND ((user_id = auth.uid()) OR (user_id IN ( SELECT leader_teams.agent_id
   FROM public.leader_teams
  WHERE (leader_teams.leader_id = auth.uid()))))));


--
-- Name: tl_stock_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tl_stock_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: variant_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variant_types ENABLE ROW LEVEL SECURITY;

--
-- Name: variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.variants ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Admins can delete signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can delete signatures" ON storage.objects FOR DELETE USING (((bucket_id = 'tl-stock-request-signatures'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: objects Admins can manage all client COR in their company; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can manage all client COR in their company" ON storage.objects TO authenticated USING (((bucket_id = 'client-cor'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text]))))))) WITH CHECK (((bucket_id = 'client-cor'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'system_administrator'::text])))))));


--
-- Name: objects Admins can manage all client photos in their company; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can manage all client photos in their company" ON storage.objects TO authenticated USING (((bucket_id = 'client-photos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))))) WITH CHECK (((bucket_id = 'client-photos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: objects Admins can view all company signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can view all company signatures" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'tl-stock-request-signatures'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND ((profiles.company_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Allow authenticated uploads; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'daily-attachments'::text));


--
-- Name: objects Allow authenticated users to read remittance signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated users to read remittance signatures" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'remittance-signatures'::text));


--
-- Name: objects Allow public view; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow public view" ON storage.objects FOR SELECT USING ((bucket_id = 'daily-attachments'::text));


--
-- Name: objects Allow users to delete own files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow users to delete own files" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'daily-attachments'::text) AND (auth.uid() = owner)));


--
-- Name: objects Authenticated users can delete client photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can delete client photos" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'client-photos'::text));


--
-- Name: objects Authenticated users can update client photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can update client photos" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'client-photos'::text)) WITH CHECK ((bucket_id = 'client-photos'::text));


--
-- Name: objects Authenticated users can upload client photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload client photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'client-photos'::text));


--
-- Name: objects Authenticated users can upload deposit slips; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload deposit slips" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'cash-deposits'::text));


--
-- Name: objects Authenticated users can upload payment proofs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload payment proofs" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'payment-proofs'::text));


--
-- Name: objects Authenticated users can upload remittance signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload remittance signatures" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'remittance-signatures'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects Authenticated users can upload signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload signatures" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'client-signatures'::text));


--
-- Name: objects Authenticated users can view client photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can view client photos" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'client-photos'::text));


--
-- Name: objects Authenticated users can view deposit slips; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can view deposit slips" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'cash-deposits'::text));


--
-- Name: objects Authenticated users can view payment proofs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can view payment proofs" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'payment-proofs'::text));


--
-- Name: objects Authenticated users can view remittance signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can view remittance signatures" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'remittance-signatures'::text) AND (auth.uid() IS NOT NULL)));


--
-- Name: objects Authenticated users can view signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can view signatures" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'client-signatures'::text));


--
-- Name: objects Public can view payment QR codes; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public can view payment QR codes" ON storage.objects FOR SELECT USING ((bucket_id = 'payment-qr-codes'::text));


--
-- Name: objects Super admin and finance can delete payment QR codes; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Super admin and finance can delete payment QR codes" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'payment-qr-codes'::text) AND (auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text]))))));


--
-- Name: objects Super admin and finance can update payment QR codes; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Super admin and finance can update payment QR codes" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'payment-qr-codes'::text) AND (auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text])))))) WITH CHECK (((bucket_id = 'payment-qr-codes'::text) AND (auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text]))))));


--
-- Name: objects Super admin and finance can upload payment QR codes; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Super admin and finance can upload payment QR codes" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'payment-qr-codes'::text) AND (auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.role = ANY (ARRAY['super_admin'::text, 'finance'::text]))))));


--
-- Name: objects Team leaders can upload signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Team leaders can upload signatures" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'tl-stock-request-signatures'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'team_leader'::text))))));


--
-- Name: objects Users can delete their own client COR; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can delete their own client COR" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'client-cor'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Users can delete their own client photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can delete their own client photos" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'client-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Users can delete their own deposit slips; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can delete their own deposit slips" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'cash-deposits'::text) AND (owner = auth.uid())));


--
-- Name: objects Users can delete their own payment proofs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can delete their own payment proofs" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'payment-proofs'::text) AND (owner = auth.uid())));


--
-- Name: objects Users can delete their own remittance signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can delete their own remittance signatures" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'remittance-signatures'::text) AND (auth.uid() IS NOT NULL) AND (owner = auth.uid())));


--
-- Name: objects Users can update their own client COR; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can update their own client COR" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'client-cor'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'client-cor'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Users can update their own client photos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can update their own client photos" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'client-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'client-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Users can update their own deposit slips; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can update their own deposit slips" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'cash-deposits'::text) AND (owner = auth.uid())));


--
-- Name: objects Users can update their own payment proofs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can update their own payment proofs" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'payment-proofs'::text) AND (owner = auth.uid()))) WITH CHECK (((bucket_id = 'payment-proofs'::text) AND (owner = auth.uid())));


--
-- Name: objects Users can update their own remittance signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can update their own remittance signatures" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'remittance-signatures'::text) AND (auth.uid() IS NOT NULL) AND (owner = auth.uid()))) WITH CHECK (((bucket_id = 'remittance-signatures'::text) AND (auth.uid() IS NOT NULL) AND (owner = auth.uid())));


--
-- Name: objects Users can upload client COR for their company; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can upload client COR for their company" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'client-cor'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Users can upload client photos for their company; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can upload client photos for their company" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'client-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Users can view client COR from their company; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can view client COR from their company" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'client-cor'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p1,
    public.profiles p2
  WHERE ((p1.id = auth.uid()) AND ((p2.id)::text = (storage.foldername(objects.name))[1]) AND (p1.company_id = p2.company_id)))) OR ((storage.foldername(name))[1] IN ( SELECT (profiles.company_id)::text AS company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))))));


--
-- Name: objects Users can view client photos from their company; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can view client photos from their company" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'client-photos'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p1,
    public.profiles p2
  WHERE ((p1.id = auth.uid()) AND ((p2.id)::text = (storage.foldername(objects.name))[1]) AND (p1.company_id = p2.company_id)))) OR ((storage.foldername(name))[1] IN ( SELECT (profiles.company_id)::text AS company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))))));


--
-- Name: objects Users can view request signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can view request signatures" ON storage.objects FOR SELECT USING (((bucket_id = 'tl-stock-request-signatures'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'team_leader'::text])))))));


--
-- Name: objects Users can view their company signatures; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can view their company signatures" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'tl-stock-request-signatures'::text) AND ((storage.foldername(name))[1] IN ( SELECT (profiles.company_id)::text AS company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime agent_inventory; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.agent_inventory;


--
-- Name: supabase_realtime brands; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.brands;


--
-- Name: supabase_realtime cash_deposits; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.cash_deposits;


--
-- Name: supabase_realtime client_order_items; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.client_order_items;


--
-- Name: supabase_realtime client_orders; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.client_orders;


--
-- Name: supabase_realtime clients; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.clients;


--
-- Name: supabase_realtime companies; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.companies;


--
-- Name: supabase_realtime company_payment_settings; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.company_payment_settings;


--
-- Name: supabase_realtime events; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.events;


--
-- Name: supabase_realtime executive_company_assignments; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.executive_company_assignments;


--
-- Name: supabase_realtime financial_transactions; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.financial_transactions;


--
-- Name: supabase_realtime inventory_returns; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.inventory_returns;


--
-- Name: supabase_realtime inventory_transactions; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.inventory_transactions;


--
-- Name: supabase_realtime leader_teams; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.leader_teams;


--
-- Name: supabase_realtime main_inventory; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.main_inventory;


--
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notifications;


--
-- Name: supabase_realtime profiles; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.profiles;


--
-- Name: supabase_realtime purchase_order_items; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.purchase_order_items;


--
-- Name: supabase_realtime purchase_orders; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.purchase_orders;


--
-- Name: supabase_realtime remittances_log; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.remittances_log;


--
-- Name: supabase_realtime stock_request_items; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.stock_request_items;


--
-- Name: supabase_realtime stock_requests; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.stock_requests;


--
-- Name: supabase_realtime suppliers; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.suppliers;


--
-- Name: supabase_realtime system_audit_log; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.system_audit_log;


--
-- Name: supabase_realtime variant_types; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.variant_types;


--
-- Name: supabase_realtime variants; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.variants;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict sYU3ZuzhA8LUzmVUo5VCq8yGnTGF0VN4ND7Qq2xb4nZecw0D4b9Ol5mbGlxPJe4

