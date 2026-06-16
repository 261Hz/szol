from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/collections", tags=["Collections"])


def _is_available(doc: models.CollectionDocument, tm: int, td: int) -> bool:
    if doc.calendar_month is None:
        return True
    if doc.calendar_month < tm:
        return True
    if doc.calendar_month == tm and doc.calendar_day <= td:
        return True
    return False


def _is_today(doc: models.CollectionDocument, tm: int, td: int) -> bool:
    return doc.calendar_month == tm and doc.calendar_day == td


def _doc_dict(doc: models.CollectionDocument, available: bool) -> dict:
    return {
        "id":             doc.id,
        "collection_id":  doc.collection_id,
        "doc_number":     doc.doc_number,
        "calendar_month": doc.calendar_month,
        "calendar_day":   doc.calendar_day,
        "document_type":  doc.document_type,
        "voice":          doc.voice,
        "title":          doc.title,
        "content":        doc.content,
        "locator":        doc.locator,
        "available":      available,
    }


@router.get("/today", response_model=List[schemas.TodayDocumentResponse])
def today_documents(lang: str, db: Session = Depends(get_db)):
    """Documents whose diegetic date matches today, across all collections for this lang."""
    today = date.today()
    tm, td = today.month, today.day
    rows = (
        db.query(models.CollectionDocument)
        .join(models.Collection)
        .filter(
            models.Collection.lang == lang,
            models.CollectionDocument.calendar_month == tm,
            models.CollectionDocument.calendar_day == td,
        )
        .options(joinedload(models.CollectionDocument.collection))
        .order_by(models.CollectionDocument.collection_id, models.CollectionDocument.doc_number)
        .all()
    )
    return [
        {
            "collection_id":    doc.collection_id,
            "collection_title": doc.collection.title,
            "collection_author": doc.collection.author,
            "adapter":          doc.collection.adapter,
            "adapter_config":   doc.collection.adapter_config,
            "document":         _doc_dict(doc, available=True),
        }
        for doc in rows
    ]


@router.get("/", response_model=List[schemas.CollectionResponse])
def list_collections(lang: str, db: Session = Depends(get_db)):
    """All collections for a language with availability summary counts."""
    today = date.today()
    tm, td = today.month, today.day
    cols = (
        db.query(models.Collection)
        .filter(models.Collection.lang == lang)
        .options(joinedload(models.Collection.documents))
        .all()
    )
    result = []
    for c in cols:
        available = [d for d in c.documents if _is_available(d, tm, td)]
        today_docs = [d for d in c.documents if _is_today(d, tm, td)]
        result.append({
            "id":                  c.id,
            "title":               c.title,
            "lang":                c.lang,
            "description":         c.description,
            "author":              c.author,
            "source":              c.source,
            "adapter":             c.adapter,
            "adapter_config":      c.adapter_config,
            "today_count":         len(today_docs),
            "total_documents":     len(c.documents),
            "available_documents": len(available),
        })
    return result


@router.get("/{collection_id}", response_model=schemas.CollectionDetailResponse)
def get_collection(collection_id: int, db: Session = Depends(get_db)):
    """One collection with all documents and per-document availability flag."""
    today = date.today()
    tm, td = today.month, today.day
    c = (
        db.query(models.Collection)
        .filter(models.Collection.id == collection_id)
        .options(joinedload(models.Collection.documents))
        .first()
    )
    if not c:
        raise HTTPException(404, "Collection not found")

    docs = [
        _doc_dict(d, _is_available(d, tm, td))
        for d in sorted(c.documents, key=lambda x: x.doc_number)
    ]
    available  = [d for d in c.documents if _is_available(d, tm, td)]
    today_docs = [d for d in c.documents if _is_today(d, tm, td)]

    return {
        "id":                  c.id,
        "title":               c.title,
        "lang":                c.lang,
        "description":         c.description,
        "author":              c.author,
        "source":              c.source,
        "adapter":             c.adapter,
        "adapter_config":      c.adapter_config,
        "today_count":         len(today_docs),
        "total_documents":     len(docs),
        "available_documents": len(available),
        "documents":           docs,
    }
