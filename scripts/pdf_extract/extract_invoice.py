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
import json
import os
import re
import sys
import time
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


# Total rate = load rate/price (total $ for the load). Used for rates.rate_amount / metadata (Supabase).
COST_FIELDS_BASE = ("amount_due", "total_rate", "line_haul")  # priority order for base cost


def _re_money(s: str) -> list[tuple[str, float]]:
    """Find dollar amounts. total_rate = rate/price (total $ for load); never use per-mile rate as total_rate."""
    amount_re = re.compile(r"\$?\s*([\d,]+(?:\.\d{2})?)")
    # Match rate_per_mile before generic "rate" so $/mi is not stored as total_rate.
    labels = [
        (r"amount\s*due|balance\s*due|balance\s*owed|amount\s*owed|payable\s*amount", "amount_due"),
        (r"rate\s*per\s*mile|per\s*mile|/\s*mi\b|\$\s*per\s*mile|rpm\b", "rate_per_mile"),
        (r"total\s*rate|total\s*amount|grand\s*total|invoice\s*total|total\s*charges|total\s*due|"
         r"sum\s*due|net\s*amount|pay\s*this\s*amount|freight\s*total|total\s*freight|"
         r"shipment\s*total|total\s*invoice|bill\s*total|"
         r"price\b|load\s*rate|freight\s*rate|\brate\b(?!\s*per\s*mile)", "total_rate"),
        (r"line\s*haul|linehaul|freight\s*charge|freight\s*charges|haul\s*rate", "line_haul"),
        (r"detention", "detention"),
        (r"lumper|lumpers", "lumper"),
        (r"accessorial|accessorials", "accessorials"),
        (r"factoring|factor\s*fee", "factoring_fee"),
    ]
    results = []
    lines = s.replace("\r", "\n").split("\n")
    for i, line in enumerate(lines):
        line_lower = line.lower()
        for label_pat, key in labels:
            if re.search(label_pat, line_lower):
                nums = amount_re.findall(line.replace(",", ""))
                if not nums and i + 1 < len(lines):
                    nums = amount_re.findall(lines[i + 1].replace(",", ""))
                for n in nums:
                    try:
                        val = float(n)
                        if val > 0:
                            results.append((key, val))
                        break
                    except ValueError:
                        pass
                break
    # Fallbacks: various cost phrasings (same or next-line amount)
    _amount = r"\$?\s*([\d,]+(?:\.\d{2})?)"
    fallbacks = [
        (r"amount\s*due\s*(?:\(USD\))?\s*[:\s]*" + _amount, "amount_due"),
        (r"balance\s*due\s*[:\s]*" + _amount, "amount_due"),
        (r"total\s*(?:rate|amount|charges|due|freight|invoice)\s*(?:\(USD\))?\s*[:\s]*" + _amount, "total_rate"),
        (r"(?:grand\s*total|invoice\s*total|net\s*amount)\s*[:\s]*" + _amount, "total_rate"),
        (r"(?:price|\brate\b)(?!\s*per\s*mile)\s*[:\s]*" + _amount, "total_rate"),
        (r"line\s*haul\s*[:\s]*" + _amount, "line_haul"),
    ]
    for pattern, key in fallbacks:
        if any(k == key for k, _ in results):
            continue
        for m in re.finditer(pattern, s, re.I):
            try:
                results.append((key, float(m.group(1).replace(",", ""))))
                break
            except (ValueError, IndexError):
                pass
            break
    return results


def _re_pu_so_blocks(s: str) -> dict:
    """Extract origin from PU/pickup block and destination from SO/delivery block.
    PU 1 / PU / Pickup = starting point (origin); get pickup_date and origin city/state/zip from that block.
    SO 2 / SO / Delivery = delivery point (destination); get delivery_date and dest city/state/zip.
    Address near PU (left/above) = beginning; address under SO = destination. Uses two places for miles then rate_per_mile = cost/miles."""
    out = {
        "origin_city": None,
        "origin_state": None,
        "origin_zip": None,
        "destination_city": None,
        "destination_state": None,
        "destination_zip": None,
        "pickup_date": None,
        "delivery_date": None,
    }
    raw = s.replace("\r", "\n")
    pu_pattern = re.compile(r"\b(?:PU\s*1|PU\s*\d*|\bPU\b|Pickup)\b", re.I)
    so_pattern = re.compile(r"\b(?:SO\s*2|SO\s*\d*|\bSO\b|Delivery|Dest\.?)\b", re.I)
    pu_match = pu_pattern.search(raw)
    so_match = so_pattern.search(raw)
    if pu_match:
        start = pu_match.end()
        end = so_match.start() if (so_match and so_match.start() > pu_match.start()) else len(raw)
        pu_block = raw[start:end]
        addr_m = list(re.finditer(r"\b(\w+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b", pu_block))
        if addr_m:
            m = addr_m[-1]
            out["origin_city"] = m.group(1).strip().upper()[:100]
            out["origin_state"] = m.group(2).upper()[:2]
            out["origin_zip"] = m.group(3)
        date_m = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", pu_block)
        if date_m:
            mm, dd, yy = date_m.group(1), date_m.group(2), date_m.group(3)
            yyyy = int(yy) if len(yy) == 4 else 2000 + int(yy)
            out["pickup_date"] = f"{yyyy}-{int(mm):02d}-{int(dd):02d}"
    if so_match:
        start = so_match.end()
        next_pu = pu_pattern.search(raw, start)
        end = next_pu.start() if (next_pu and next_pu.start() > start) else len(raw)
        so_block = raw[start:end]
        addr_m = list(re.finditer(r"\b(\w+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b", so_block))
        if addr_m:
            m = addr_m[-1]
            out["destination_city"] = m.group(1).strip().upper()[:100]
            out["destination_state"] = m.group(2).upper()[:2]
            out["destination_zip"] = m.group(3)
        date_m = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", so_block)
        if date_m:
            mm, dd, yy = date_m.group(1), date_m.group(2), date_m.group(3)
            yyyy = int(yy) if len(yy) == 4 else 2000 + int(yy)
            out["delivery_date"] = f"{yyyy}-{int(mm):02d}-{int(dd):02d}"
    return out


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


def _re_client(s: str) -> dict:
    """Extract client/customer name and optional address, phone from PDF."""
    out = {"client_name": None, "client_address": None, "client_phone": None, "client_city": None, "client_state": None, "client_zip": None}
    for label in ["client", "customer", "bill\s*to", "sold\s*to", "consignee", "payer"]:
        m = re.search(rf"{label}\s*[:\s]+([^\n]+(?:\n[^\n]+)?)", s, re.I | re.DOTALL)
        if m:
            block = m.group(1).strip()
            lines = [ln.strip() for ln in block.split("\n") if ln.strip()][:4]
            if lines:
                out["client_name"] = lines[0][:200]
            if len(lines) > 1:
                out["client_address"] = " ".join(lines[1:-1])[:300] if len(lines) > 2 else lines[1][:300]
            if len(lines) >= 2:
                last = lines[-1]
                phone_m = re.search(r"\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}", last)
                if phone_m:
                    out["client_phone"] = re.sub(r"\s+", " ", phone_m.group(0))[:30]
                city_st_zip = re.search(r"([A-Za-z\s\.\-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)", last)
                if city_st_zip:
                    out["client_city"] = city_st_zip.group(1).strip()[:100]
                    out["client_state"] = city_st_zip.group(2).upper()[:2]
                    out["client_zip"] = city_st_zip.group(3)
            break
    if not out["client_name"]:
        for label in ["client\s*name", "customer\s*name"]:
            m = re.search(rf"{label}\s*[:\s]+([^\n]+)", s, re.I)
            if m:
                out["client_name"] = m.group(1).strip()[:200]
                break
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
        "amount_due": None,
        "line_haul": None,
        "rate_per_mile": None,
        "accessorials": {},
        "detention": None,
        "lumper": None,
        "factoring_fee": None,
        "commodity": None,
        "weight": None,
        "equipment_type": None,
        "broker_name": None,
        "truck_number": None,
        "client_name": None,
        "client_address": None,
        "client_phone": None,
        "client_city": None,
        "client_state": None,
        "client_zip": None,
    }

    # PU 1 / Pickup = origin (starting point); SO 2 / SO = destination. Get pickup_date from PU block, origin/dest from addresses.
    pu_so = _re_pu_so_blocks(raw_text)
    for key in ("origin_city", "origin_state", "origin_zip", "destination_city", "destination_state", "destination_zip", "pickup_date", "delivery_date"):
        if pu_so.get(key):
            payload[key] = pu_so[key]

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

    if not any([payload["origin_city"], payload["origin_state"], payload["origin_zip"]]):
        origin = _re_location(raw_text, "origin")
        payload["origin_city"] = origin.get("city")
        payload["origin_state"] = origin.get("state")
        payload["origin_zip"] = origin.get("zip")

    if not any([payload["destination_city"], payload["destination_state"], payload["destination_zip"]]):
        dest = _re_location(raw_text, "destination")
        payload["destination_city"] = dest.get("city")
        payload["destination_state"] = dest.get("state")
        payload["destination_zip"] = dest.get("zip")

    for key, amount in _re_money(raw_text):
        if key == "total_rate":
            payload["total_rate"] = amount
        elif key == "amount_due":
            payload["amount_due"] = amount
        elif key == "line_haul":
            payload["line_haul"] = amount
        elif key == "rate_per_mile":
            payload["rate_per_mile"] = amount
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

    # Use amount_due as total_rate when invoice only has "Amount Due" (so we have one total for display and rate_per_mile = cost/miles)
    if payload.get("total_rate") is None and payload.get("amount_due") is not None:
        payload["total_rate"] = payload["amount_due"]

    spec = _re_commodity_weight_equipment(raw_text)
    payload["commodity"] = spec.get("commodity")
    payload["weight"] = spec.get("weight")
    payload["equipment_type"] = spec.get("equipment_type")

    broker_truck = _re_broker_truck(raw_text)
    payload["broker_name"] = broker_truck.get("broker_name")
    payload["truck_number"] = broker_truck.get("truck_number")

    client = _re_client(raw_text)
    for key in ("client_name", "client_address", "client_phone", "client_city", "client_state", "client_zip"):
        if client.get(key):
            payload[key] = client[key]

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


# --- Optional LLM extraction: Gemini (preferred, google-genai) or GPT-4o-mini ---
# Try these in order; first that works with your API key is used (free tier varies by region/key).
GEMINI_MODEL_FALLBACKS = ("gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-1.5-flash")
OPENAI_EXTRACT_MODEL = "gpt-4o-mini"

_EXTRACT_PROMPT = """Extract from this OCR text from a freight invoice/BOL. Return only valid JSON with these keys (use null if not found):
- pickup_date, delivery_date, invoice_date (YYYY-MM-DD). For pickup_date use the date under PU 1 / PU / Pickup (starting point).
- origin_city, origin_state, origin_zip: from the address under PU 1 / PU / Pickup (the beginning/left/above). Example: WAVERLY, NY, 14892.
- destination_city, destination_state, destination_zip: from the address under SO 2 / SO / Delivery (below the PU block). Example: HIRAM, OH, 44234.
- total_rate, amount_due (base cost for rate-per-mile), line_haul, rate_per_mile (if stated).
- detention, lumper, factoring_fee (numbers), commodity, weight (integer lbs), equipment_type, broker_name, truck_number.
- client_name (customer/client/payer name from the PDF), client_address, client_phone, client_city, client_state, client_zip if present.
Miles are computed from the two places (origin/destination); rate_per_mile = cost / miles.

Text:
"""


def _parse_llm_json(content: str) -> dict | None:
    import json
    content = (content or "{}").strip().removeprefix("```json").removeprefix("```").strip()
    try:
        out = json.loads(content)
        out.setdefault("amount_due", None)
        out.setdefault("rate_per_mile", None)
        for k in ("client_name", "client_address", "client_phone", "client_city", "client_state", "client_zip"):
            out.setdefault(k, None)
        return out
    except json.JSONDecodeError:
        return None


def _extract_with_gemini(raw_text: str, model: str | None = None) -> dict | None:
    """Extract structured fields using Google Gemini (google-genai SDK). Set GOOGLE_API_KEY in .env.local."""
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GOOGLE_API_KEY (or GEMINI_API_KEY) not set; cannot use Gemini.", file=sys.stderr)
        return None
    from google import genai
    client = genai.Client(api_key=api_key)
    models_to_try = [model] if model else [os.environ.get("GEMINI_MODEL")] + list(GEMINI_MODEL_FALLBACKS)
    models_to_try = [m for m in models_to_try if m]
    last_err = None
    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=_EXTRACT_PROMPT + raw_text[:12000],
                config={"max_output_tokens": 800},
            )
            text = (getattr(response, "text", None) or "").strip()
            if text:
                out = _parse_llm_json(text)
                if out is not None:
                    return out
        except Exception as e:
            last_err = e
            if "404" in str(e) or "not found" in str(e).lower():
                continue
            print(f"Gemini extraction failed ({model_name}): {e}", file=sys.stderr)
            return None
    print(f"Gemini extraction failed (tried {len(models_to_try)} models). Last error: {last_err}", file=sys.stderr)
    return None


def _extract_with_openai(raw_text: str, model: str | None = None) -> dict | None:
    """Extract structured fields using OpenAI. Set OPENAI_API_KEY for GPT-4o-mini."""
    try:
        from openai import OpenAI
        client = OpenAI()
        model_name = model or os.environ.get("OPENAI_MODEL", OPENAI_EXTRACT_MODEL)
        resp = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": _EXTRACT_PROMPT + raw_text[:12000]}],
            max_tokens=800,
        )
        content = resp.choices[0].message.content or "{}"
        return _parse_llm_json(content)
    except Exception as e:
        print(f"OpenAI extraction failed: {e}", file=sys.stderr)
        return None


def extract_with_llm(raw_text: str, model: str | None = None) -> dict | None:
    """Use OpenAI only for LLM extraction (set OPENAI_API_KEY in .env.local)."""
    if os.environ.get("OPENAI_API_KEY"):
        return _extract_with_openai(raw_text, model=model)
    print("Set OPENAI_API_KEY in .env.local for LLM extraction.", file=sys.stderr)
    return None


# --- Miles and rate per mile (origin/dest -> OSRM distance; rate_per_mile = cost / miles) ---
def _geocode(city: str, state: str, zip_code: str | None) -> tuple[float, float] | None:
    """Return (lat, lng) for a US address using Nominatim. Tries full address then city+state (title-case) for robustness."""
    if not (city or state):
        return None
    city = (city or "").strip()
    state = (state or "").strip()[:2]
    zip_code = (zip_code or "").strip() or None

    def _try(parts: list) -> tuple[float, float] | None:
        if not parts:
            return None
        try:
            from geopy.geocoders import Nominatim
            from geopy.extra.rate_limiter import RateLimiter
            geocoder = Nominatim(user_agent="freightbite-pdf-extract")
            geocode = RateLimiter(geocoder.geocode, min_delay_seconds=1.0)
            addr = ", ".join(parts) + ", USA"
            loc = geocode(addr)
            if loc:
                return (loc.latitude, loc.longitude)
        except Exception:
            pass
        return None

    # Title-case city helps Nominatim (e.g. FILLMORE -> Fillmore, WAVERLY -> Waverly)
    city_title = city.title() if city else ""
    # Try full address first, then city+state only if we had zip (fallback when full fails)
    parts_full = [p for p in [city_title or city, state, zip_code] if p]
    out = _try(parts_full)
    if out:
        return out
    if zip_code:
        out = _try([city_title or city, state])
        if out:
            return out
    return None


def _driving_miles(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> float | None:
    """Return driving distance in miles via OSRM."""
    try:
        import urllib.request
        import urllib.parse
        coords = f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
        url = f"http://router.project-osrm.org/route/v1/driving/{coords}?overview=false"
        with urllib.request.urlopen(url, timeout=10) as resp:
            import json
            data = json.loads(resp.read().decode())
            if data.get("code") == "Ok" and data.get("routes"):
                meters = data["routes"][0]["distance"]
                return round(meters * 0.000621371, 1)
    except Exception:
        pass
    return None


def compute_miles_and_rate_per_mile(extracted: dict) -> None:
    """Set miles and rate_per_mile for every invoice. Base cost = first of amount_due, total_rate, line_haul (COST_FIELDS_BASE).
    When origin + destination exist: use the two addresses to calculate miles (OSRM), then rate_per_mile = base_cost / miles.
    When no origin/dest: if PDF has rate_per_mile + base_cost, miles = base_cost / rate_per_mile.
    Always set rate_per_mile = cost / miles when both cost and miles are available."""
    if not extracted:
        return
    base_cost = next((extracted.get(k) for k in COST_FIELDS_BASE if extracted.get(k) is not None), None)
    rate_per_mile_from_pdf = extracted.get("rate_per_mile")

    origin_city = (extracted.get("origin_city") or "").strip()
    origin_state = (extracted.get("origin_state") or "").strip()
    origin_zip = (extracted.get("origin_zip") or "").strip() or None
    dest_city = (extracted.get("destination_city") or "").strip()
    dest_state = (extracted.get("destination_state") or "").strip()
    dest_zip = (extracted.get("destination_zip") or "").strip() or None
    has_two_destinations = (origin_city or origin_state) and (dest_city or dest_state)

    if has_two_destinations:
        origin_ll = _geocode(origin_city, origin_state, origin_zip)
        time.sleep(1.0)
        dest_ll = _geocode(dest_city, dest_state, dest_zip)
        if origin_ll and dest_ll:
            miles = _driving_miles(origin_ll[0], origin_ll[1], dest_ll[0], dest_ll[1])
            extracted["miles"] = miles
            if miles and miles > 0 and base_cost and base_cost > 0:
                extracted["rate_per_mile"] = round(base_cost / miles, 2)
            elif not extracted.get("rate_per_mile"):
                extracted["rate_per_mile"] = None
            return
    if base_cost and rate_per_mile_from_pdf and rate_per_mile_from_pdf > 0:
        miles = round(base_cost / rate_per_mile_from_pdf, 1)
        extracted["miles"] = miles
        extracted["rate_per_mile"] = round(rate_per_mile_from_pdf, 2)
        return
    if "miles" not in extracted or not has_two_destinations:
        extracted["miles"] = None
    # Every invoice: whenever we have cost and miles, set rate_per_mile
    miles = extracted.get("miles")
    if base_cost and miles and miles > 0 and (extracted.get("rate_per_mile") is None or extracted.get("rate_per_mile") == 0):
        extracted["rate_per_mile"] = round(base_cost / miles, 2)
    elif not extracted.get("rate_per_mile"):
        extracted["rate_per_mile"] = None


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


def ensure_company_with_info(
    sb,
    name: str,
    company_type: str = "shipper",
    *,
    address: str | None = None,
    city: str | None = None,
    state: str | None = None,
    zip_code: str | None = None,
    phone: str | None = None,
) -> str | None:
    """Upsert company by name and optionally update address/phone. Used for client from PDF. Returns company id."""
    if not name or not name.strip():
        return None
    name = name.strip()[:200]
    r = sb.table("companies").select("id").eq("name", name).eq("company_type", company_type).limit(1).execute()
    if r.data and len(r.data) > 0:
        cid = r.data[0]["id"]
        updates = {}
        if address is not None and address.strip():
            updates["address"] = address.strip()[:300]
        if city is not None and city.strip():
            updates["city"] = city.strip()[:100]
        if state is not None and state.strip():
            updates["state"] = state.strip()[:2]
        if zip_code is not None and zip_code.strip():
            updates["zip"] = zip_code.strip()[:20]
        if phone is not None and phone.strip():
            updates["phone"] = phone.strip()[:30]
        if updates:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            try:
                sb.table("companies").update(updates).eq("id", cid).execute()
            except Exception:
                pass
        return cid
    row = {"name": name, "company_type": company_type}
    if address and address.strip():
        row["address"] = address.strip()[:300]
    if city and city.strip():
        row["city"] = city.strip()[:100]
    if state and state.strip():
        row["state"] = state.strip()[:2]
    if zip_code and zip_code.strip():
        row["zip"] = zip_code.strip()[:20]
    if phone and phone.strip():
        row["phone"] = phone.strip()[:30]
    ins = sb.table("companies").insert(row).execute()
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
        if extracted is None:
            extracted = extract_structured(raw_text)
        else:
            extracted.setdefault("accessorials", {})
            if extracted.get("detention") is not None:
                extracted["accessorials"]["detention"] = extracted["detention"]
            if extracted.get("lumper") is not None:
                extracted["accessorials"]["lumper"] = extracted["lumper"]
    else:
        extracted = extract_structured(raw_text)

    # Compute miles (origin → dest via OSRM) and rate per mile = total rate / miles
    compute_miles_and_rate_per_mile(extracted)

    # Supabase documents: filename, file_type, document_type, status, raw_text, metadata (JSONB), user_id (optional)
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

    # Upsert client company from PDF (name + address/phone) and store client_id in document metadata
    client_id = None
    if extracted.get("client_name"):
        client_id = ensure_company_with_info(
            sb,
            extracted["client_name"],
            "shipper",
            address=extracted.get("client_address"),
            city=extracted.get("client_city"),
            state=extracted.get("client_state"),
            zip_code=extracted.get("client_zip"),
            phone=extracted.get("client_phone"),
        )
        if client_id:
            metadata["client_id"] = str(client_id)
            try:
                sb.table("documents").update({"metadata": metadata, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", doc_id).execute()
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
    # Base cost: any of these cost forms (priority order); maps to rates.rate_amount / rates.metadata.total_rate (Supabase)
    base_cost = next(
        (extracted.get(k) for k in COST_FIELDS_BASE if extracted.get(k) is not None),
        None,
    )
    if company_id and base_cost is not None:
        accessorial_fees = extracted.get("accessorials") or {}
        rate_per_mile = extracted.get("rate_per_mile")
        miles = extracted.get("miles")
        if rate_per_mile is not None and rate_per_mile > 0:
            rate_type = "per_mile"
            rate_amount = rate_per_mile
        else:
            rate_type = "flat"
            rate_amount = base_cost
        rate_metadata = {}
        if miles is not None:
            rate_metadata["miles"] = miles
        if base_cost is not None:
            rate_metadata["total_rate"] = base_cost
        try:
            # Supabase rates table: document_id, company_id, origin_*, destination_*, rate_type, rate_amount, accessorial_fees, equipment_type, min_weight, metadata (JSONB)
            row = {
                "document_id": doc_id,
                "company_id": company_id,
                "origin_city": origin_city[:100],
                "origin_state": origin_state[:2],
                "destination_city": dest_city[:100],
                "destination_state": dest_state[:2],
                "rate_type": rate_type,  # 'per_mile' | 'flat' | 'per_hundredweight' | 'other'
                "rate_amount": round(float(rate_amount), 2),
                "accessorial_fees": accessorial_fees,
                "equipment_type": (extracted.get("equipment_type") or "")[:50] or None,
                "min_weight": extracted.get("weight"),
            }
            if rate_metadata:
                row["metadata"] = rate_metadata
            sb.table("rates").insert(row).execute()
        except Exception as e:
            print(f"Rate insert failed: {e}", file=sys.stderr)

    return {"document_id": doc_id, "extracted": extracted, "error": None}


def main():
    ap = argparse.ArgumentParser(description="Extract invoice/BOL data from scanned PDFs and save to Supabase")
    ap.add_argument("path", help="Path to a PDF file or directory of PDFs")
    ap.add_argument("--user-id", dest="user_id", default=os.environ.get("SUPABASE_USER_ID"), help="Supabase Auth user ID (links document to account)")
    ap.add_argument("--use-llm", action="store_true", default=os.environ.get("EXTRACT_USE_LLM") == "1", help="Use OpenAI to parse OCR text (set OPENAI_API_KEY)")
    ap.add_argument("--document-type", default="invoice", choices=["invoice", "bol", "rate_sheet", "contract", "other"], help="document_type for Supabase")
    ap.add_argument("--json-output", action="store_true", help="Print machine-readable JSON payload")
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

    results = []
    for f in files:
        out = process_pdf(str(f), args.user_id, sb, use_llm=args.use_llm, document_type=args.document_type)
        results.append({
            "filename": f.name,
            "document_id": out.get("document_id"),
            "extracted": out.get("extracted"),
            "error": out.get("error"),
        })
        if not args.json_output:
            print("Processing:", f.name)
            if out["error"]:
                print("  Error:", out["error"])
            else:
                print("  Document ID:", out["document_id"])
                print("  Extracted:", out["extracted"])
    if args.json_output:
        print(json.dumps({"results": results}, ensure_ascii=False))
    else:
        print("Done.")


if __name__ == "__main__":
    main()
