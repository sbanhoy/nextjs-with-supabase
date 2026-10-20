-- 002_catalog_products.sql — Danh mục sản phẩm khớp 7 nhóm trên vay.kimminso.com
-- Idempotent: chạy lại nhiều lần không lỗi.

insert into public.products (code, name, category, is_active) values
  ('vay-the-chap','Vay thế chấp bất động sản','vay',true),
  ('vay-tieu-dung-linh-hoat','Vay tiêu dùng linh hoạt','vay',true),
  ('vay-mua-xe','Vay mua xe','vay',true),
  ('vay-kinh-doanh','Vay kinh doanh','vay',true),
  ('vay-tra-no','Trả nợ khoản vay ngân hàng khác','vay',true),
  ('tiet-kiem-ky-han','Tiết kiệm có kỳ hạn','huy-dong',true),
  ('tiet-kiem-nhan-doi','Tiết kiệm nhân đôi lãi suất','huy-dong',true),
  ('tien-gui-tich-luy','Tiền gửi tích lũy','huy-dong',true),
  ('tai-khoan-spayroll','Tài khoản S-Payroll','huy-dong',true),
  ('tai-khoan-kstudy','Tài khoản K-Study','huy-dong',true),
  ('the-tin-dung','Thẻ tín dụng','the',true),
  ('the-ghi-no','Thẻ ghi nợ','the',true),
  ('the-doanh-nghiep','Thẻ doanh nghiệp','the',true),
  ('the-supreme','Thẻ Shinhan Supreme','the',true),
  ('chuyen-tien-quoc-te','Chuyển tiền quốc tế','quoc-te',true),
  ('thu-tin-dung-lc','Thư tín dụng L/C','quoc-te',true),
  ('nho-thu','Nhờ thu','quoc-te',true),
  ('mua-ban-ngoai-te','Mua bán ngoại tệ','quoc-te',true),
  ('bh-nhan-tho','Bảo hiểm nhân thọ','bao-hiem',true),
  ('bh-phi-nhan-tho','Bảo hiểm phi nhân thọ','bao-hiem',true),
  ('bh-suc-khoe','Bảo hiểm sức khỏe','bao-hiem',true),
  ('bh-khoan-vay','Bảo hiểm khoản vay','bao-hiem',true),
  ('qr-code','QR code','thanh-toan',true),
  ('may-pos','Máy POS','thanh-toan',true),
  ('loa-bao-giao-dich','Loa báo giao dịch','thanh-toan',true),
  ('phan-mem-ban-hang','Phần mềm bán hàng','thanh-toan',true),
  ('tu-van-dau-tu','Tư vấn đầu tư','pwm',true),
  ('quan-ly-tai-san','Quản lý tài sản','pwm',true),
  ('ke-hoach-tai-chinh','Kế hoạch tài chính','pwm',true)
on conflict (code) do update set name = excluded.name, category = excluded.category, is_active = true;

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

  insert into public.customers (rm_id, full_name, phone, segment, aum, aum_3m_ago, stage, source, note)
  values (
    v_rm, left(v_name, 80), v_phone, 'mass', 0, 0, 'lead', 'vay.kimminso.com',
    'Form web: ' || left(btrim(coalesce(p_note, '')), 300)
      || ' · Đồng ý liên hệ lúc '
      || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
  )
  on conflict (phone) do nothing;
  v_new := found;

  select id into v_customer from public.customers where phone = v_phone;

  if btrim(coalesce(p_product, '')) <> '' then
    select id into v_product
    from public.products
    where code = btrim(p_product) and is_active;
    if v_product is not null then
      insert into public.product_holdings (customer_id, product_id, status)
      select v_customer, v_product, 'interested'
      where not exists (
        select 1 from public.product_holdings
        where customer_id = v_customer and product_id = v_product
      );
    end if;
  end if;

  return case when v_new then 'ok' else 'duplicate' end;
end;
$$;

comment on function public.fn_web_lead(text, text, text, text)
  is 'Nhận lead từ form vay.kimminso.com, ghi khách và sản phẩm quan tâm. Chỉ chèn, không đọc dữ liệu khác.';

drop function if exists public.fn_web_lead(text, text, text);

revoke all on function public.fn_web_lead(text, text, text, text) from public;
grant execute on function public.fn_web_lead(text, text, text, text) to anon;
