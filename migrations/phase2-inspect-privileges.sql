-- Read-only metadata inspection. Run as the actual application connection role.
SELECT current_user, session_user, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname = current_user;
SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public';
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' ORDER BY table_name, grantee, privilege_type;
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
WHERE pg_has_role(current_user, oid, 'MEMBER');

-- Counts only; do not output customer addresses/order bodies.
SELECT count(*) AS invalid_carts FROM public.cart_items WHERE quantity NOT BETWEEN 1 AND 99;
SELECT count(*) AS invalid_products FROM public.products WHERE inventory_count < 0 OR price_cents < 0;
SELECT count(*) AS invalid_order_items FROM public.order_items WHERE quantity <= 0 OR unit_price_cents < 0;
SELECT count(*) AS invalid_orders FROM public.orders WHERE total_amount_cents < 0;
SELECT count(*) AS duplicate_default_customers FROM
  (SELECT user_id FROM public.addresses WHERE is_default GROUP BY user_id HAVING count(*) > 1) duplicates;
