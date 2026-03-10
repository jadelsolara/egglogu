# Core models — generic, reusable across all verticals
# These are the ONLY models that egg/pig/cow modules can reference via ForeignKey

from backend.src.models.base import Base
from backend.src.models.auth import Organization, User, Role
from backend.src.models.farm import Farm
from backend.src.models.subscription import Subscription
from backend.src.models.security import LoginAuditLog, UserSession, UserTOTP, KnownDevice
from backend.src.models.audit import AuditLog
from backend.src.models.lead import Lead
