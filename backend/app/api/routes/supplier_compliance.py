import os
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import aiofiles

from ...models.models import Supplier, RawMaterialDoc, VendorType, SupplierStatus
from ...models.base import gen_uuid
from ..deps import get_db
from ...core.config import settings

router = APIRouter(prefix="/supplier-compliance", tags=["Supplier Compliance"])


# ─── Email helper ─────────────────────────────────────────────────────────────

async def send_email(to_email: str, subject: str, body: str):
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        return False
    def _send():
        msg = MIMEMultipart()
        msg["From"] = settings.EMAIL_FROM or settings.SMTP_USER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(msg["From"], to_email, msg.as_string())
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send)
    return True


# ─── Suppliers ────────────────────────────────────────────────────────────────

@router.get("/suppliers")
async def list_suppliers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Supplier).order_by(Supplier.created_at.desc()))
    suppliers = result.scalars().all()
    return [_supplier_dict(s) for s in suppliers]


@router.post("/suppliers", status_code=201)
async def create_supplier(payload: dict, db: AsyncSession = Depends(get_db)):
    supplier = Supplier(
        id=gen_uuid(),
        name=payload["name"],
        raw_materials=payload.get("raw_materials", []),
        contact_email=payload["contact_email"],
        vendor_type=payload.get("vendor_type", VendorType.PREFERRED),
        status=payload.get("status", SupplierStatus.UNDER_REVIEW),
        comments=payload.get("comments"),
    )
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return _supplier_dict(supplier)


@router.patch("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, payload: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    for field in ("name", "raw_materials", "contact_email", "vendor_type", "status", "comments"):
        if field in payload:
            setattr(supplier, field, payload[field])

    await db.commit()
    await db.refresh(supplier)
    return _supplier_dict(supplier)


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    await db.delete(supplier)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/suppliers/{supplier_id}/send-request")
async def send_request_to_supplier(supplier_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    materials = ", ".join(supplier.raw_materials or []) or "N/A"
    subject = "Document Submission Request – Supplier Compliance Portal"
    body = f"""
    <p>Dear {supplier.name},</p>
    <p>We are reaching out to request compliance documentation for the following raw materials:</p>
    <p><strong>{materials}</strong></p>
    <p>Please submit your documents through our supplier compliance portal at your earliest convenience.</p>
    <p>Thank you,<br/>Compliance Team</p>
    """

    sent = await send_email(supplier.contact_email, subject, body)

    supplier.status = SupplierStatus.SENT_REQUEST
    await db.commit()

    return {"message": "Request sent" if sent else "Status updated (email not configured)", "email_sent": sent}


# ─── Raw Material Documents ───────────────────────────────────────────────────

@router.get("/documents")
async def list_documents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RawMaterialDoc).order_by(RawMaterialDoc.created_at.desc()))
    docs = result.scalars().all()
    return [_doc_dict(d) for d in docs]


@router.post("/documents", status_code=201)
async def upload_document(
    supplier_id: Optional[str] = Form(None),
    supplier_name: str = Form(...),
    document_type: str = Form(...),
    raw_materials: str = Form(...),  # comma-separated
    expiry_date: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    uploads_dir = settings.UPLOADS_DIR
    os.makedirs(uploads_dir, exist_ok=True)

    doc_id = gen_uuid()
    ext = os.path.splitext(file.filename or "")[1]
    safe_filename = f"{doc_id}{ext}"
    file_path = os.path.join(uploads_dir, safe_filename)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    parsed_date = None
    if expiry_date:
        from datetime import datetime
        parsed_date = datetime.strptime(expiry_date, "%Y-%m-%d").date()

    materials_list = [m.strip() for m in raw_materials.split(",") if m.strip()]

    doc = RawMaterialDoc(
        id=doc_id,
        supplier_id=supplier_id or None,
        supplier_name=supplier_name,
        file_name=file.filename or safe_filename,
        file_path=file_path,
        document_type=document_type,
        raw_materials=materials_list,
        expiry_date=parsed_date,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_dict(doc)


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RawMaterialDoc).where(RawMaterialDoc.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(doc.file_path, filename=doc.file_name)


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RawMaterialDoc).where(RawMaterialDoc.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.file_path and os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    await db.delete(doc)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/documents/check-expiry")
async def check_expiry_and_notify(db: AsyncSession = Depends(get_db)):
    today = date.today()
    result = await db.execute(
        select(RawMaterialDoc).where(
            RawMaterialDoc.expiry_date != None,
            RawMaterialDoc.expiry_date <= today,
            RawMaterialDoc.notification_sent == False,
        )
    )
    expired_docs = result.scalars().all()

    notified = []
    for doc in expired_docs:
        # Find supplier email
        email = None
        if doc.supplier_id:
            s_result = await db.execute(select(Supplier).where(Supplier.id == doc.supplier_id))
            supplier = s_result.scalar_one_or_none()
            if supplier:
                email = supplier.contact_email

        if email:
            materials = ", ".join(doc.raw_materials or []) or "N/A"
            subject = f"Document Expiry Notice – {doc.file_name}"
            body = f"""
            <p>Dear Supplier ({doc.supplier_name}),</p>
            <p>This is to notify you that your document <strong>{doc.file_name}</strong>
            (Type: {doc.document_type}) for the following raw materials has expired:</p>
            <p><strong>{materials}</strong></p>
            <p>Expiry Date: <strong>{doc.expiry_date}</strong></p>
            <p>Please submit an updated document at your earliest convenience.</p>
            <p>Thank you,<br/>Compliance Team</p>
            """
            sent = await send_email(email, subject, body)
            if sent:
                doc.notification_sent = True
                notified.append(doc.file_name)

    await db.commit()
    return {"checked": len(expired_docs), "notified": notified}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _supplier_dict(s: Supplier) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "raw_materials": s.raw_materials or [],
        "contact_email": s.contact_email,
        "vendor_type": s.vendor_type,
        "status": s.status,
        "comments": s.comments,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _doc_dict(d: RawMaterialDoc) -> dict:
    return {
        "id": d.id,
        "supplier_id": d.supplier_id,
        "supplier_name": d.supplier_name,
        "file_name": d.file_name,
        "document_type": d.document_type,
        "raw_materials": d.raw_materials or [],
        "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
        "notification_sent": d.notification_sent,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }
