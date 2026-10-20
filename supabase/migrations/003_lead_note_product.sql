-- 003_lead_note_product.sql — Ghi tên sản phẩm khách chọn vào note để email/CRM đọc được ngay.
-- Idempotent: create or replace.

create or replace function public.fn_web_lead(
  p_name text,
  p_phone text,
  p_note text default '',
  p_product text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_rm uuid;
  v_recent integer;
  v_customer uuid;
  v_product uuid;
  v_product_name text;
  v_new boolean;
begin
  v_name := btrim(coalesce(p_name, ''));
  if length(v_name) < 2 or length(v_name) > 80 then
    return 'invalid_name';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if left(v_phone, 1) = '+' then
    v_phone := substr(v_phone, 2);
  end if;
  if left(v_phone, 2) = '84' and length(v_phone) = 11 then
    v_phone := '0' || substr(v_phone, 3);
  end if;
  if v_phone !~ '^0[35789][0-9]{8}$' then
    return 'invalid_phone';
  end if;

  select count(*) into v_recent
  from public.customers
  where source = 'vay.kimminso.com'
    and created_at > now() - interval '1 minute';
  if v_recent >= 5 then
    return 'rate_limited';
  end if;

  select id into v_rm
  from public.rm_users
  where role = 'admin'
  order by created_at
  limit 1;
  if v_rm is null then
    return 'no_rm';
  end if;

  if btrim(coalesce(p_product, '')) <> '' then
    select id, name into v_product, v_product_name
    from public.products
    where code = btrim(p_product) and is_active;
  end if;

  insert into public.customers (rm_id, full_name, phone, segment, aum, aum_3m_ago, stage, source, note)
  values (
    v_rm, left(v_name, 80), v_phone, 'mass', 0, 0, 'lead', 'vay.kimminso.com',
    'Form web: ' || left(btrim(coalesce(p_note, '')), 300)
      || case when v_product_name is not null then ' · Sản phẩm: ' || v_product_name else '' end
      || ' · Đồng ý liên hệ lúc '
      || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
  )
  on conflict (phone) do nothing;
  v_new := found;

  select id into v_customer from public.customers where phone = v_phone;

  if v_product is not null then
    insert into public.product_holdings (customer_id, product_id, status)
    select v_customer, v_product, 'interested'
    where not exists (
      select 1 from public.product_holdings
      where customer_id = v_customer and product_id = v_product
    );
  end if;

  return case when v_new then 'ok' else 'duplicate' end;
end;
$$;

revoke all on function public.fn_web_lead(text, text, text, text) from public;
grant execute on function public.fn_web_lead(text, text, text, text) to anon;
