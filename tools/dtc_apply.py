#!/usr/bin/env python3
"""
DTC (T2201) Part A automation helper.

Features:
- Opens CRA/T2201 pages with Playwright and captures screenshots
- Downloads the current T2201 PDF
- Fills Part A fields heuristically using env vars:
  - LEGAL_NAME
  - SIN
  - DOB (YYYY-MM-DD preferred)
- Saves output to data/dtc_filled.pdf
- --submit enables CRA My Account navigation/upload attempt
"""

import argparse
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
SCREENSHOT_DIR = DATA_DIR / "screenshots"
BLANK_PDF_PATH = DATA_DIR / "t2201_blank.pdf"
FILLED_PDF_PATH = DATA_DIR / "dtc_filled.pdf"

CRA_T2201_PAGE_URL = "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2201.html"
CRA_MY_ACCOUNT_URL = "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-individuals/account-individuals.html"
DEFAULT_T2201_PDF_URL = "https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/t2201/t2201-fill-25e.pdf"


class DtcApplyError(Exception):
    pass


def get_playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright not installed. Run: pip3 install playwright python-dotenv")
        print("Then install browser binaries: python3 -m playwright install chromium")
        sys.exit(1)
    return sync_playwright


def get_pypdf():
    try:
        import pypdf
    except ImportError:
        print("ERROR: pypdf not installed. Run: pip3 install pypdf")
        sys.exit(1)
    return pypdf


def load_environment() -> None:
    if load_dotenv:
        load_dotenv(ROOT_DIR / ".env")


def ts() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def screenshot(page, label: str) -> Path:
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    out = SCREENSHOT_DIR / f"dtc-{ts()}-{label}.png"
    page.screenshot(path=str(out), full_page=True)
    print(f"[shot] {out}")
    return out


def normalize_sin(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def normalize_dob(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return value
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return value
    if re.match(r"^\d{2}/\d{2}/\d{4}$", value):
        month, day, year = value.split("/")
        return f"{year}-{month}-{day}"
    return value


def pick_best_t2201_pdf_url(page, fallback_url: str) -> str:
    links = page.evaluate(
        """() => {
          const out = [];
          for (const a of document.querySelectorAll('a[href]')) {
            const href = a.href || '';
            const text = (a.innerText || '').toLowerCase();
            if (href.toLowerCase().includes('t2201') && href.toLowerCase().includes('.pdf')) {
              out.push(href);
            } else if (text.includes('pdf') && href.toLowerCase().includes('t2201')) {
              out.push(href);
            }
          }
          return out;
        }"""
    )
    if links:
        print(f"[info] Found {len(links)} PDF links on T2201 page; using first match.")
        return links[0]
    return fallback_url


def download_t2201_pdf(page, preferred_url: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    pdf_url = preferred_url

    print("[1/4] Opening CRA T2201 page...")
    page.goto(CRA_T2201_PAGE_URL, wait_until="domcontentloaded", timeout=45000)
    screenshot(page, "t2201-page")
    pdf_url = pick_best_t2201_pdf_url(page, preferred_url)
    print(f"[info] Download URL: {pdf_url}")

    print("[2/4] Downloading T2201 PDF...")
    response = page.request.get(pdf_url, timeout=45000)
    if not response.ok:
        raise DtcApplyError(f"Could not download T2201 PDF (HTTP {response.status}).")

    pdf_bytes = response.body()
    if not pdf_bytes or len(pdf_bytes) < 10_000:
        raise DtcApplyError("Downloaded T2201 PDF looks invalid or too small.")

    BLANK_PDF_PATH.write_bytes(pdf_bytes)
    print(f"[ok] Saved blank PDF: {BLANK_PDF_PATH}")
    return BLANK_PDF_PATH


def build_field_updates(field_names, legal_name: str, sin: str, dob: str):
    updates = {}
    lower_to_real = {name.lower(): name for name in field_names}

    name_parts = [part for part in legal_name.split(" ") if part]
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[-1] if len(name_parts) >= 2 else ""

    def maybe_set(target_key, value):
        if target_key in lower_to_real and value:
            updates[lower_to_real[target_key]] = value

    # Direct-style matches.
    for key in list(lower_to_real.keys()):
        if "social insurance" in key or re.search(r"\bsin\b", key):
            if sin:
                updates[lower_to_real[key]] = sin
        elif "date of birth" in key or re.search(r"\bdob\b", key) or "birth" in key:
            if dob:
                updates[lower_to_real[key]] = dob
        elif "legal name" in key or ("name" in key and "applicant" in key):
            if legal_name:
                updates[lower_to_real[key]] = legal_name
        elif "first name" in key or "given name" in key:
            if first_name:
                updates[lower_to_real[key]] = first_name
        elif "last name" in key or "family name" in key or "surname" in key:
            if last_name:
                updates[lower_to_real[key]] = last_name

    # Common fallback field names used in many CRA fillable PDFs.
    maybe_set("applicant_legal_name", legal_name)
    maybe_set("applicant_name", legal_name)
    maybe_set("first_name", first_name)
    maybe_set("last_name", last_name)
    maybe_set("sin", sin)
    maybe_set("dob", dob)

    return updates


def fill_t2201_pdf(blank_pdf_path: Path, legal_name: str, sin: str, dob: str) -> Path:
    print("[3/4] Filling Part A fields...")
    pypdf = get_pypdf()
    reader = pypdf.PdfReader(str(blank_pdf_path))
    fields = reader.get_fields() or {}
    field_names = list(fields.keys())

    if not field_names:
        print("[warn] No fillable form fields found in PDF; copying unchanged.")
        shutil.copyfile(blank_pdf_path, FILLED_PDF_PATH)
        return FILLED_PDF_PATH

    updates = build_field_updates(field_names, legal_name, sin, dob)
    if not updates:
        print("[warn] Could not map Part A fields confidently; writing unchanged copy.")
        shutil.copyfile(blank_pdf_path, FILLED_PDF_PATH)
        return FILLED_PDF_PATH

    writer = pypdf.PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    # Preserve AcroForm so field updates remain valid.
    if "/AcroForm" in reader.trailer["/Root"]:
        writer._root_object.update(
            {pypdf.generic.NameObject("/AcroForm"): reader.trailer["/Root"]["/AcroForm"]}
        )

    for page in writer.pages:
        writer.update_page_form_field_values(page, updates, auto_regenerate=False)

    FILLED_PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    with FILLED_PDF_PATH.open("wb") as fp:
        writer.write(fp)

    print(f"[ok] Filled {len(updates)} fields in T2201 Part A.")
    print(f"[ok] Saved: {FILLED_PDF_PATH}")
    return FILLED_PDF_PATH


def submit_to_cra(page, filled_pdf: Path) -> None:
    print("[4/4] --submit enabled: navigating to CRA My Account...")
    page.goto(CRA_MY_ACCOUNT_URL, wait_until="domcontentloaded", timeout=45000)
    screenshot(page, "cra-my-account")

    print("[info] Attempting upload flow discovery...")
    upload_ready = page.evaluate(
        """() => {
          const fileInput = document.querySelector('input[type="file"]');
          return !!fileInput;
        }"""
    )

    if upload_ready:
        page.set_input_files('input[type="file"]', str(filled_pdf))
        screenshot(page, "cra-file-selected")
        print("[ok] File selected in upload control.")
        print("[warn] Final filing click intentionally not automated beyond file selection.")
        return

    print(
        "[warn] No upload input detected. CRA login/MFA and account state likely require manual completion."
    )
    print(f"[info] Prepared file for manual upload: {filled_pdf}")


def parse_args():
    parser = argparse.ArgumentParser(description="DTC T2201 Part A automation.")
    parser.add_argument(
        "--submit",
        action="store_true",
        help="Attempt CRA My Account upload flow after generating filled PDF.",
    )
    parser.add_argument(
        "--pdf-url",
        default=DEFAULT_T2201_PDF_URL,
        help="Override T2201 PDF URL.",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run with visible browser window.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    load_environment()
    sync_playwright = get_playwright()

    legal_name = (os.getenv("LEGAL_NAME") or "").strip()
    sin = normalize_sin(os.getenv("SIN") or os.getenv("BC_SIN") or "")
    dob = normalize_dob(os.getenv("DOB") or "")

    if not legal_name:
        print("ERROR: LEGAL_NAME is required in .env")
        sys.exit(1)
    if not sin:
        print("ERROR: SIN is required in .env")
        sys.exit(1)
    if not dob:
        print("ERROR: DOB is required in .env (YYYY-MM-DD recommended)")
        sys.exit(1)

    print("DTC Application Automation (T2201 Part A)")
    print("-" * 48)
    print(f"Submit mode: {args.submit}")
    print(f"Headed: {args.headed}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        try:
            blank_pdf = download_t2201_pdf(page, args.pdf_url)
            filled_pdf = fill_t2201_pdf(blank_pdf, legal_name, sin, dob)
            if args.submit:
                submit_to_cra(page, filled_pdf)
            else:
                print("[done] Filled PDF generated. --submit not set, so no filing attempted.")
        except DtcApplyError as exc:
            print(f"ERROR: {exc}")
            try:
                screenshot(page, "fatal-error")
            except Exception:
                pass
            sys.exit(1)
        except Exception as exc:
            print(f"ERROR: Unexpected failure: {exc}")
            try:
                screenshot(page, "fatal-unexpected")
            except Exception:
                pass
            sys.exit(1)
        finally:
            time.sleep(1)
            browser.close()


if __name__ == "__main__":
    main()
