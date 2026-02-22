#!/usr/bin/env python3
"""
Extract data from scanned (image-only) PDFs and upsert to Supabase.

Parses: dates (pickup, delivery, invoice), origin/dest (city, state, zip),
financials (total rate, line haul, accessorials, factoring), load specs
(commodity, weight, equipment), broker name, truck #.

Usage:
  python extract_invoice.py path/to/file.pdf --user-id "<supabase-auth-uid>"
  python extract_invoice.py path/to/folder/ --user-id "<uid>"

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY),
     optional NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
     Optional EXTRACT_USE_LLM=1 and OPENAI_API_KEY for LLM fallback parsing.
"""

import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Load env before other imports that use it
def _load_env():
    try:
        from dotenv import load_dotenv
    except ImportError:
        print("Run with the venv so deps are available: source venv/bin/activate", file=sys.stderr)
        raise SystemExit(1)
    load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")
    load_dotenv()

_load_env()

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import supabase


# --- OCR: PDF pages -> raw text ---
def pdf_to_images(pdf_path: str) -> list[Image.Image]:
    doc = fitz.open(pdf_path)
    images = []
    for i in range(len(doc)):
        page = doc.load_page(i)
        pix = page.get_pixmap(dpi=150, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    doc.close()
    return images


def ocr_images(images: list[Image.Image]) -> str:
    blocks = []
    for img in images:
        text = pytesseract.image_to_string(img, config="--psm 6")
        blocks.append(text)
    return "\n\n".join(blocks)


# --- Regex-based extraction (works without API) ---
def _re_date(s: str) -> list[tuple[str, str]]:
    """Return list of (label_hint, date_str) from text."""
    # Common patterns: MM/DD/YYYY, MM-DD-YYYY, Month DD, YYYY, etc.
    patterns = [
        (r"(?:pickup|pick\s*up|pu)\s*date[:\s]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "pickup_date"),
        (r"(?:delivery|deliv)\s*date[:\s]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "delivery_date"),
        (r"(?:invoice|inv)\s*date[:\s]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "invoice_date"),
        (r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "date_generic"),
    ]
    found = []
    seen = set()
    text_lower = s.lower()
    for pat, label in patterns:
        for m in re.finditer(pat, text_lower, re.I):
            g = m.group(1).strip()
            if g and g not in seen:
                seen.add(g)
                found.append((label, g))
    return found


def _re_money(s: str) -> list[tuple[str, float]]:
    """Find dollar amounts with optional labels."""
    # $1,234.56 or 1234.56
    amount_re = re.compile(r"\$?\s*([\d,]+(?:\.\d{2})?)")
    labels = [
        (r"total\s*rate|total\s*amount|grand\s*total|amount\s*due", "total_rate"),
        (r"line\s*haul|linehaul", "line_haul"),
        (r"detention", "detention"),
        (r"lumper|lumpers", "lumper"),
        (r"accessorial|accessorials", "accessorials"),
        (r"factoring|factor\s*fee", "factoring_fee"),
    ]
    results = []
    lines = s.replace("\r", "\n").split("\n")
    for line in lines:
        line_lower = line.lower()
        for label_pat, key in labels:
            if re.search(label_pat, line_lower):
                nums = amount_re.findall(line.replace(",", ""))
                for n in nums:
                    try:
                        results.append((key, float(n)))
                        break
                    except ValueError:
                        pass
                break
    # Fallback: look for "Total" or "Amount" and next number on same/next line
    if not any(k == "total_rate" for k, _ in results):
        for m in re.finditer(r"(?:total|amount\s*due)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)", s, re.I):
            try:
                results.append(("total_rate", float(m.group(1).replace(",", ""))))
                break
            except ValueError:
                pass
    return results


def _re_location(s: str, which: str) -> dict:
    """Extract origin or destination city/state/zip. which in ('origin','destination')."""
    out = {"city": None, "state": None, "zip": None}
    pat = re.compile(
        r"(?:origin|from|pickup|ship\s*from)\s*[:\s]*([^\n]+?)(?:\s+(\w{2}))?\s+(\d{5}(?:-\d{4})?)?"
        if which == "origin"
        else r"(?:destination|dest|to|delivery|ship\s*to)\s*[:\s]*([^\n]+?)(?:\s+(\w{2}))?\s+(\d{5}(?:-\d{4})?)?",
        re.I,
    )
    for m in pat.finditer(s):
        city_part = (m.group(1) or "").strip().rstrip(",")
        state = m.group(2)
        zip_part = m.group(3)
        if city_part:
            out["city"] = city_part[:100]
        if state:
            out["state"] = state.upper()[:2]
        if zip_part:
            out["zip"] = zip_part
        break
    # Fallback: "City, ST 12345" pattern
    if not out["city"]:
        generic = re.compile(r"([A-Za-z\s\.\-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)")
        for m in generic.finditer(s):
            out["city"] = m.group(1).strip()[:100]
            out["state"] = m.group(2).upper()
            out["zip"] = m.group(3)
            break
    return out


def _re_commodity_weight_equipment(s: str) -> dict:
    out = {"commodity": None, "weight": None, "equipment_type": None}
    # Weight: 43,500 lbs or 43500 lb
    w = re.search(r"(\d{1,3}(?:,\d{3})*)\s*(?:lbs?|pounds)", s, re.I)
    if w:
        try:
            out["weight"] = int(w.group(1).replace(",", ""))
        except ValueError:
            pass
    # Commodity: often "Commodity: ..." or "Description: ..."
    for label in ["commodity", "description", "product", "freight"]:
        m = re.search(rf"{label}\s*[:\s]+([^\n]+)", s, re.I)
        if m:
            out["commodity"] = m.group(1).strip()[:200]
            break
    # Equipment: dry van, reefer, flatbed, etc.
    for eq in ["dry van", "reefer", "flatbed", "step deck", "hot shot", "box truck", "53'", "48'", "53ft", "48ft"]:
        if re.search(re.escape(eq), s, re.I):
            out["equipment_type"] = eq
            break
    return out


def _re_broker_truck(s: str) -> dict:
    out = {"broker_name": None, "truck_number": None}
    for label in ["broker", "carrier", "dispatcher", "company"]:
        m = re.search(rf"{label}\s*[:\s]+([^\n]+)", s, re.I)
        if m:
            out["broker_name"] = m.group(1).strip()[:200]
            break
    m = re.search(r"truck\s*#?\s*[:\s]*([A-Za-z0-9\-]+)", s, re.I)
    if m:
        out["truck_number"] = m.group(1).strip()[:50]
    return out


def extract_structured(raw_text: str) -> dict:
    """Build one structured payload from raw OCR text."""
    payload = {
        "pickup_date": None,
        "delivery_date": None,
        "invoice_date": None,
        "origin_city": None,
        "origin_state": None,
        "origin_zip": None,
        "destination_city": None,
        "destination_state": None,
        "destination_zip": None,
        "total_rate": None,
        "line_haul": None,
        "accessorials": {},
        "detention": None,
        "lumper": None,
        "factoring_fee": None,
        "commodity": None,
        "weight": None,
        "equipment_type": None,
        "broker_name": None,
        "truck_number": None,
    }

    dates = _re_date(raw_text)
    for label, val in dates:
        if label == "pickup_date" and not payload["pickup_date"]:
            payload["pickup_date"] = _normalize_date(val)
        elif label == "delivery_date" and not payload["delivery_date"]:
            payload["delivery_date"] = _normalize_date(val)
        elif label == "invoice_date" and not payload["invoice_date"]:
            payload["invoice_date"] = _normalize_date(val)
        elif label == "date_generic":
            if not payload["pickup_date"]:
                payload["pickup_date"] = _normalize_date(val)
            elif not payload["delivery_date"]:
                payload["delivery_date"] = _normalize_date(val)
            elif not payload["invoice_date"]:
                payload["invoice_date"] = _normalize_date(val)

    origin = _re_location(raw_text, "origin")
    payload["origin_city"] = origin.get("city")
    payload["origin_state"] = origin.get("state")
    payload["origin_zip"] = origin.get("zip")

    dest = _re_location(raw_text, "destination")
    payload["destination_city"] = dest.get("city")
    payload["destination_state"] = dest.get("state")
    payload["destination_zip"] = dest.get("zip")

    for key, amount in _re_money(raw_text):
        if key == "total_rate":
            payload["total_rate"] = amount
        elif key == "line_haul":
            payload["line_haul"] = amount
        elif key == "detention":
            payload["detention"] = amount
            payload["accessorials"]["detention"] = amount
        elif key == "lumper":
            payload["lumper"] = amount
            payload["accessorials"]["lumper"] = amount
        elif key == "accessorials":
            payload["accessorials"]["other"] = amount
        elif key == "factoring_fee":
            payload["factoring_fee"] = amount

    spec = _re_commodity_weight_equipment(raw_text)
    payload["commodity"] = spec.get("commodity")
    payload["weight"] = spec.get("weight")
    payload["equipment_type"] = spec.get("equipment_type")

    broker_truck = _re_broker_truck(raw_text)
    payload["broker_name"] = broker_truck.get("broker_name")
    payload["truck_number"] = broker_truck.get("truck_number")

    return payload


def _normalize_date(s: str) -> str | None:
    """Try to return YYYY-MM-DD."""
    if not s:
        return None
    s = s.strip()
    # MM/DD/YYYY or MM-DD-YYYY
    m = re.match(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", s)
    if m:
        mm, dd, yy = m.group(1), m.group(2), m.group(3)
        yyyy = int(yy) if len(yy) == 4 else 2000 + int(yy)
        return f"{yyyy}-{int(mm):02d}-{int(dd):02d}"
    return s


# --- Optional LLM extraction ---
def extract_with_llm(raw_text: str) -> dict | None:
    try:
        from openai import OpenAI
        client = OpenAI()
        prompt = """Extract from this OCR text from a freight invoice/BOL. Return only valid JSON with these keys (use null if not found):
pickup_date, delivery_date, invoice_date (YYYY-MM-DD),
origin_city, origin_state, origin_zip,
destination_city, destination_state, destination_zip,
total_rate, line_haul, detention, lumper, factoring_fee (numbers),
commodity, weight (integer lbs), equipment_type,
broker_name, truck_number.

Text:
"""
        resp = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": prompt + raw_text[:12000]}],
            max_tokens=800,
        )
        import json
        content = resp.choices[0].message.content or "{}"
        content = content.strip().removeprefix("```json").removeprefix("```").strip()
        return json.loads(content)
    except Exception as e:
        print(f"LLM extraction failed: {e}", file=sys.stderr)
        return None


# --- Supabase ---
def get_supabase():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    # Prefer service_role so script bypasses RLS (anon key triggers "row-level security policy" errors)
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env.local")
    if not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        print("Warning: Using anon key; RLS may block inserts. Set SUPABASE_SERVICE_ROLE_KEY in .env.local to fix.", file=sys.stderr)
    return supabase.create_client(url, key)


def ensure_company(sb, name: str, company_type: str = "broker") -> str | None:
    """Upsert company by name; return id."""
    if not name or not name.strip():
        return None
    name = name.strip()[:200]
    r = sb.table("companies").select("id").eq("name", name).eq("company_type", company_type).limit(1).execute()
    if r.data and len(r.data) > 0:
        return r.data[0]["id"]
    ins = sb.table("companies").insert({"name": name, "company_type": company_type}).execute()
    if ins.data and len(ins.data) > 0:
        return ins.data[0]["id"]
    return None


def process_pdf(
    pdf_path: str,
    user_id: str | None,
    sb,
    use_llm: bool = False,
    document_type: str = "invoice",
) -> dict:
    """OCR PDF, extract data, insert document + company + rate. Returns {document_id, extracted, error}."""
    pdf_path = Path(pdf_path)
    if not pdf_path.is_file() or pdf_path.suffix.lower() != ".pdf":
        return {"document_id": None, "extracted": None, "error": "Not a PDF file"}

    try:
        images = pdf_to_images(str(pdf_path))
        raw_text = ocr_images(images)
    except Exception as e:
        return {"document_id": None, "extracted": None, "error": f"OCR failed: {e}"}

    if use_llm and os.environ.get("OPENAI_API_KEY"):
        extracted = extract_with_llm(raw_text)
        if extracted:
            # Normalize keys to match our payload
            extracted.setdefault("accessorials", {})
            if extracted.get("detention") is not None:
                extracted["accessorials"]["detention"] = extracted["detention"]
            if extracted.get("lumper") is not None:
                extracted["accessorials"]["lumper"] = extracted["lumper"]
    else:
        extracted = extract_structured(raw_text)

    metadata = {"extracted": extracted}
    if user_id:
        metadata["user_id"] = user_id

    doc_row = {
        "filename": pdf_path.name,
        "file_type": "pdf",
        "document_type": document_type,
        "status": "processing",
        "raw_text": raw_text[:50000],
        "metadata": metadata,
    }
    if user_id:
        doc_row["user_id"] = user_id

    try:
        ins = sb.table("documents").insert(doc_row).execute()
        if not ins.data or len(ins.data) == 0:
            return {"document_id": None, "extracted": extracted, "error": "Failed to insert document"}
        doc_id = ins.data[0]["id"]
    except Exception as e:
        err_str = str(e)
        if "42501" in err_str or "row-level security" in err_str.lower():
            return {
                "document_id": None,
                "extracted": extracted,
                "error": "RLS blocked insert. Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Dashboard → Settings → API → service_role).",
            }
        if user_id and "user_id" in err_str.lower():
            doc_row.pop("user_id", None)
            try:
                ins = sb.table("documents").insert(doc_row).execute()
                if ins.data and len(ins.data) > 0:
                    doc_id = ins.data[0]["id"]
                else:
                    return {"document_id": None, "extracted": extracted, "error": "Failed to insert document"}
            except Exception as e2:
                return {"document_id": None, "extracted": extracted, "error": str(e2)}
        else:
            return {"document_id": None, "extracted": extracted, "error": err_str}

    # Update status to extracted
    try:
        sb.table("documents").update({"status": "extracted", "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", doc_id).execute()
    except Exception:
        pass

    # Upsert broker company and create rate if we have lane + rate
    company_id = None
    if extracted.get("broker_name"):
        company_id = ensure_company(sb, extracted["broker_name"], "broker")

    origin_city = (extracted.get("origin_city") or "").strip() or "Unknown"
    origin_state = (extracted.get("origin_state") or "").strip() or "XX"
    dest_city = (extracted.get("destination_city") or "").strip() or "Unknown"
    dest_state = (extracted.get("destination_state") or "").strip() or "XX"
    if company_id and (extracted.get("total_rate") is not None or extracted.get("line_haul") is not None):
        rate_amount = extracted.get("total_rate") or extracted.get("line_haul") or 0
        accessorial_fees = extracted.get("accessorials") or {}
        try:
            sb.table("rates").insert({
                "document_id": doc_id,
                "company_id": company_id,
                "origin_city": origin_city[:100],
                "origin_state": origin_state[:2],
                "destination_city": dest_city[:100],
                "destination_state": dest_state[:2],
                "rate_type": "flat",
                "rate_amount": rate_amount,
                "accessorial_fees": accessorial_fees,
                "equipment_type": (extracted.get("equipment_type") or "")[:50] or None,
                "min_weight": extracted.get("weight"),
            }).execute()
        except Exception as e:
            print(f"Rate insert failed: {e}", file=sys.stderr)

    return {"document_id": doc_id, "extracted": extracted, "error": None}


def main():
    ap = argparse.ArgumentParser(description="Extract invoice/BOL data from scanned PDFs and save to Supabase")
    ap.add_argument("path", help="Path to a PDF file or directory of PDFs")
    ap.add_argument("--user-id", dest="user_id", default=os.environ.get("SUPABASE_USER_ID"), help="Supabase Auth user ID (links document to account)")
    ap.add_argument("--use-llm", action="store_true", default=os.environ.get("EXTRACT_USE_LLM") == "1", help="Use OpenAI to parse OCR text (set OPENAI_API_KEY)")
    ap.add_argument("--document-type", default="invoice", choices=["invoice", "bol", "rate_sheet", "contract", "other"], help="document_type for Supabase")
    args = ap.parse_args()

    sb = get_supabase()
    path = Path(args.path)
    if path.is_file():
        files = [path]
    elif path.is_dir():
        files = sorted(path.glob("*.pdf"))
    else:
        print("Path not found:", path, file=sys.stderr)
        sys.exit(1)

    for f in files:
        print("Processing:", f.name)
        out = process_pdf(str(f), args.user_id, sb, use_llm=args.use_llm, document_type=args.document_type)
        if out["error"]:
            print("  Error:", out["error"])
        else:
            print("  Document ID:", out["document_id"])
            print("  Extracted:", out["extracted"])
    print("Done.")


if __name__ == "__main__":
    main()
