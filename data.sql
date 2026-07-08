--
-- PostgreSQL database dump
--

\restrict lhVWhTtELDWe1SahvdYi3TBxw8lQsgjy0KqLHM5xyAat5W9ELJx2Quz6w6whPT6

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
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
22bf5955-70fd-405f-b005-b91347a2daac	f386f35eab427dbb4aabcda1a22d643704df2cded3d3df2ecec06d71ae0a52a1	2026-07-07 01:11:46.023948+00	20260526082740_init	\N	\N	2026-07-07 01:11:45.836564+00	1
27b1ef91-0535-42e6-995b-70932cbef916	023c02e9abdf4d6267c1a7dc3933fb3d53c3a3301fd15c997544fbb730734285	2026-07-07 01:11:46.186527+00	20260604052415_working_branch	\N	\N	2026-07-07 01:11:46.028322+00	1
203ca11a-1f82-49d9-bdfb-99c44446abd8	8936f6e5be961f98da9cdea64b0abf3cc3523ebc20093456b131e6dd980f4341	2026-07-07 01:11:46.254587+00	20260609013246_add_finance_columns	\N	\N	2026-07-07 01:11:46.189859+00	1
db07be3c-7862-4466-8d04-edbfc76465e8	d80f57424966a11c55d35d96a2653c9e6e5df9c6e978b6646791ea5f9c248063	2026-07-07 01:11:46.297649+00	20260619014049_add_unfunded_after_call_usd	\N	\N	2026-07-07 01:11:46.257597+00	1
2bddc8f6-3f6f-4103-9e2a-ec737047b752	9e0abe4d98bb196d999c7970a82fa237cfcbeac459ebe47005f9e87dda8f7954	2026-07-07 01:11:46.311094+00	20260619020034_add_notice_file_hash	\N	\N	2026-07-07 01:11:46.300675+00	1
685c4a5c-f35a-4694-958a-56ea2e06049d	f976f58996208e72fdcd480e6911236de40d2c117a26a21564cd197701113d64	2026-07-07 01:11:46.324066+00	20260623003450_add_contract_commitment_usd	\N	\N	2026-07-07 01:11:46.313913+00	1
cfba6680-c6de-4844-8b78-330d2e11605e	65827cbe30fe7e3c5333faabc13331315b14648846ceaa50f20acb83fdcf423b	2026-07-07 01:11:46.381037+00	20260625061855_add_fund_onboarding_models	\N	\N	2026-07-07 01:11:46.32743+00	1
681bba68-11f9-4554-8de1-4e6adf77e607	984337e6b0d99ea0a0c5700ef1c0733201834c5b1a8a3bc7d6da231b66cf8c90	2026-07-07 01:11:46.393308+00	20260625070813_add_ai_extraction_template_to_funds	\N	\N	2026-07-07 01:11:46.382623+00	1
ad15cb9f-9eaa-4d55-b210-6a2cc5566283	ea98e46e6ea1b269228393b7c2a87e0a0ca1a1b9def3a0d0f41bd8e998a97b44	2026-07-07 01:11:46.404316+00	20260702_add_contract_commitment_jpy	\N	\N	2026-07-07 01:11:46.396337+00	1
c97413af-f574-4a5a-ad4b-36c94f35ccbe	1f462f573f1147107352336059912a6254b6fcf92505bd8c5023ee1416596a5b	2026-07-07 01:11:46.425794+00	20260706_add_fund_family_onboarding	\N	\N	2026-07-07 01:11:46.406059+00	1
\.


--
-- Data for Name: attribute_extractors; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.attribute_extractors (id, attribute_name, label, keywords, extraction_type, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.audit_logs (id, action, table_name, record_id, user_email, user_id, old_values, new_values, created_at) FROM stdin;
\.


--
-- Data for Name: calculation_rules; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.calculation_rules (id, name, description, formula, explanation, output_unit, applicable_types, display_on_dashboard, is_active, sort_order, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: calculation_results; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.calculation_results (id, rule_id, notice_id, fund_id, input_values, output_value, output_text, error, created_at) FROM stdin;
\.


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
-- Data for Name: correction_feedback; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.correction_feedback (id, session_id, corrected_fields, original_values, corrected_values, feedback, accepted, ai_analysis, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: distributions; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.distributions (id, fund_id, distribution_date, dist_type, amount_usd, amount_jpy, fx_rate, reinvestable_usd, is_recallable, recall_expiry, is_recalled, created_at, commitment_id, gain_usd, interest_usd, return_of_capital_usd) FROM stdin;
\.


--
-- Data for Name: fund_commitment_history; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.fund_commitment_history (id, fund_id, commitment_amount, effective_date, notes, created_at) FROM stdin;
\.


--
-- Data for Name: fund_families; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.fund_families (id, family_name, family_code, strategy, manager, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: fund_reports; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.fund_reports (id, fund_id, filename, file_path, report_type, notice_date, due_date, batch_id, is_initial_call, call_pct, net_call_usd, cumulative_pct, commitment_usd, extracted_data, capital_call_id, processed_by, processed_at) FROM stdin;
\.


--
-- Data for Name: fund_templates; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.fund_templates (id, "templateName", "fundKey", manager, fund_name_jp, strategy, "extractionSchema", sample_count, last_updated, confidence, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: fx_rates; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.fx_rates (id, rate_date, usd_jpy, source) FROM stdin;
1a741e32-bdcf-4846-8674-fb5f660a9a76	2026-07-06	161.580000	murc
\.


--
-- Data for Name: investment_targets; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.investment_targets (id, fund_id, project_name, actual_name, investment_date, amount_usd, investment_type, sector, geography, deal_type, created_at) FROM stdin;
\.


--
-- Data for Name: nav_records; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.nav_records (id, fund_id, nav_date, nav_usd, period, source_notice_id, created_at) FROM stdin;
\.


--
-- Data for Name: notices; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.notices (id, filename, original_name, notice_type, status, fund_id, extracted_data, confidence, admin_notes, uploaded_by, created_at, approved_at, commitment_id, file_hash) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.notifications (id, user_id, user_email, type, title, message, link, is_read, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: onboarding_sessions; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.onboarding_sessions (id, file_name, file_hash, current_step, fund_key, fund_display_name, report_type, ai_confidence, extracted_values, user_edited_values, calculated_values, validation_results, template_id, is_new_template, status, error_message, user_id, user_email, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: otp_tokens; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.otp_tokens (id, email, token, expires_at, used, created_at) FROM stdin;
\.


--
-- Data for Name: pdf_labels; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.pdf_labels (id, template_id, file_name, "fileHash", "values", extraction_date, extracted_by, pdf_storage_path, validation_log, created_at) FROM stdin;
\.


--
-- Data for Name: sigf_snapshots; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.sigf_snapshots (id, fund_id, fund_code, pdf_count, commitment_usd, cumulative_drawn, investment_capacity, net_cash_flow, non_recallable_dist, distributions_total, dpi, call_rows, computed_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: ims_user
--

COPY public.users (id, email, full_name, full_name_jp, hashed_password, role, status, is_active, last_login, created_at, updated_at) FROM stdin;
82903517-bc05-43fd-be8b-7cc10a74d867	admin@thirdwave.co.jp	Admin User	管理者	$2a$12$x4T9tkBhoWU.7cRoMFGfg.D7DiygHERuvhVq4YlLnsE.3ssBeIKo2	admin	active	t	2026-07-07 01:35:04.209	2026-07-07 01:31:13.245	2026-07-07 01:35:04.211
\.


--
-- PostgreSQL database dump complete
--

\unrestrict lhVWhTtELDWe1SahvdYi3TBxw8lQsgjy0KqLHM5xyAat5W9ELJx2Quz6w6whPT6

