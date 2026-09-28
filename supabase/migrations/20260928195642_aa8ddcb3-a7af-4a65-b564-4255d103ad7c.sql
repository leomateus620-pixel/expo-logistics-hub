REVOKE EXECUTE ON FUNCTION public.confirm_sale_order_items(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_sale_order_items(uuid, uuid[], text) FROM PUBLIC, anon;