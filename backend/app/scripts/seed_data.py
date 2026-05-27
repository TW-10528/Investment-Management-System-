"""
Real fund seed data from Thirdwave Corporation's actual investment documents.
Run: cd backend && python -m app.scripts.seed_data
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from datetime import date, datetime, timedelta
from decimal import Decimal

from app.core.database import engine, Base, SessionLocal
from app.models.fund import Fund, FundStrategy
from app.models.capital_call import CapitalCall, CallStatus
from app.models.distribution import Distribution, DistributionType
from app.models.fx_rate import FxRate
from app.models.user import User, UserRole
from app.core.security import hash_password


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✓ Database reset")


def seed_users():
    db = SessionLocal()
    users = [
        # ── Admin ──────────────────────────────────────────────────────────────
        User(email="admin@thirdwave.co.jp",
             full_name="System Administrator", full_name_jp="システム管理者",
             role=UserRole.ADMIN,
             hashed_password=hash_password("admin123"), is_active=True),

        # ── Executive ─────────────────────────────────────────────────────────
        User(email="ceo@thirdwave.co.jp",
             full_name="Kensuke Ozaki",        full_name_jp="尾崎 健介",
             role=UserRole.CEO,
             hashed_password=hash_password("ceo123"), is_active=True),

        # ── Finance Management ────────────────────────────────────────────────
        User(email="finance@thirdwave.co.jp",
             full_name="Finance Manager",      full_name_jp="財務部長",
             role=UserRole.FINANCE_MANAGER,
             hashed_password=hash_password("finance123"), is_active=True),

        User(email="cfo@thirdwave.co.jp",
             full_name="Chief Financial Officer", full_name_jp="最高財務責任者",
             role=UserRole.FINANCE_MANAGER,
             hashed_password=hash_password("cfo123"), is_active=True),

        # ── Finance Staff (Investment Team) ───────────────────────────────────
        User(email="staff@thirdwave.co.jp",
             full_name="Finance Staff",        full_name_jp="財務担当",
             role=UserRole.FINANCE_STAFF,
             hashed_password=hash_password("staff123"), is_active=True),

        User(email="investment@thirdwave.co.jp",
             full_name="Investment Analyst",   full_name_jp="投資アナリスト",
             role=UserRole.FINANCE_STAFF,
             hashed_password=hash_password("invest123"), is_active=True),

        User(email="analyst@thirdwave.co.jp",
             full_name="Portfolio Analyst",    full_name_jp="ポートフォリオ担当",
             role=UserRole.FINANCE_STAFF,
             hashed_password=hash_password("analyst123"), is_active=True),

        User(email="compliance@thirdwave.co.jp",
             full_name="Compliance Officer",   full_name_jp="コンプライアンス担当",
             role=UserRole.FINANCE_STAFF,
             hashed_password=hash_password("comply123"), is_active=True),

        User(email="accounting@thirdwave.co.jp",
             full_name="Senior Accountant",    full_name_jp="経理担当上席",
             role=UserRole.FINANCE_STAFF,
             hashed_password=hash_password("account123"), is_active=True),

        # ── Board ─────────────────────────────────────────────────────────────
        User(email="board@thirdwave.co.jp",
             full_name="Board Member",         full_name_jp="取締役",
             role=UserRole.BOARD_MEMBER,
             hashed_password=hash_password("board123"), is_active=True),
    ]
    added = 0
    for u in users:
        if not db.query(User).filter(User.email == u.email).first():
            db.add(u)
            added += 1
    db.commit()
    print(f"✓ Seeded {added} new users ({len(users)} total finance dept. members)")
    db.close()


def seed_fx_rates():
    """MUFG TTM rates – actual rates used in the fund documents."""
    db = SessionLocal()
    rates = [
        # Historical rates from capital call documents
        (date(2024, 12, 1),  Decimal("150.50")),
        (date(2024, 12, 9),  Decimal("151.20")),
        (date(2024, 12, 20), Decimal("152.10")),
        (date(2025, 1, 1),   Decimal("157.00")),
        (date(2025, 1, 13),  Decimal("156.50")),
        (date(2025, 2, 1),   Decimal("155.25")),  # Vintage X Goldman Sachs capital call
        (date(2025, 2, 13),  Decimal("154.80")),
        (date(2025, 3, 1),   Decimal("149.50")),
        (date(2025, 3, 16),  Decimal("150.00")),
        (date(2025, 3, 26),  Decimal("150.30")),  # Dover XI March call
        (date(2025, 4, 1),   Decimal("143.50")),
        (date(2025, 4, 17),  Decimal("142.80")),
        (date(2025, 4, 28),  Decimal("143.66")),  # Capula rate from Excel
        (date(2025, 5, 1),   Decimal("145.20")),
        (date(2025, 6, 1),   Decimal("146.50")),
        (date(2025, 6, 25),  Decimal("146.80")),  # Dover XI June call
        (date(2025, 7, 1),   Decimal("147.00")),
        (date(2025, 7, 25),  Decimal("147.42")),  # Capula rate from Excel
        (date(2025, 8, 1),   Decimal("146.30")),
        (date(2025, 9, 1),   Decimal("145.00")),
        (date(2025, 9, 9),   Decimal("143.80")),  # Hamilton Lane wire date
        (date(2025, 9, 24),  Decimal("143.60")),  # Dover XI September call
        (date(2025, 10, 1),  Decimal("149.50")),
        (date(2025, 11, 1),  Decimal("151.80")),
        (date(2025, 11, 21), Decimal("154.20")),
        (date(2025, 12, 1),  Decimal("151.50")),
        (date(2025, 12, 19), Decimal("152.00")),  # NB Real Estate Dec call
        (date(2026, 1, 1),   Decimal("157.10")),
        (date(2026, 1, 13),  Decimal("156.80")),  # Siguler Guff Jan call
        (date(2026, 1, 29),  Decimal("153.15")),  # Capula rate from Excel
        (date(2026, 2, 2),   Decimal("155.25")),  # Goldman Sachs Vintage X due date
        (date(2026, 2, 13),  Decimal("153.50")),  # Siguler Guff Feb call
        (date(2026, 3, 1),   Decimal("149.80")),
        (date(2026, 3, 16),  Decimal("148.50")),  # Siguler Guff Mar call
        (date(2026, 3, 30),  Decimal("149.20")),  # NB Real Estate Mar call
        (date(2026, 4, 17),  Decimal("142.50")),  # Siguler Guff Apr call
        (date(2026, 5, 1),   Decimal("143.00")),
        (date(2026, 5, 25),  Decimal("143.50")),  # today approx
    ]
    for rate_date, usd_jpy in rates:
        if not db.query(FxRate).filter(FxRate.rate_date == rate_date).first():
            db.add(FxRate(rate_date=rate_date, usd_jpy=usd_jpy, rate_type="MUFG_TTM", source="manual"))
    db.commit()
    print(f"✓ Seeded {len(rates)} FX rates")
    db.close()


def seed_funds():
    db = SessionLocal()

    funds_data = [
        # ── 1. Goldman Sachs – Vintage X (Flagship) Offshore SCSp ─────────────────
        dict(
            fund_name      = "Vintage X (Flagship) Offshore SCSp",
            fund_name_jp   = "ヴィンテージX（フラッグシップ）オフショアSCSp",
            manager        = "Goldman Sachs Asset Management",
            administrator  = "State Street Bank & Trust",
            strategy       = FundStrategy.SECONDARIES,
            vintage_year   = 2025,
            currency       = "USD",
            commitment_usd = Decimal("20000000"),
            entry_fx_rate  = Decimal("155.25"),
            contract_date  = date(2025, 11, 20),
            fund_term_years= 10,
            wire_bank      = "State Street Bank & Trust co. Boston",
            wire_aba       = "011000028",
            wire_account_name   = "Vintage X (Flagship) Offshore SCSp",
            wire_account_number = "11841533",
            wire_reference = "MG149345 Thirdwave Financial Inc.",
            wire_swift     = "SBOSUS33",
            notes          = "Projects: Hawkins, Robinson, Narcissa. Initial cap call Jan 2026.",
        ),
        # ── 2. HarbourVest – Dover Street XI Feeder Fund L.P. ─────────────────────
        dict(
            fund_name      = "Dover Street XI Feeder Fund L.P.",
            fund_name_jp   = "ドーバーストリートXI フィーダーファンド",
            manager        = "HarbourVest Partners",
            administrator  = "JPMorgan Chase Bank",
            strategy       = FundStrategy.SECONDARIES,
            vintage_year   = 2024,
            currency       = "USD",
            commitment_usd = Decimal("20000000"),
            entry_fx_rate  = Decimal("152.10"),
            contract_date  = date(2024, 10, 1),
            fund_term_years= 12,
            wire_bank      = "JPMorgan Chase Bank",
            wire_aba       = "021000021",
            wire_swift     = "CHASUS33",
            wire_account_name   = "Dover Street XI Feeder Fund L.P.",
            wire_account_number = "741923350",
            wire_reference = "LPID04978 and Your Name",
            notes          = "LP ID: LPID04978. 41% called as of Sep 2025.",
        ),
        # ── 3. NB Real Estate Secondary Opportunities Offshore Fund II ─────────────
        dict(
            fund_name      = "NB Real Estate Secondary Opportunities Offshore Fund II LP",
            fund_name_jp   = "NBリアルエステートセカンダリーオポチュニティーズ オフショアファンドII",
            manager        = "Neuberger Berman (NB Alternatives Advisers LLC)",
            administrator  = "Bank of America, N.A.",
            strategy       = FundStrategy.REAL_ESTATE,
            vintage_year   = 2023,
            currency       = "USD",
            commitment_usd = Decimal("5000000"),
            entry_fx_rate  = Decimal("151.80"),
            contract_date  = date(2023, 6, 1),
            fund_term_years= 10,
            wire_bank      = "Bank of America, N.A.",
            wire_aba       = "026-009-593",
            wire_swift     = "BOFAUS3N",
            wire_account_name   = "NB Real Estate Secondary Opportunities Offshore Fund II LP",
            wire_account_number = "4451668246",
            wire_reference = "NBI13133",
            notes          = "Total commitment $5M. ~48% called as of Mar 2026. Distributions reinvestable.",
        ),
        # ── 4. Siguler Guff Small Buyout Opportunities Fund VI (F), LP ─────────────
        dict(
            fund_name      = "Siguler Guff Small Buyout Opportunities Fund VI (F), LP",
            fund_name_jp   = "シグラーガフ スモールバイアウト オポチュニティーズ ファンドVI(F)",
            manager        = "Siguler Guff & Company, LP",
            administrator  = "JPMorgan Chase Bank, N.A.",
            strategy       = FundStrategy.BUYOUT,
            vintage_year   = 2025,
            currency       = "USD",
            commitment_usd = Decimal("1000000"),
            entry_fx_rate  = Decimal("156.80"),
            contract_date  = date(2025, 12, 1),
            fund_term_years= 10,
            wire_bank      = "JPMORGAN CHASE BANK, N.A.",
            wire_aba       = "021000021",
            wire_swift     = "CHASUS33XXX",
            wire_account_name   = "SIGULER GUFF SMALL BUYOUT OPPORTUNITIES VI F",
            wire_account_number = "515067018",
            wire_reference = "11873-Thirdwave Financial Inc.",
            notes          = "Investor ID: 11873. Initial call 4.9% = $49,000. 18.1% called as of Apr 2026.",
        ),
        # ── 5. Capula Global Relative Value Trust – Class J Semi-Annual US$ ─────────
        dict(
            fund_name      = "Capula Global Relative Value Trust – Class J Semi-Annual US$",
            fund_name_jp   = "カプラ グローバルリラティブバリュートラスト クラスJ",
            manager        = "Capula Investment Management",
            administrator  = "SS&C GlobeOp",
            strategy       = FundStrategy.HEDGE_FUND,
            vintage_year   = 2025,
            currency       = "USD",
            commitment_usd = Decimal("4999997"),
            entry_fx_rate  = Decimal("143.66"),
            contract_date  = date(2025, 4, 28),
            fund_term_years= 5,
            notes          = "Series: Series123May2025 | Entity: 00204526 | Contract: 3349649. Semi-annual distribution.",
        ),
        # ── 6. Hamilton Lane Secondary Fund VI-B L.P. ──────────────────────────────
        dict(
            fund_name      = "Hamilton Lane Secondary Fund VI-B L.P.",
            fund_name_jp   = "ハミルトンレーン セカンダリーファンドVI-B",
            manager        = "Hamilton Lane Advisors",
            administrator  = "Wells Fargo Bank, N.A.",
            strategy       = FundStrategy.SECONDARIES,
            vintage_year   = 2024,
            currency       = "USD",
            commitment_usd = Decimal("4999997"),
            entry_fx_rate  = Decimal("143.80"),
            contract_date  = date(2024, 9, 9),
            fund_term_years= 10,
            wire_bank      = "Wells Fargo Bank, N.A.",
            wire_account_name = "Hamilton Lane Secondary Fund VI-B L",
            notes          = "Wire sent 2025/09/09: USD 382,898. Beneficiary: Seven Tower Bridge, 110 Washington St.",
        ),
        # ── 7. SDGs投資事業有限責任組合 (ASTMAX) ────────────────────────────────────
        dict(
            fund_name      = "SDGs Investment Fund (SDGs投資事業有限責任組合)",
            fund_name_jp   = "SDGs投資事業有限責任組合",
            manager        = "アストマックス・ファンド・マネジメント株式会社",
            administrator  = "ASTMAX Fund Management",
            strategy       = FundStrategy.OTHER,
            vintage_year   = 2022,
            currency       = "JPY",
            commitment_usd = Decimal("0"),   # JPY-denominated fund
            entry_fx_rate  = Decimal("130.00"),
            contract_date  = date(2022, 10, 7),
            fund_term_years= 5,
            notes          = "JPY fund. 組合契約締結日: 2022/10/07. 2nd period (Sep 2024) profit ¥59,829,696. Distribution ¥59,527,840.",
        ),
        # ── 8. Private Credit / Other Fund (Placeholder #8) ────────────────────────
        dict(
            fund_name      = "Asia Private Credit Fund I",
            fund_name_jp   = "アジアプライベートクレジットファンドI",
            manager        = "Apollo Global Management",
            administrator  = "Northern Trust",
            strategy       = FundStrategy.PRIVATE_CREDIT,
            vintage_year   = 2023,
            currency       = "USD",
            commitment_usd = Decimal("3000000"),
            entry_fx_rate  = Decimal("132.00"),
            contract_date  = date(2023, 6, 1),
            fund_term_years= 7,
            management_fee_pct = Decimal("1.25"),
            carry_pct          = Decimal("15.00"),
            hurdle_rate_pct    = Decimal("5.00"),
            notes          = "Placeholder – to be updated with actual fund documents.",
        ),
        # ── 9. Infrastructure / Other Fund (Placeholder #9) ────────────────────────
        dict(
            fund_name      = "Global Infrastructure Fund IV",
            fund_name_jp   = "グローバルインフラストラクチャーファンドIV",
            manager        = "Macquarie Asset Management",
            administrator  = "Citi",
            strategy       = FundStrategy.INFRASTRUCTURE,
            vintage_year   = 2024,
            currency       = "USD",
            commitment_usd = Decimal("5000000"),
            entry_fx_rate  = Decimal("150.00"),
            contract_date  = date(2024, 3, 1),
            fund_term_years= 12,
            management_fee_pct = Decimal("1.50"),
            carry_pct          = Decimal("20.00"),
            hurdle_rate_pct    = Decimal("6.00"),
            notes          = "Placeholder – to be updated with actual fund documents.",
        ),
    ]

    created = []
    for fd in funds_data:
        if not db.query(Fund).filter(Fund.fund_name == fd["fund_name"]).first():
            f = Fund(**fd)
            if f.commitment_usd and f.entry_fx_rate:
                f.commitment_jpy = int(f.commitment_usd * f.entry_fx_rate)
            db.add(f)
            db.flush()
            created.append(f)

    db.commit()
    print(f"✓ Seeded {len(created)} funds")
    db.close()
    return created


def seed_capital_calls_and_distributions():
    db = SessionLocal()

    def get_fund(name_fragment):
        return db.query(Fund).filter(Fund.fund_name.contains(name_fragment)).first()

    def get_fx(d: date) -> Decimal:
        r = db.query(FxRate).filter(FxRate.rate_date <= d).order_by(FxRate.rate_date.desc()).first()
        return r.usd_jpy if r else Decimal("150")

    def add_call(fund, call_num, notice, due, exec_d, gross, dist=0, reinvest=0,
                 call_pct=None, wire_ref=None, status=CallStatus.PAID):
        fx = get_fx(exec_d or due)
        net = Decimal(str(gross)) - Decimal(str(dist))
        c = CapitalCall(
            fund_id=fund.id, call_number=call_num,
            notice_date=notice, due_date=due, execution_date=exec_d or due,
            call_pct=Decimal(str(call_pct)) if call_pct else None,
            gross_call_usd=Decimal(str(gross)),
            distribution_usd=Decimal(str(dist)),
            reinvestable_usd=Decimal(str(reinvest)),
            net_call_usd=net, fx_rate=fx,
            net_call_jpy=int(net * fx),
            wire_reference=wire_ref or fund.wire_reference,
            status=status, paid_at=datetime(exec_d.year, exec_d.month, exec_d.day) if exec_d and status == CallStatus.PAID else None,
        )
        db.add(c)

    def add_dist(fund, dist_date, amount, reinvest=0, dist_type=DistributionType.INCOME, recallable=False):
        fx = get_fx(dist_date)
        d = Distribution(
            fund_id=fund.id,
            distribution_date=dist_date,
            dist_type=dist_type,
            amount_usd=Decimal(str(amount)),
            reinvestable_usd=Decimal(str(reinvest)),
            fx_rate=fx,
            amount_jpy=int(Decimal(str(amount)) * fx),
            is_recallable=recallable,
        )
        db.add(d)

    # ── 1. Goldman Sachs Vintage X ────────────────────────────────────────────────
    gs = get_fund("Vintage X")
    if gs:
        # Capital Call 1: Feb 2, 2026 – $400,000 (2% of $20M)
        add_call(gs, 1, date(2026, 1, 16), date(2026, 2, 2), date(2026, 2, 2),
                 gross=400000, call_pct=2.0, wire_ref="MG149345 Thirdwave Financial Inc.")

    # ── 2. Dover Street XI (HarbourVest) ─────────────────────────────────────────
    dv = get_fund("Dover Street XI")
    if dv:
        # Dec 2024: 6% call, net $1,072,647 (gross $1,200,000 – distribution $127,353)
        add_call(dv, 1, date(2024, 12, 9),  date(2024, 12, 20), date(2024, 12, 20),
                 gross=1200000, dist=127353, reinvest=127353, call_pct=6.0)
        # Mar 2025: 5% call, net $905,812 (gross $1,000,000 – distribution $94,188)
        add_call(dv, 2, date(2025, 3, 13),  date(2025, 3, 26),  date(2025, 3, 26),
                 gross=1000000, dist=94188, reinvest=94188, call_pct=5.0)
        # Jun 2025: 6% call, net $1,084,586 (gross $1,200,000 – distribution $115,414)
        add_call(dv, 3, date(2025, 6, 12),  date(2025, 6, 25),  date(2025, 6, 25),
                 gross=1200000, dist=115414, reinvest=115414, call_pct=6.0)
        # Sep 2025: 5% call, net $708,148 (gross $1,000,000 – distribution $291,852)
        add_call(dv, 4, date(2025, 9, 11),  date(2025, 9, 24),  date(2025, 9, 24),
                 gross=1000000, dist=291852, reinvest=291852, call_pct=5.0)
        # Distributions (deemed – already offset above; add actual cash distributions separately)
        add_dist(dv, date(2024, 12, 20), 127353, reinvest=127353, dist_type=DistributionType.DEEMED)
        add_dist(dv, date(2025, 3, 26),  94188,  reinvest=94188,  dist_type=DistributionType.DEEMED)
        add_dist(dv, date(2025, 6, 25),  115414, reinvest=115414, dist_type=DistributionType.DEEMED)
        add_dist(dv, date(2025, 9, 24),  291852, reinvest=291852, dist_type=DistributionType.DEEMED)

    # ── 3. NB Real Estate ─────────────────────────────────────────────────────────
    nb = get_fund("NB Real Estate")
    if nb:
        # Nov 2025: 5% = $250,000
        add_call(nb, 1, date(2025, 11, 7),  date(2025, 11, 21), date(2025, 11, 21),
                 gross=250000, call_pct=5.0, wire_ref="NBI13133")
        # Dec 2025: 10% gross = $500,000 – deemed dist $38,405.43 – tax $503 = net $462,097.57
        add_call(nb, 2, date(2025, 12, 5),  date(2025, 12, 19), date(2025, 12, 19),
                 gross=500000, dist=38405, reinvest=38405, call_pct=10.0, wire_ref="NBI13133")
        # Mar 2026: 4.5% = $225,000 + mgmt fee $31,250 – dist $30,554.85 = net $225,695.15
        add_call(nb, 3, date(2026, 3, 17),  date(2026, 3, 30),  date(2026, 3, 30),
                 gross=256250, dist=30555, reinvest=30555, call_pct=4.5, wire_ref="NBI14802")
        # Distributions
        add_dist(nb, date(2025, 11, 21), 38405,  reinvest=38405,  dist_type=DistributionType.DEEMED)
        add_dist(nb, date(2025, 12, 19), 38405,  reinvest=38405,  dist_type=DistributionType.DEEMED)
        add_dist(nb, date(2026, 3, 30),  30555,  reinvest=30555,  dist_type=DistributionType.DEEMED)

    # ── 4. Siguler Guff ───────────────────────────────────────────────────────────
    sg = get_fund("Siguler Guff")
    if sg:
        add_call(sg, 1, date(2026, 1, 6),  date(2026, 1, 13), date(2026, 1, 13),
                 gross=49000, call_pct=4.9, wire_ref="11873-Thirdwave Financial Inc.")
        add_call(sg, 2, date(2026, 2, 4),  date(2026, 2, 13), date(2026, 2, 13),
                 gross=49000, call_pct=4.9, wire_ref="11873-Thirdwave Financial Inc.")
        add_call(sg, 3, date(2026, 3, 5),  date(2026, 3, 16), date(2026, 3, 16),
                 gross=50000, call_pct=5.0, wire_ref="11873-Thirdwave Financial Inc.")
        add_call(sg, 4, date(2026, 4, 8),  date(2026, 4, 17), date(2026, 4, 17),
                 gross=33000, call_pct=3.3, wire_ref="11873-Thirdwave Financial Inc.")

    # ── 5. Capula ─────────────────────────────────────────────────────────────────
    cap = get_fund("Capula")
    if cap:
        # Initial investment: 2025/04/28
        add_call(cap, 1, date(2025, 4, 25), date(2025, 4, 28), date(2025, 4, 28),
                 gross=4999997, call_pct=100.0)
        # Semi-annual distribution: Jan 2026 – $145,236.84
        add_dist(cap, date(2026, 1, 29), 145236.84, dist_type=DistributionType.INCOME)
        # Reinvestment (call) for distribution: 2025/07/25
        add_call(cap, 2, date(2025, 7, 22), date(2025, 7, 25), date(2025, 7, 25),
                 gross=26873.96, call_pct=0.54)

    # ── 6. Hamilton Lane ──────────────────────────────────────────────────────────
    hl = get_fund("Hamilton Lane")
    if hl:
        # Wire sent 2025/09/09: USD 382,898
        add_call(hl, 1, date(2025, 9, 5), date(2025, 9, 9), date(2025, 9, 9),
                 gross=382898, call_pct=7.66)

    # ── 7. SDGs (JPY fund – skip USD capital calls) ───────────────────────────────
    # JPY fund – no USD amounts; kept for reference
    sdg = get_fund("SDGs")

    # ── 8. Asia Private Credit (placeholder) ─────────────────────────────────────
    apc = get_fund("Asia Private Credit")
    if apc:
        add_call(apc, 1, date(2024, 1, 10), date(2024, 1, 20), date(2024, 1, 20),
                 gross=750000, call_pct=25.0)
        add_call(apc, 2, date(2024, 7, 10), date(2024, 7, 20), date(2024, 7, 20),
                 gross=750000, call_pct=25.0)
        add_dist(apc, date(2025, 3, 31), 120000, dist_type=DistributionType.INCOME)

    # ── 9. Global Infrastructure (placeholder) ────────────────────────────────────
    infra = get_fund("Global Infrastructure")
    if infra:
        add_call(infra, 1, date(2024, 4, 5), date(2024, 4, 15), date(2024, 4, 15),
                 gross=1000000, call_pct=20.0)
        add_call(infra, 2, date(2024, 10, 5), date(2024, 10, 15), date(2024, 10, 15),
                 gross=750000, call_pct=15.0)
        add_dist(infra, date(2025, 6, 30), 90000, dist_type=DistributionType.INCOME)

    db.commit()
    print("✓ Seeded capital calls and distributions")
    db.close()


def main():
    print("🌱 Seeding Thirdwave IMS database...\n")
    try:
        reset_db()
        seed_fx_rates()
        seed_users()
        seed_funds()
        seed_capital_calls_and_distributions()
        print("\n✅ Seed complete! Login: admin@thirdwave.co.jp / admin123")
    except Exception as e:
        import traceback
        print(f"\n❌ Error: {e}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
