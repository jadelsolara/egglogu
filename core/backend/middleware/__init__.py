# Core middleware — rate limit, CORS, security headers
from backend.src.core.rate_limit import check_rate_limit, init_redis, close_redis
from backend.src.core.security import decode_token
