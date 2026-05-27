import json
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog


def log_action(db: Session, action: str, table_name: str,
               user_email: str = None, user_id: str = None,
               record_id: str = None, old_values: dict = None,
               new_values: dict = None, ip_address: str = None):
    log = AuditLog(
        user_id    = str(user_id) if user_id else None,
        user_email = user_email,
        action     = action,
        table_name = table_name,
        record_id  = str(record_id) if record_id else None,
        old_values = json.dumps(old_values, default=str) if old_values else None,
        new_values = json.dumps(new_values, default=str) if new_values else None,
        ip_address = ip_address,
    )
    db.add(log)
