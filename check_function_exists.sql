-- Test if the create_user_profile function exists
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'create_user_profile';

-- If the function doesn't exist, this will show no results
-- If it exists, you'll see one row with the function details
