import os
import bcrypt
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select

# --- WORKAROUND FOR PASSLIB COMPATIBILITY WITH BCRYPT 4.0+ ---
# bcrypt 4.0+ restricts passwords to a maximum of 72 bytes and raises ValueError.
# passlib's internal compatibility check tries to run a test with a long password, which crashes.
# We intercept and wrap bcrypt's hashpw function to truncate long passwords and prevent crashes.
original_hashpw = bcrypt.hashpw
def safe_hashpw(password, salt):
    if len(password) > 72:
        password = password[:72]
    return original_hashpw(password, salt)
bcrypt.hashpw = safe_hashpw

from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

from database import get_session
from models import User

# Load config
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback-secret-key-12345")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# Security schema helper
security = HTTPBearer()

def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt via passlib.
    """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against its hashed value.
    """
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """
    Generate a JWT token with a 24-hour expiration (or custom expires_delta).
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=24)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session)
) -> User:
    """
    Dependency to extract and verify the JWT token from HTTP Authorization Header.
    """
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        badge_number: str = payload.get("sub")
        if badge_number is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = session.exec(select(User).where(User.badge_number == badge_number)).first()
    if user is None:
        raise credentials_exception
    return user

# Note: Level 12 (Home Minister) is political/administrative oversight, not a sworn police rank — kept distinct for accuracy.
RANK_LEVELS = {
    "Constable": 1,
    "Head Constable": 2,
    "Assistant Sub-Inspector": 3,
    "Sub-Inspector": 4,
    "Circle Inspector": 5,
    "Deputy Superintendent of Police": 6,
    "Superintendent of Police": 7,
    "Deputy Inspector General": 8,
    "Inspector General of Police": 9,
    "Additional Director General of Police": 10,
    "Director General of Police": 11,
    "Home Minister": 12,
}

def require_min_rank(min_rank: str):
    """
    Dependency factory that checks if current user has at least the specified min_rank level.
    """
    def rank_checker(current_user: User = Depends(get_current_user)) -> User:
        user_level = RANK_LEVELS.get(current_user.role, 0)
        required_level = RANK_LEVELS.get(min_rank, 0)
        if user_level < required_level or required_level == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires rank of {min_rank} or above"
            )
        return current_user
    return rank_checker

def require_oversight_access(current_user: User = None):
    """
    Dependency admitting any rank at level 7 (Superintendent of Police) or above for oversight/reporting.
    """
    if current_user is None:
        def checker(user: User = Depends(get_current_user)) -> User:
            user_level = RANK_LEVELS.get(user.role, 0)
            if user_level < 7:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Requires rank of Superintendent of Police or above"
                )
            return user
        return checker
    else:
        user_level = RANK_LEVELS.get(current_user.role, 0)
        if user_level < 7:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requires rank of Superintendent of Police or above"
            )
        return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency that allows ONLY users with is_admin=True (System Administrators).
    This is completely independent of operational police rank hierarchy.
    Normal police officers — even high-ranking ones — cannot access admin endpoints.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System Administrator access required"
        )
    return current_user
