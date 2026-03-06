#!/usr/bin/env python3
"""
D2L PDF Scraper - Downloads learning guide PDFs from Anatomy & Physiology 12.
Credentials from macOS Keychain (service: d2l-langley).
"""

import os
import re
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

D2L_BASE = "https://langleysd35.onlinelearningbc.com"
COURSE_OU = "153403"
SAVE_DIR = Path.home() / "Documents" / "School" / "science"


def get_creds():
    username = subprocess.run(
        ["security", "find-generic-password", "-s", "d2l-langley", "-g"],
        capture_output=True, text=True
    )
    acct = re.search(r'"acct"<blob>="(.+?)"', username.stderr)
    pw = subprocess.run(
        ["security", "find-generic-password", "-s", "d2l-langley", "-w"],
        capture_output=True, text=True
    )
    return acct.group(1) if acct else None, pw.stdout.strip()


def login(page, username, password):
    print("Logging in...")
    page.goto(f"{D2L_BASE}/d2l/login", timeout=30000)
    time.sleep(2)
    page.fill('input[name="loginfmt"]', username)
    time.sleep(1)
    page.click('#idSIButton9')
    time.sleep(3)
    page.fill('input[name="passwd"]', password)
    time.sleep(1)
    page.click('#idSIButton9')
    time.sleep(3)
    try:
        page.click('text="No"', timeout=5000)
        time.sleep(2)
    except:
        pass
    print("Logged in.")


def discover_units(page):
    """Navigate to course content and find unit modules."""
    page.goto(f"{D2L_BASE}/d2l/le/content/{COURSE_OU}/Home", timeout=30000)
    time.sleep(3)

    # D2L content TOC: find module links in the sidebar/content area
    links = page.query_selector_all('a[href*="/le/content/"][href*="viewContent"]')
    if not links:
        # Try the table of contents tree
        links = page.query_selector_all('a[href*="/d2l/le/content/"]')

    units = {}
    for link in links:
        href = link.get_attribute('href') or ''
        text = link.inner_text().strip()
        if not text:
            continue
        # Group by unit number
        unit_match = re.search(r'unit\s*(\d+)', text, re.IGNORECASE)
        if unit_match:
            unit_num = unit_match.group(1)
            if unit_num not in units:
                units[unit_num] = []
            units[unit_num].append({"text": text, "href": href})

    return units


def find_pdf_links(page):
    """Find all PDF download links on the current page."""
    links = page.query_selector_all('a[href$=".pdf"], a[href*=".pdf?"], a[href*="/content/enforced/"]')
    pdfs = []
    for link in links:
        href = link.get_attribute('href') or ''
        text = link.inner_text().strip()
        if '.pdf' in href.lower() or 'download' in text.lower():
            pdfs.append({"text": text, "href": href})
    return pdfs


def download_pdf(page, url, save_path):
    """Download a PDF file."""
    if save_path.exists():
        print(f"  SKIP (exists): {save_path.name}")
        return False

    try:
        with page.expect_download(timeout=30000) as dl_info:
            page.evaluate(f'window.location.href = "{url}"')
        download = dl_info.value
        download.save_as(str(save_path))
        print(f"  SAVED: {save_path.name}")
        return True
    except Exception:
        # Fallback: direct navigation download
        try:
            response = page.request.get(url)
            if response.ok:
                save_path.write_bytes(response.body())
                print(f"  SAVED (direct): {save_path.name}")
                return True
        except Exception as e:
            print(f"  FAIL: {e}")
    return False


def scrape_content_page(page, unit_num):
    """Scrape a unit's content page for PDFs."""
    unit_dir = SAVE_DIR / f"unit {unit_num}"
    unit_dir.mkdir(parents=True, exist_ok=True)

    # Navigate to unit content via TOC
    page.goto(f"{D2L_BASE}/d2l/le/content/{COURSE_OU}/Home", timeout=30000)
    time.sleep(2)

    # Click on the unit in the TOC
    unit_link = page.query_selector(f'text=/Unit\\s*{unit_num}/i')
    if not unit_link:
        print(f"  Unit {unit_num} not found in TOC")
        return 0

    unit_link.click()
    time.sleep(3)

    # Look for PDF links in the content area
    downloaded = 0
    all_links = page.query_selector_all('a')
    for link in all_links:
        href = link.get_attribute('href') or ''
        text = link.inner_text().strip()

        if '.pdf' in href.lower():
            filename = re.sub(r'[?#].*', '', href.split('/')[-1])
            if not filename.endswith('.pdf'):
                filename = f"{text[:50]}.pdf" if text else "unknown.pdf"
            filename = re.sub(r'[^\w\s\-.]', '_', filename)
            save_path = unit_dir / filename

            full_url = href if href.startswith('http') else f"{D2L_BASE}{href}"
            if download_pdf(page, full_url, save_path):
                downloaded += 1
            elif save_path.exists():
                pass  # already counted as skip

    # Also check for content topics that might contain embedded PDFs
    topic_links = page.query_selector_all('a[href*="viewContent"]')
    for tlink in topic_links:
        thref = tlink.get_attribute('href') or ''
        ttext = tlink.inner_text().strip()
        if not thref or not ttext:
            continue

        full_url = thref if thref.startswith('http') else f"{D2L_BASE}{thref}"
        page.goto(full_url, timeout=30000)
        time.sleep(2)

        # Check if this page has PDF links
        pdf_links = page.query_selector_all('a[href$=".pdf"], a[href*=".pdf?"]')
        for plink in pdf_links:
            phref = plink.get_attribute('href') or ''
            ptext = plink.inner_text().strip()
            filename = re.sub(r'[?#].*', '', phref.split('/')[-1])
            if not filename.endswith('.pdf'):
                filename = f"{ptext[:50]}.pdf" if ptext else "unknown.pdf"
            filename = re.sub(r'[^\w\s\-.]', '_', filename)
            save_path = unit_dir / filename

            pdf_url = phref if phref.startswith('http') else f"{D2L_BASE}{phref}"
            if download_pdf(page, pdf_url, save_path):
                downloaded += 1

    return downloaded


def main():
    username, password = get_creds()
    if not username or not password:
        print("ERROR: Could not read credentials from Keychain.")
        print("Store them: security add-generic-password -a EMAIL -s d2l-langley -w PASSWORD")
        return

    print(f"D2L PDF Scraper\nCourse OU: {COURSE_OU}\nUser: {username}\n" + "-" * 40)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # visible for SSO
        page = browser.new_page(viewport={'width': 1400, 'height': 900})

        try:
            login(page, username, password)

            total = 0
            for unit_num in range(1, 6):  # Units 1-5
                print(f"\n--- Unit {unit_num} ---")
                count = scrape_content_page(page, unit_num)
                total += count
                print(f"  Downloaded: {count} PDFs")

            print(f"\n{'=' * 40}")
            print(f"Total downloaded: {total} PDFs")
            print(f"Saved to: {SAVE_DIR}")

        except Exception as e:
            print(f"Error: {e}")
            try:
                page.screenshot(path="error_scrape.png")
                print("Screenshot saved: error_scrape.png")
            except:
                pass
        finally:
            browser.close()


if __name__ == "__main__":
    main()
