-- Add order_index column to user_categories
ALTER TABLE public.user_categories ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Initialize order_index based on current alphabetical order for each user
DO $$
BEGIN
    WITH numbered_categories AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY name) - 1 as new_order
        FROM public.user_categories
    )
    UPDATE public.user_categories uc
    SET order_index = nc.new_order
    FROM numbered_categories nc
    WHERE uc.id = nc.id;
END $$;
