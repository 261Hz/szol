from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    DATABASE_URL: str
    DATABASE_PORT: str
    DATABASE_NAME: str
    DATABASE_ROOT_USER: str
    DATABASE_ROOT_PASSWORD: str
    GROQ_API_KEY: str = ""

    RESEND_API_KEY:  str = ""
    RESEND_FROM:     str = "Szol <noreply@szol.app>"
    FRONTEND_URL:    str = "https://szol.app"
    BACKEND_URL:     str = "https://szol.onrender.com"

    class Config:
        env_file = ".env"



settings = Settings()