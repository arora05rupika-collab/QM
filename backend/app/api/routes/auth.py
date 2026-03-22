from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...models.models import User, Organization
from ...schemas.schemas import RegisterRequest, LoginRequest, TokenResponse, MessageResponse
from ...core.security import hash_password, verify_password, create_access_token
from ...models.base import gen_uuid
from ..deps import get_db

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=MessageResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    org = Organization(id=gen_uuid(), name=body.org_name)
    db.add(org)
    await db.flush()

    user = User(
        id=gen_uuid(),
        org_id=org.id,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="admin",
    )
    db.add(user)
    await db.commit()
    return {"message": "Registration successful"}


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.id, "org_id": user.org_id, "role": user.role})
    return {"access_token": token}
