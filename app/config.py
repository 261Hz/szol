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
    GOOGLE_API_KEY:  str = ""  # accepted as GOOGLE_API_KEY
    GEMINI_API_KEY:  str = ""  # also accepted as GEMINI_API_KEY (Render default name)

    class Config:
        env_file = ".env"



settings = Settings()