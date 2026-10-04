from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from email.message import EmailMessage
import hashlib
import logging
import os
import secrets
import smtplib
import ssl
import uuid

from .. import schemas, models, auth, database

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

@router.post("/register", response_model=schemas.Token)
def register(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(
        id=str(uuid.uuid4()),
        email=user.email,
        hashed_password=hashed_password,
        owner_name=user.name,
        shop_name=user.shop_name or "My Jewellery Shop"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": new_user.id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=schemas.Token)
def login(user: schemas.UserLogin, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Check if this user was migrated and needs a password reset
    if db_user.hashed_password is None or db_user.reset_token == "MIGRATION_RESET_REQUIRED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="password_reset_required"
        )
        
    if not auth.verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": db_user.id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/forgot-password")
def forgot_password(req: schemas.ForgotPasswordRequest, db: Session = Depends(database.get_db)):
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    if not smtp_host:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset email delivery is not configured.",
        )

    db_user = db.query(models.User).filter(models.User.email == req.email).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Email not registered")
        
    token = f"{secrets.randbelow(900000) + 100000}"
    db_user.reset_token = hashlib.sha256(token.encode("utf-8")).hexdigest()
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not store password reset token")
        raise HTTPException(status_code=500, detail="Could not start password reset.")

    message = EmailMessage()
    message["Subject"] = "JewelMind password reset"
    message["From"] = os.getenv("SMTP_FROM", os.getenv("SMTP_USER", ""))
    message["To"] = db_user.email
    message.set_content(f"Your JewelMind password reset code is {token}. It expires when used.")

    try:
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            if os.getenv("SMTP_STARTTLS", "true").lower() == "true":
                server.starttls(context=ssl.create_default_context())
            smtp_user = os.getenv("SMTP_USER", "").strip()
            smtp_password = os.getenv("SMTP_PASSWORD", "")
            if smtp_user:
                server.login(smtp_user, smtp_password)
            server.send_message(message)
    except Exception:
        db_user.reset_token = None
        try:
            db.commit()
        except Exception:
            db.rollback()
        logger.exception("Could not deliver password reset email")
        raise HTTPException(status_code=503, detail="Could not deliver password reset email.")

    return {"message": "Password reset instructions were sent to the account email."}

@router.post("/reset-password")
def reset_password(req: schemas.ResetPasswordRequest, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == req.email).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Email not registered")
        
    token_hash = hashlib.sha256(req.token.encode("utf-8")).hexdigest()
    if not db_user.reset_token or db_user.reset_token not in {req.token, token_hash}:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
    # Update password and clear reset token
    db_user.hashed_password = auth.get_password_hash(req.new_password)
    db_user.reset_token = None
    db.commit()
    
    return {"message": "Password reset successfully"}

@router.post("/logout")
def logout():
    return {"message": "Successfully logged out"}

@router.post("/refresh-token", response_model=schemas.Token)
def refresh_token(current_user: models.User = Depends(auth.get_current_user)):
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": current_user.id}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
