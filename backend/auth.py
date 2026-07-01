import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import User

JWT_SECRET = os.environ.get("JWT_SECRET", "stockhome-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer()


# ---------- Hash des mots de passe ----------
# Nouveaux comptes : bcrypt.
# Comptes hérités de DynamoDB (auth_service.py) : format "salt$sha256hex".
# verify_password() reconnaît les deux ; needs_rehash() indique s'il faut
# migrer silencieusement vers bcrypt au premier login réussi.

def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def _is_legacy_hash(stored: str) -> bool:
    # Les hash bcrypt commencent toujours par "$2a$", "$2b$" ou "$2y$"
    return not stored.startswith("$2")


def _verify_legacy_sha256(password: str, stored: str) -> bool:
    try:
        salt, stored_hash = stored.split("$")
    except ValueError:
        return False
    current_hash = hashlib.sha256(f"{password}{salt}".encode("utf-8")).hexdigest()
    return current_hash == stored_hash


def verify_password(password: str, stored_hash: str) -> bool:
    """Vérifie un mot de passe contre un hash bcrypt OU un ancien hash DynamoDB."""
    if _is_legacy_hash(stored_hash):
        return _verify_legacy_sha256(password, stored_hash)
    return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))


def needs_rehash(stored_hash: str) -> bool:
    return _is_legacy_hash(stored_hash)


# ---------- JWT ----------

def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode = {"sub": str(user_id), "exp": expire}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
