from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    DATABASE_URL: str
    DATABASE_PORT: str
    DATABASE_NAME: str
    DATABASE_ROOT_USER: str
    DATABASE_ROOT_PASSWORD: str
    GROQ_API_KEY: str = ""

    RESEND_API_KEY:  str = ""
    RESEND_FROM:     str = "Szol <noreply@yourdomain.com>"

    # Alternative: Gmail SMTP (free). Set both to use Gmail instead of Resend.
    GMAIL_USER:         str = ""   # your.address@gmail.com
    GMAIL_APP_PASSWORD: str = ""   # 16-char app password from myaccount.google.com

    FRONTEND_URL:    str = "https://szol.vercel.app"
    BACKEND_URL:     str = "https://szol.onrender.com"
    TURNSTILE_SECRET:  str = ""   # Cloudflare Turnstile secret key
    YOUTUBE_API_KEY:   str = ""   # YouTube Data API v3 key (same one used in Vite frontend)
    WORKER_SECRET:          str = ""   # shared secret for local worker.py
    HF_TOKEN:               str = ""   # Hugging Face API token (for Gemma 4 inference)
    GUEST_JWT_EXPIRE_HOURS: int = 48   # guests get short-lived tokens; no refresh

    class Config:
        env_file = ".env"



settings = Settings()