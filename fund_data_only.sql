--
-- PostgreSQL database dump
--

\restrict S5saNooWsBIAMsG7VV2a3Y0xdHE8VHB2pUrcBwwcYscmD6dUR7tIc7bL00BADIA

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: funds; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.funds (id, fund_name, fund_name_jp, manager, administrator, strategy, vintage_year, currency, commitment_usd, commitment_jpy, entry_fx_rate, contract_date, investment_period_start, investment_period_end, fund_term_years, management_fee_pct, carry_pct, hurdle_rate_pct, wire_bank, wire_account_name, wire_account_number, wire_aba, wire_swift, wire_reference, notes, is_active, created_at, updated_at, contract_commitment_usd, ai_extraction_template, contract_commitment_jpy, fund_family_id, family_sequence, is_new_fund) FROM stdin;
\.


--
-- Data for Name: commitments; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.commitments (id, fund_id, name, commitment_usd, commitment_date, currency, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: capital_calls; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.capital_calls (id, fund_id, notice_date, due_date, execution_date, call_number, call_pct, gross_call_usd, distribution_usd, reinvestable_usd, net_call_usd, fx_rate, net_call_jpy, investment_amount_usd, management_fee_usd, expense_usd, status, wire_reference, wire_fee_jpy, is_recallable, notes, approved_by, approved_at, paid_at, created_at, manual_cash_flow_usd, source_pdf_id, commitment_id, gain_usd, interest_usd, return_of_capital_usd, unfunded_after_call_usd) FROM stdin;
\.


--
-- Data for Name: distributions; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.distributions (id, fund_id, distribution_date, dist_type, amount_usd, amount_jpy, fx_rate, reinvestable_usd, is_recallable, recall_expiry, is_recalled, created_at, commitment_id, gain_usd, interest_usd, return_of_capital_usd) FROM stdin;
\.


--
-- Data for Name: fund_reports; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.fund_reports (id, fund_id, filename, file_path, report_type, notice_date, due_date, batch_id, is_initial_call, call_pct, net_call_usd, cumulative_pct, commitment_usd, extracted_data, capital_call_id, processed_by, processed_at) FROM stdin;
\.


--
-- Data for Name: fx_rates; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.fx_rates (id, rate_date, usd_jpy, source) FROM stdin;
8e7c68c1-d80d-4822-94e1-9f31df1029c8	2026-07-06	161.580000	murc
\.


--
-- Data for Name: notices; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.notices (id, filename, original_name, notice_type, status, fund_id, extracted_data, confidence, admin_notes, uploaded_by, created_at, approved_at, commitment_id, file_hash) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.users (id, email, full_name, full_name_jp, hashed_password, role, status, is_active, last_login, created_at, updated_at) FROM stdin;
f618d40c-5c29-4dd6-b1a8-3b486e862501	admin@thirdwave.co.jp	Admin User	管理者	$2a$12$x4T9tkBhoWU.7cRoMFGfg.D7DiygHERuvhVq4YlLnsE.3ssBeIKo2	admin	active	t	2026-07-07 01:43:45.836	2026-07-07 01:43:02.092	2026-07-07 01:43:45.837
\.


--
-- PostgreSQL database dump complete
--

\unrestrict S5saNooWsBIAMsG7VV2a3Y0xdHE8VHB2pUrcBwwcYscmD6dUR7tIc7bL00BADIA

