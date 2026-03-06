#!/usr/bin/env python3
"""
BC Self-Serve monthly report autofill.

Features:
- Logs in using BCEID_USERNAME/BCEID_PASSWORD from .env
- Navigates to Monthly Reports and resumes the active report
- Fills standard answers (no income changes / no other changes)
- Captures screenshots in data/screenshots/
- Supports --dry-run to stop before final submit
"""

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

BASE_URL = "https://myselfserve.gov.bc.ca"
LOGIN_URL = "https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi"
MONTHLY_REPORTS_URL = f"{BASE_URL}/Auth/MonthlyReports"
ROOT_DIR = Path(__file__).resolve().parents[1]
SCREENSHOT_DIR = ROOT_DIR / "data" / "screenshots"


class MonthlyReportError(Exception):
    pass


def get_playwright_api():
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright not installed. Run: pip3 install playwright python-dotenv")
        print("Then install browser binaries: python3 -m playwright install chromium")
        sys.exit(1)
    return sync_playwright, PlaywrightTimeoutError


def ts() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def load_environment() -> None:
    if load_dotenv:
        load_dotenv(ROOT_DIR / ".env")


def screenshot(page, label: str) -> Path:
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    out = SCREENSHOT_DIR / f"monthly-report-{ts()}-{label}.png"
    page.screenshot(path=str(out), full_page=True)
    print(f"[shot] {out}")
    return out


def click_first_matching(page, patterns):
    script = """
    (patterns) => {
      const els = Array.from(
        document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')
      );
      for (const el of els) {
        const text = (el.innerText || el.value || '').trim();
        const lower = text.toLowerCase();
        if (patterns.some(p => lower.includes(p))) {
          el.click();
          return text;
        }
      }
      return null;
    }
    """
    return page.evaluate(script, patterns)


def ensure_not_redirected_to_login(page, context: str) -> None:
    url = page.url.lower()
    if "logon" in url or "login" in url and "myselfserve" not in url:
        raise MonthlyReportError(
            f"{context}: redirected back to login page ({page.url}). "
            "Credentials may be invalid or session expired."
        )


def login(page, username: str, password: str) -> None:
    if not username or not password:
        raise MonthlyReportError("Missing BCEID credentials in env: BCEID_USERNAME/BCEID_PASSWORD.")

    print("[1/6] Logging in to BC Self-Serve...")
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(1500)

    clicked = click_first_matching(page, ["sign in", "log in"])
    if clicked:
        print(f"[info] Clicked sign-in control: {clicked}")
    else:
        print("[warn] Sign-in button not found on landing page, opening login URL directly.")
        page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30000)

    try:
        _, PlaywrightTimeoutError = get_playwright_api()
        page.wait_for_selector('input[name="user"], input[id="user"]', timeout=20000)
    except PlaywrightTimeoutError as exc:
        screenshot(page, "login-missing-form")
        raise MonthlyReportError(
            "Login form did not load. Site may be unavailable, changed, or rate limiting."
        ) from exc

    page.fill('input[name="user"], input[id="user"]', username)
    page.fill('input[name="password"], input[id="password"]', password)

    submit = page.locator('input[name="btnSubmit"], button[type="submit"], input[type="submit"]').first
    submit.click()
    page.wait_for_timeout(3500)

    body_text = (page.text_content("body") or "").lower()
    if "invalid" in body_text or "incorrect" in body_text:
        screenshot(page, "login-failed-invalid-creds")
        raise MonthlyReportError("Login failed: invalid BCEID username or password.")

    ensure_not_redirected_to_login(page, "Login failed")
    print("[ok] Login successful.")


def click_continue(page, section_num: int) -> None:
    clicked = click_first_matching(page, ["continue", "next", "save and continue"])
    if not clicked:
        screenshot(page, f"section-{section_num}-missing-continue")
        raise MonthlyReportError(f"Section {section_num}: Continue button not found.")
    print(f"[info] Section {section_num}: clicked '{clicked}'")
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(1200)


def fill_monthly_report(page, sin: str, phone: str, pin: str, dry_run: bool) -> None:
    print("[2/6] Navigating to Monthly Reports...")
    page.goto(MONTHLY_REPORTS_URL, wait_until="networkidle", timeout=45000)
    ensure_not_redirected_to_login(page, "Monthly reports navigation")
    screenshot(page, "monthly-landing")

    clicked = click_first_matching(page, ["resume", "start", "begin"])
    if not clicked:
        raise MonthlyReportError(
            "No report to resume/start was found. There may be no pending monthly report."
        )
    print(f"[info] Opened report via '{clicked}'")
    page.wait_for_timeout(2500)

    print("[3/6] Filling Section 1/5 (Eligibility)...")
    page.wait_for_selector('input[name="NeedOfAssistance_177"]', timeout=15000)
    page.check('input[name="NeedOfAssistance_177"][value="Yes"]')
    screenshot(page, "section-1-filled")
    click_continue(page, 1)

    print("[4/6] Filling Section 2/5 (Income = 0)...")
    page.wait_for_selector('input[type="number"]', timeout=15000)
    count = page.evaluate(
        """() => {
          const fields = Array.from(document.querySelectorAll('input[type="number"]'));
          for (const f of fields) {
            if (f.value === '' || f.value == null) {
              f.focus();
              f.value = '0';
              f.dispatchEvent(new Event('input', { bubbles: true }));
              f.dispatchEvent(new Event('change', { bubbles: true }));
              f.blur();
            }
          }
          return fields.length;
        }"""
    )
    print(f"[info] Income fields verified/set to 0: {count}")
    screenshot(page, "section-2-filled")
    click_continue(page, 2)

    print("[5/6] Filling Section 3/5 (No changes), skipping Section 4...")
    page.wait_for_selector('input[name="OtherChanges_969"]', timeout=15000)
    page.check('input[name="OtherChanges_969"][value="No"]')
    screenshot(page, "section-3-filled")
    click_continue(page, 3)

    screenshot(page, "section-4-documents")
    click_continue(page, 4)

    print("[6/6] Reviewing Section 5 + confirmation page...")
    page.wait_for_selector('input[name="KeyPlayerSIN"], input[name="KeyPlayerPhone"]', timeout=15000)
    if sin:
        page.fill('input[name="KeyPlayerSIN"]', sin)
        print("[info] Updated SIN field.")
    if phone:
        page.fill('input[name="KeyPlayerPhone"]', phone)
        print("[info] Updated phone field.")
    screenshot(page, "section-5-filled")
    click_continue(page, 5)

    page.wait_for_selector('#declare_cb, input[name="DeclarationCB"]', timeout=20000)
    if page.locator("#declare_cb").count() > 0:
        page.check("#declare_cb")
    else:
        page.check('input[name="DeclarationCB"]')

    if pin:
        if page.locator("#kp_pin").count() > 0:
            page.fill("#kp_pin", pin)
        else:
            page.fill('input[name="KeyPlayerPIN"], input[type="password"]', pin)
    else:
        print("[warn] BC_PIN is not set. PIN field left empty.")

    pre_submit = screenshot(page, "confirmation-before-submit")
    print(f"[info] Pre-submit screenshot saved to: {pre_submit}")

    if dry_run:
        print("[done] Dry run complete. Stopped before final submit.")
        return

    if not pin:
        raise MonthlyReportError("Refusing to submit: BC_PIN is missing.")

    submit_btn = page.locator("#btnSubmit, input[value*='Submit'], button:has-text('Submit')").first
    if submit_btn.count() == 0:
        raise MonthlyReportError("Submit button not found on confirmation page.")

    print("[submit] Submitting monthly report...")
    submit_btn.click()
    page.wait_for_timeout(4000)
    screenshot(page, "confirmation-after-submit")

    body = (page.text_content("body") or "").lower()
    if any(word in body for word in ["thank you", "submitted", "success", "received"]):
        print("[ok] Submission appears successful.")
    else:
        print("[warn] Submit clicked, but success text not detected. Verify screenshot.")


def parse_args():
    parser = argparse.ArgumentParser(description="BC Self-Serve monthly report autofill.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fill report and stop before final submit.",
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
    sync_playwright, _ = get_playwright_api()

    username = os.getenv("BCEID_USERNAME", "").strip()
    password = os.getenv("BCEID_PASSWORD", "").strip()
    sin = os.getenv("BC_SIN", "").strip().replace(" ", "")
    phone = os.getenv("BC_PHONE", "").strip()
    pin = os.getenv("BC_PIN", "").strip()

    print("BC Monthly Report Autofill")
    print("-" * 40)
    print(f"Dry run: {args.dry_run}")
    print(f"Headed: {args.headed}")
    print(f"Screenshots: {SCREENSHOT_DIR}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        try:
            login(page, username, password)
            fill_monthly_report(page, sin, phone, pin, args.dry_run)
        except MonthlyReportError as exc:
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
