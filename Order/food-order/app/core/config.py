from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    firebase_credentials_path: str = "serviceAccountKey.json"
    firebase_api_key: str = ""
    firebase_auth_domain: str = ""
    firebase_project_id: str = ""
    firebase_storage_bucket: str = ""
    firebase_messaging_sender_id: str = ""
    firebase_app_id: str = ""
    app_secret_key: str = "dev-secret-key"
    app_env: str = "development"
    order_confirm_timeout_minutes: int = 15

    class Config:
        env_file = ".env"

settings = Settings()

# Firebase web config dict (for injecting into frontend HTML)
def get_firebase_web_config() -> dict:
    return {
        "apiKey": settings.firebase_api_key,
        "authDomain": settings.firebase_auth_domain,
        "projectId": settings.firebase_project_id,
        "storageBucket": settings.firebase_storage_bucket,
        "messagingSenderId": settings.firebase_messaging_sender_id,
        "appId": settings.firebase_app_id,
    }
