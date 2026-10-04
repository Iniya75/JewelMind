from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid

from .. import schemas, models, auth, database

router = APIRouter(prefix="/api/users", tags=["users"])

def _profile_dict(user: models.User) -> dict:
    """Serialize user to OwnerProfile response."""
    return {
        "ownerName": user.owner_name or "",
        "shopName": user.shop_name or "",
        "gstin": user.gstin or "",
        "city": user.city or "",
        "phone": user.phone or "",
        "address": user.address or "",
        "createdAt": user.created_at.isoformat() if user.created_at else "",
        "email": user.email,
    }

@router.get("/me", response_model=schemas.OwnerProfile)
def get_profile(current_user: models.User = Depends(auth.get_current_user)):
    return _profile_dict(current_user)

@router.put("/me", response_model=schemas.OwnerProfile)
def update_profile(
    profile: schemas.ProfileUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    current_user.owner_name = profile.ownerName
    current_user.shop_name = profile.shopName
    current_user.gstin = profile.gstin or None
    current_user.city = profile.city or None
    current_user.phone = profile.phone or None
    current_user.address = profile.address or None
    db.commit()
    db.refresh(current_user)
    return _profile_dict(current_user)
