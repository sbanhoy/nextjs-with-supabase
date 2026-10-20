-- 001_web_lead.sql — Hàm nhận lead từ form trên vay.kimminso.com
-- Idempotent: chạy lại nhiều lần không lỗi.
-- Chỉ anon được gọi hàm này. Hàm chỉ chèn vào customers, không đọc dữ liệu khách.

create or replace function public.fn_web_lead(
  p_name text,
  p_phone text,
  p_note text default ''
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

  insert into public.customers (
    rm_id, full_name, phone, segment, aum, aum_3m_ago, stage, source, note
  )
  values (
    v_rm,
    left(v_name, 80),
    v_phone,
    'mass',
    0,
    0,
    'lead',
    'vay.kimminso.com',
    'Form web: ' || left(btrim(coalesce(p_note, '')), 300)
      || ' · Đồng ý liên hệ lúc '
      || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
  )
  on conflict (phone) do nothing;

  if found then
    return 'ok';
  end if;

  return 'duplicate';
end;
$$;

comment on function public.fn_web_lead(text, text, text)
  is 'Nhận lead từ form vay.kimminso.com. Chỉ chèn vào customers, không đọc dữ liệu khác.';

revoke all on function public.fn_web_lead(text, text, text) from public;
grant execute on function public.fn_web_lead(text, text, text) to anon;
