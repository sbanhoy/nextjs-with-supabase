-- 000_baseline.sql — Snapshot schema public của project shinhan-rm-crm
-- Nguồn: database Supabase pbjqrjbultohplkucgec (PostgreSQL 17.11)
-- Ngày dump: 2026-10-20
-- Cách tạo: pg_dump 17.11 --schema-only --no-owner --no-privileges --schema=public
--
-- Đây là ảnh chụp để làm nguồn sự thật, không phải migration chạy lại.
-- Nội dung: 8 bảng, 2 view, 9 function, 13 policy RLS, 1 trigger, 1 unique index.
--
-- Không có trong file:
--   - Dữ liệu khách hàng, chỉ có schema.
--   - Bảng auth.users, storage, roles của Supabase.
--   - Extension và cron job, liệt kê ở cuối file dưới dạng comment.
--   - Cấu hình project trên dashboard (region, Auth settings, v.v.).
--
-- Một chỗ đã được che: URL Apps Script trong fn_sheet_webhook.
-- URL thật chỉ nằm trong database production, không đưa lên repo public.
-- Nếu dựng lại DB từ file này, phải thay lại URL thật trước khi dùng trigger.
--
-- Khi schema thay đổi, tạo file mới 001_..., 002_... theo quy ước idempotent.
-- Không sửa file này.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11 (Homebrew)

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: fn_activate_weight_matrix(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_activate_weight_matrix(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update weight_matrix set is_active=false where is_active;
  update weight_matrix set is_active=true where id=p_id;
$$;


--
-- Name: fn_expire_insights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_expire_insights() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare n int;
begin
  with e as (update rm_insights set status='expired', updated_at=now()
             where status='open' and expires_at < now() returning *)
  insert into agent_learning_log(rm_id,customer_id,insight_id,action,feature_snapshot,score)
  select rm_id,customer_id,id,'expired',feature_snapshot,priority_score from e;
  get diagnostics n = row_count; return n;
end $$;


--
-- Name: fn_generate_insights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_insights() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare c record; s record; n int := 0; gap record;
begin
  for c in select f.*, cu.full_name from customers cu join v_customer_features f on f.customer_id=cu.id loop
    select * into s from fn_score_customer(c.customer_id);
    if s is null then continue; end if;
    select p.id, p.name into gap from products p where p.is_active
      and not exists(select 1 from product_holdings h where h.customer_id=c.customer_id and h.product_id=p.id and h.status='active')
      order by random() limit 1;

    if c.f_churn_signal=1 and not exists(select 1 from rm_insights where customer_id=c.customer_id and insight_type='churn_risk' and status='open') then
      insert into rm_insights(customer_id,rm_id,insight_type,title,detail,priority_score,feature_snapshot,weight_version)
      values(c.customer_id,c.rm_id,'churn_risk',c.full_name||': AUM giảm >20% trong 3 tháng',
        'Chủ động gọi hỏi thăm, đề xuất tiết kiệm lãi suất ưu đãi để giữ dòng tiền.',s.score,s.features,s.weight_version); n:=n+1; end if;

    if c.f_maturity_soon=1 and not exists(select 1 from rm_insights where customer_id=c.customer_id and insight_type='next_best_action' and status='open') then
      insert into rm_insights(customer_id,rm_id,insight_type,title,detail,priority_score,feature_snapshot,weight_version)
      values(c.customer_id,c.rm_id,'next_best_action','Sản phẩm sắp đáo hạn trong 30 ngày',
        'Liên hệ trước 7 ngày để tư vấn tái tục hoặc chuyển sang sản phẩm đầu tư.',s.score,s.features,s.weight_version); n:=n+1; end if;

    if c.f_product_gap>=0.6 and gap.id is not null and not exists(select 1 from rm_insights where customer_id=c.customer_id and insight_type='cross_sell' and status='open') then
      insert into rm_insights(customer_id,rm_id,insight_type,title,detail,recommended_product_id,priority_score,feature_snapshot,weight_version)
      values(c.customer_id,c.rm_id,'cross_sell','Cơ hội cross-sell: '||gap.name,
        'Khách đang dùng ít dòng sản phẩm, phù hợp mở rộng gói.',gap.id,s.score,s.features,s.weight_version); n:=n+1; end if;

    if c.f_recency<0.2 and not exists(select 1 from rm_insights where customer_id=c.customer_id and insight_type='reengage' and status='open') then
      insert into rm_insights(customer_id,rm_id,insight_type,title,detail,priority_score,feature_snapshot,weight_version)
      values(c.customer_id,c.rm_id,'reengage','Chưa tương tác hơn 70 ngày',
        'Gửi tin nhắn hoặc gọi điện để duy trì quan hệ.',s.score,s.features,s.weight_version); n:=n+1; end if;

    if c.f_life_event=1 and not exists(select 1 from rm_insights where customer_id=c.customer_id and insight_type='life_event' and status='open') then
      insert into rm_insights(customer_id,rm_id,insight_type,title,detail,priority_score,feature_snapshot,weight_version)
      values(c.customer_id,c.rm_id,'life_event','Sinh nhật trong 14 ngày tới',
        'Gửi lời chúc và quà theo hạng khách; cơ hội tự nhiên để trò chuyện về nhu cầu tài chính.',s.score,s.features,s.weight_version); n:=n+1; end if;
  end loop;
  return n;
end $$;


--
-- Name: fn_generate_referral_insights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_referral_insights() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare n int := 0; c record; s record;
begin
  for c in
    select cu.id, cu.rm_id, cu.full_name from customers cu join v_customer_features f on f.customer_id=cu.id
    where cu.stage='customer' and f.f_aum>=0.7 and f.f_recency>=0.5 and f.f_churn_signal=0
      and not exists (select 1 from rm_insights i where i.customer_id=cu.id and i.insight_type='referral' and i.created_at > now()-interval '60 day')
    order by f.f_aum desc limit 10
  loop
    select * into s from fn_score_customer(c.id);
    insert into rm_insights(customer_id,rm_id,insight_type,title,detail,priority_score,feature_snapshot,weight_version)
    values (c.id,c.rm_id,'referral',c.full_name||': khách hài lòng, đúng lúc xin giới thiệu',
      'Gợi ý: "Anh/chị có bạn bè hay đối tác nào đang cần tư vấn tài chính không? Em rất mong được hỗ trợ như đã hỗ trợ anh/chị."',
      s.score, s.features, s.weight_version);
    n := n+1;
  end loop;
  return n;
end $$;


--
-- Name: fn_insight_feedback(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_insight_feedback(p_insight_id uuid, p_action text, p_outcome text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare i rm_insights%rowtype;
begin
  select * into i from rm_insights where id=p_insight_id;
  if i is null then raise exception 'not found'; end if;
  update rm_insights set status=p_action, updated_at=now() where id=p_insight_id;
  insert into agent_learning_log(rm_id,customer_id,insight_id,action,feature_snapshot,score,outcome)
  values(auth.uid(),i.customer_id,i.id,p_action,i.feature_snapshot,i.priority_score,p_outcome);
end $$;


--
-- Name: fn_propose_weights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_propose_weights() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare w jsonb; v int; good int; bad int; k text; lift numeric; val numeric; nw jsonb := '{}'; tot numeric := 0;
begin
  select weights, version into w, v from weight_matrix where is_active;
  select count(*) filter (where action in ('accepted','converted')), count(*) filter (where action='dismissed')
    into good, bad from agent_learning_log where created_at > now() - interval '30 day';
  if good < 10 or bad < 10 then
    return 'Chưa đủ dữ liệu: '||good||' nhận / '||bad||' bỏ qua (cần ≥10 mỗi loại)';
  end if;
  for k in select jsonb_object_keys(w) loop
    select coalesce(avg((feature_snapshot->>k)::numeric) filter (where action in ('accepted','converted')),0)
         - coalesce(avg((feature_snapshot->>k)::numeric) filter (where action='dismissed'),0)
      into lift from agent_learning_log where created_at > now() - interval '30 day';
    val := (w->>k)::numeric * (1 + greatest(-0.3, least(0.3, lift)));
    nw := nw || jsonb_build_object(k, val); tot := tot + val;
  end loop;
  select jsonb_object_agg(key, round((value#>>'{}')::numeric / tot, 4)) into nw from jsonb_each(nw);
  insert into weight_matrix(version,name,is_active,weights,notes)
  values ((select max(version)+1 from weight_matrix), 'Auto-tune '||to_char(now(),'DD/MM/YYYY'), false, nw,
          'Đề xuất từ '||good||' insight được nhận và '||bad||' bị bỏ qua trong 30 ngày, dựa trên v'||v);
  return 'Đã tạo bản nháp mới từ '||(good+bad)||' phản hồi';
end $$;


--
-- Name: fn_rescore_open_insights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_rescore_open_insights() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare n int;
begin
  update rm_insights i set priority_score = s.score, weight_version = s.weight_version, updated_at = now()
  from v_customer_scores s where s.id = i.customer_id and i.status = 'open';
  get diagnostics n = row_count; return n;
end $$;


--
-- Name: fn_score_customer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_score_customer(p_customer_id uuid) RETURNS TABLE(score numeric, weight_version integer, features jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
declare w jsonb; v int; f record;
begin
  select weights, version into w, v from weight_matrix where is_active limit 1;
  select * into f from v_customer_features where customer_id=p_customer_id;
  if f is null then return; end if;
  return query select round((
    f.f_aum*(w->>'f_aum')::numeric + f.f_recency*(w->>'f_recency')::numeric +
    f.f_product_gap*(w->>'f_product_gap')::numeric + f.f_segment*(w->>'f_segment')::numeric +
    f.f_maturity_soon*(w->>'f_maturity_soon')::numeric + f.f_churn_signal*(w->>'f_churn_signal')::numeric +
    f.f_life_event*(w->>'f_life_event')::numeric)*100,2), v, to_jsonb(f)-'customer_id'-'rm_id';
end $$;


--
-- Name: fn_sheet_webhook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sheet_webhook() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  perform net.http_post(
    url := 'https://script.google.com/macros/s/REDACTED_APPS_SCRIPT_DEPLOYMENT/exec',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'type', TG_OP, 'table', TG_TABLE_NAME,
      'record', case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
      'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end));
  return coalesce(NEW, OLD);
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_learning_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_learning_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rm_id uuid,
    customer_id uuid,
    insight_id uuid,
    action text,
    feature_snapshot jsonb,
    score numeric,
    outcome text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rm_id uuid,
    full_name text NOT NULL,
    segment text,
    aum numeric DEFAULT 0,
    aum_3m_ago numeric DEFAULT 0,
    dob date,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    stage text DEFAULT 'customer'::text NOT NULL,
    source text,
    note text,
    email text,
    facebook text,
    CONSTRAINT customers_segment_check CHECK ((segment = ANY (ARRAY['mass'::text, 'affluent'::text, 'premier'::text, 'private'::text]))),
    CONSTRAINT customers_stage_check CHECK ((stage = ANY (ARRAY['lead'::text, 'customer'::text])))
);


--
-- Name: interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    rm_id uuid,
    channel text,
    note text,
    occurred_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_holdings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_holdings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    product_id uuid,
    status text DEFAULT 'active'::text,
    maturity_date date
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    name text NOT NULL,
    category text,
    is_active boolean DEFAULT true
);


--
-- Name: rm_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rm_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    rm_id uuid,
    insight_type text NOT NULL,
    title text NOT NULL,
    detail text,
    recommended_product_id uuid,
    priority_score numeric(6,2) NOT NULL,
    feature_snapshot jsonb NOT NULL,
    weight_version integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: rm_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rm_users (
    id uuid NOT NULL,
    full_name text,
    branch text,
    role text DEFAULT 'rm'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rm_users_role_check CHECK ((role = ANY (ARRAY['rm'::text, 'manager'::text, 'admin'::text])))
);


--
-- Name: v_customer_features; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_customer_features AS
 SELECT c.id AS customer_id,
    c.rm_id,
    LEAST((ln(GREATEST(c.aum, (1)::numeric)) / ln('10000000000'::numeric)), (1)::numeric) AS f_aum,
    GREATEST((0)::numeric, ((1)::numeric - (COALESCE(EXTRACT(day FROM (now() - li.last_at)), (90)::numeric) / (90)::numeric))) AS f_recency,
    ((1)::numeric - ((COALESCE(ph.cnt, (0)::bigint))::numeric / (NULLIF(( SELECT count(*) AS count
           FROM public.products
          WHERE products.is_active), 0))::numeric)) AS f_product_gap,
        CASE c.segment
            WHEN 'private'::text THEN (1)::numeric
            WHEN 'premier'::text THEN 0.8
            WHEN 'affluent'::text THEN 0.6
            ELSE 0.3
        END AS f_segment,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.product_holdings h
              WHERE ((h.customer_id = c.id) AND ((h.maturity_date >= CURRENT_DATE) AND (h.maturity_date <= (CURRENT_DATE + 30)))))) THEN 1
            ELSE 0
        END AS f_maturity_soon,
        CASE
            WHEN ((c.aum_3m_ago > (0)::numeric) AND (c.aum < (c.aum_3m_ago * 0.8))) THEN 1
            ELSE 0
        END AS f_churn_signal,
        CASE
            WHEN ((c.dob IS NOT NULL) AND ((to_char((c.dob)::timestamp with time zone, 'MMDD'::text) >= to_char(now(), 'MMDD'::text)) AND (to_char((c.dob)::timestamp with time zone, 'MMDD'::text) <= to_char((now() + '14 days'::interval), 'MMDD'::text)))) THEN 1
            ELSE 0
        END AS f_life_event
   FROM ((public.customers c
     LEFT JOIN LATERAL ( SELECT max(i.occurred_at) AS last_at
           FROM public.interactions i
          WHERE (i.customer_id = c.id)) li ON (true))
     LEFT JOIN LATERAL ( SELECT count(DISTINCT h.product_id) AS cnt
           FROM public.product_holdings h
          WHERE ((h.customer_id = c.id) AND (h.status = 'active'::text))) ph ON (true));


--
-- Name: v_customer_scores; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_customer_scores AS
 SELECT c.id,
    c.full_name,
    c.segment,
    c.aum,
    s.score,
    s.weight_version
   FROM (public.customers c
     CROSS JOIN LATERAL public.fn_score_customer(c.id) s(score, weight_version, features));


--
-- Name: weight_matrix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weight_matrix (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT false,
    weights jsonb NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_learning_log agent_learning_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_learning_log
    ADD CONSTRAINT agent_learning_log_pkey PRIMARY KEY (id);


--
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
-- Name: product_holdings product_holdings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holdings
    ADD CONSTRAINT product_holdings_pkey PRIMARY KEY (id);


--
-- Name: products products_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_code_key UNIQUE (code);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: rm_insights rm_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rm_insights
    ADD CONSTRAINT rm_insights_pkey PRIMARY KEY (id);


--
-- Name: rm_users rm_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rm_users
    ADD CONSTRAINT rm_users_pkey PRIMARY KEY (id);


--
-- Name: weight_matrix weight_matrix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_matrix
    ADD CONSTRAINT weight_matrix_pkey PRIMARY KEY (id);


--
-- Name: weight_matrix weight_matrix_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weight_matrix
    ADD CONSTRAINT weight_matrix_version_key UNIQUE (version);


--
-- Name: wm_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wm_one_active ON public.weight_matrix USING btree (is_active) WHERE is_active;


--
-- Name: customers trg_sheet_webhook; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sheet_webhook AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.fn_sheet_webhook();


--
-- Name: customers customers_rm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_rm_id_fkey FOREIGN KEY (rm_id) REFERENCES public.rm_users(id);


--
-- Name: interactions interactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: product_holdings product_holdings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holdings
    ADD CONSTRAINT product_holdings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: product_holdings product_holdings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holdings
    ADD CONSTRAINT product_holdings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: rm_insights rm_insights_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rm_insights
    ADD CONSTRAINT rm_insights_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: rm_insights rm_insights_recommended_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rm_insights
    ADD CONSTRAINT rm_insights_recommended_product_id_fkey FOREIGN KEY (recommended_product_id) REFERENCES public.products(id);


--
-- Name: rm_insights rm_insights_rm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rm_insights
    ADD CONSTRAINT rm_insights_rm_id_fkey FOREIGN KEY (rm_id) REFERENCES public.rm_users(id);


--
-- Name: rm_users rm_users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rm_users
    ADD CONSTRAINT rm_users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_learning_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_learning_log ENABLE ROW LEVEL SECURITY;

--
-- Name: weight_matrix auth all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth all" ON public.weight_matrix TO authenticated USING (true) WITH CHECK (true);


--
-- Name: interactions auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.interactions FOR SELECT TO authenticated USING (true);


--
-- Name: product_holdings auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.product_holdings FOR SELECT TO authenticated USING (true);


--
-- Name: products auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.products FOR SELECT TO authenticated USING (true);


--
-- Name: rm_users auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.rm_users FOR SELECT TO authenticated USING (true);


--
-- Name: weight_matrix auth read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth read" ON public.weight_matrix FOR SELECT TO authenticated USING (true);


--
-- Name: interactions auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.interactions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: product_holdings auth write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth write" ON public.product_holdings TO authenticated USING (true) WITH CHECK (true);


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_learning_log own or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin" ON public.agent_learning_log FOR SELECT TO authenticated USING (((rm_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.rm_users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'admin'::text])))))));


--
-- Name: customers own or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin" ON public.customers FOR SELECT TO authenticated USING (((rm_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.rm_users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'admin'::text])))))));


--
-- Name: rm_insights own or admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own or admin" ON public.rm_insights FOR SELECT TO authenticated USING (((rm_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.rm_users u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['manager'::text, 'admin'::text])))))));


--
-- Name: rm_insights own update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own update" ON public.rm_insights FOR UPDATE TO authenticated USING ((rm_id = auth.uid()));


--
-- Name: customers own write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own write" ON public.customers TO authenticated USING ((rm_id = auth.uid())) WITH CHECK ((rm_id = auth.uid()));


--
-- Name: product_holdings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_holdings ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: rm_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rm_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: rm_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rm_users ENABLE ROW LEVEL SECURITY;

--
-- Name: weight_matrix; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weight_matrix ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

-- ============================================================
-- PHẦN KHÔNG NẰM TRONG DUMP
-- ============================================================
--
-- Extension đang bật:
--   pg_cron 1.6.4
--   pg_net 0.20.4
--   pg_stat_statements 1.11
--   pgcrypto 1.3
--   plpgsql 1.0
--   supabase_vault 0.3.1
--   uuid-ossp 1.1
--
-- Cron job trên pg_cron:
--   job 3 | 0 1 * * * | select fn_expire_insights(); select fn_generate_insights(); select fn_generate_referral_insights();
--   job 2 | 0 2 * * 1 | select fn_propose_weights();
--
-- RLS đang bật trên cả 8 bảng public.
