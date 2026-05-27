from decimal import Decimal
from datetime import date
from app.services.calculation_engine import CalculationEngine

def test_net_capital_call():
    result = CalculationEngine.net_capital_call(
        Decimal("187013"), Decimal("114653"), Decimal("18779")
    )
    assert result == Decimal("53581")

def test_unfunded_commitment():
    result = CalculationEngine.unfunded_commitment(
        Decimal("3000000"), Decimal("1447283"), Decimal("114653")
    )
    assert result == Decimal("1667370")

def test_drawn_percentage():
    result = CalculationEngine.drawn_percentage(
        Decimal("1447283"), Decimal("3000000")
    )
    assert result == Decimal("48.24")

def test_usd_to_jpy():
    result = CalculationEngine.convert_usd_to_jpy(
        Decimal("53581"), Decimal("150.0")
    )
    assert result == Decimal("8037150")

def test_dpi():
    result = CalculationEngine.dpi(
        Decimal("114653"), Decimal("1447283")
    )
    assert float(result) > 0