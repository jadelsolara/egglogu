# EGGlogU Models — all egg/poultry-specific data models
# These models reference core models (Organization, User, Farm) via ForeignKey
# but NEVER reference models from other verticals (pig, cow, etc.)

from backend.src.models.flock import Flock, BreedCurve
from backend.src.models.production import DailyProduction
from backend.src.models.health import Vaccine, Medication, Outbreak, StressEvent
from backend.src.models.feed import FeedPurchase, FeedConsumption
from backend.src.models.client import Client
from backend.src.models.finance import Income, Expense, Receivable
from backend.src.models.environment import EnvironmentReading, IoTReading, WeatherCache
from backend.src.models.operations import ChecklistItem, LogbookEntry, Personnel
from backend.src.models.analytics import KPISnapshot, Prediction
from backend.src.models.biosecurity import BiosecurityVisitor, BiosecurityZone, BiosecurityProtocol
from backend.src.models.traceability import TraceabilityBatch
from backend.src.models.trace_events import TraceEvent
from backend.src.models.planning import ProductionPlan
from backend.src.models.inventory import InventoryItem
from backend.src.models.grading import GradingStandard
from backend.src.models.purchase_order import PurchaseOrder
from backend.src.models.compliance import ComplianceRecord
from backend.src.models.cost_center import CostCenter
from backend.src.models.animal_welfare import WelfareScore
from backend.src.models.outbreak_alert import OutbreakAlert
from backend.src.models.accounting import JournalEntry
from backend.src.models.community import CommunityPost
from backend.src.models.support import SupportTicket, TicketMessage, FAQArticle
from backend.src.models.report import Report
from backend.src.models.workflow import Workflow
