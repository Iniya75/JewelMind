import os
import requests
import uuid
import logging
from sqlalchemy.orm import Session
from . import models, auth

logger = logging.getLogger(__name__)

def migrate_users_from_supabase(db: Session) -> bool:
    """
    Checks if users exist in MySQL. If not, fetches users from Supabase Auth
    and inserts them into MySQL with password reset requirement flags.
    """
    try:
        # 1. Check if users already exist in MySQL
        user_count = db.query(models.User).count()
        if user_count > 0:
            logger.info("Users already exist in MySQL database (count: %s). Skipping migration.", user_count)
            return False

        # 2. Check for Supabase configurations
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
        supabase_project_id = os.getenv("SUPABASE_PROJECT_ID")
        
        if not supabase_url and supabase_project_id:
            supabase_url = f"https://{supabase_project_id}.supabase.co"
            
        if not supabase_url or not supabase_service_role:
            logger.info("Supabase credentials not fully set. Skipping automatic user migration.")
            return False
            
        logger.info("No users found in MySQL. Starting automatic migration from Supabase Auth...")
        
        # 3. Call Supabase Admin Auth API to list users
        url = f"{supabase_url.rstrip('/')}/auth/v1/admin/users"
        headers = {
            "apikey": supabase_service_role,
            "Authorization": f"Bearer {supabase_service_role}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            logger.error("Failed to fetch users from Supabase: %s - %s", response.status_code, response.text)
            return False
            
        data = response.json()
        supabase_users = data.get("users", [])
        
        if not supabase_users:
            logger.info("No users found in Supabase Auth to migrate.")
            return True
            
        # 4. Save users to MySQL
        migrated_count = 0
        for su in supabase_users:
            email = su.get("email")
            if not email:
                continue
                
            # Duplicate check
            existing_user = db.query(models.User).filter(models.User.email == email).first()
            if existing_user:
                continue
                
            user_metadata = su.get("user_metadata", {}) or {}
            owner_name = (
                user_metadata.get("owner_name") or 
                user_metadata.get("full_name") or 
                user_metadata.get("name") or 
                "Owner"
            )
            shop_name = user_metadata.get("shop_name") or "My Jewellery Shop"
            
            # Since Supabase does not expose password hashes over the GoTrue admin API,
            # we set hashed_password to None and flag the user as requiring a password reset.
            new_user = models.User(
                id=su.get("id", str(uuid.uuid4())),
                email=email,
                hashed_password=None,
                owner_name=owner_name,
                shop_name=shop_name,
                reset_token="MIGRATION_RESET_REQUIRED"
            )
            db.add(new_user)
            migrated_count += 1
            
        db.commit()
        logger.info("Successfully migrated %s users from Supabase to MySQL database.", migrated_count)
        return True
        
    except Exception as e:
        logger.exception("Error occurred during Supabase user migration: %s", e)
        db.rollback()
        return False
