from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/roots", tags=["roots"])

class RootsReq(BaseModel):
    words: list[str]
    lang: str

@router.post("/analyze")
async def analyze_roots(req: RootsReq):
    return {"roots": {}}
