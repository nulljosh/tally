#!/usr/bin/env python3
"""
D2L PDF Scraper - Downloads learning guide PDFs from Anatomy & Physiology 12.
Credentials from macOS Keychain (service: d2l-langley).
Uses D2L's content API after browser auth to discover and download files.
"""

import os
import re
import subprocess
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

D2L_BASE = "https://langleysd35.onlinelearningbc.com"
COURSE_OU = "153403"
SAVE_DIR = Path.home() / "Downloads" / "d2l-science"


def get_creds():
    result = subprocess.run(
        ["security", "find-generic-password", "-s", "d2l-langley", "-g"],
        capture_output=True, text=True
    )
    acct = re.search(r'"acct"<blob>="(.+?)"', result.stdout)
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


def get_toc(page):
    """Use D2L API to get full content table of contents."""
    # Try multiple API versions
    for ver in ["1.67", "1.50", "1.47", "1.39"]:
        url = f"{D2L_BASE}/d2l/api/le/{ver}/{COURSE_OU}/content/toc"
        resp = page.request.get(url)
        if resp.ok:
            return resp.json()
    # Fallback: try the content root
    resp = page.request.get(f"{D2L_BASE}/d2l/api/le/1.67/{COURSE_OU}/content/root/")
    if resp.ok:
        return resp.json()
    return None


def extract_topics(toc, depth=0):
    """Recursively extract all topics from TOC structure."""
    topics = []
    if isinstance(toc, dict):
        modules = toc.get("Modules", [])
        module_topics = toc.get("Topics", [])
        title = toc.get("Title", "")

        for topic in module_topics:
            topics.append({
                "title": topic.get("Title", ""),
                "url": topic.get("Url", ""),
                "type": topic.get("TypeIdentifier", ""),
                "topic_id": topic.get("TopicId", ""),
                "module_title": title,
            })

        for module in modules:
            topics.extend(extract_topics(module, depth + 1))

    elif isinstance(toc, list):
        for item in toc:
            topics.extend(extract_topics(item, depth))

    return topics


def download_file(page, url, save_path):
    """Download a file from D2L."""
    if save_path.exists() and save_path.stat().st_size > 0:
        print(f"  SKIP: {save_path.name}")
        return False

    try:
        full_url = url if url.startswith("http") else f"{D2L_BASE}{url}"
        resp = page.request.get(full_url)
        if resp.ok and len(resp.body()) > 100:
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_bytes(resp.body())
            size_kb = len(resp.body()) // 1024
            print(f"  SAVED: {save_path.name} ({size_kb}KB)")
            return True
        else:
            print(f"  FAIL: {save_path.name} (status {resp.status})")
    except Exception as e:
        print(f"  ERROR: {save_path.name}: {e}")
    return False


def sanitize(name):
    return re.sub(r'[^\w\s\-.]', '_', name).strip()


def main():
    username, password = get_creds()
    if not username or not password:
        print("ERROR: Could not read credentials from Keychain.")
        return

    print(f"D2L PDF Scraper\nCourse OU: {COURSE_OU}\nUser: {username}\n" + "-" * 40)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        try:
            login(page, username, password)

            # Get TOC via API
            print("\nFetching content structure...")
            toc = get_toc(page)

            if not toc:
                # Fallback: scrape the content page directly
                print("API unavailable. Scraping content page...")
                page.goto(f"{D2L_BASE}/d2l/le/content/{COURSE_OU}/Home", timeout=30000)
                time.sleep(3)
                # Dump page for debug
                html = page.content()
                # Find all PDF-like URLs in the page source
                pdf_urls = re.findall(r'href=["\']([^"\']*\.pdf[^"\']*)["\']', html)
                content_urls = re.findall(r'(/d2l/le/content/\d+/viewContent/\d+/View)', html)
                print(f"  Found {len(pdf_urls)} PDF links, {len(content_urls)} content links")

                SAVE_DIR.mkdir(parents=True, exist_ok=True)
                for url in pdf_urls:
                    fname = sanitize(url.split("/")[-1].split("?")[0])
                    download_file(page, url, SAVE_DIR / fname)
                browser.close()
                return

            # Parse TOC
            topics = extract_topics(toc)
            print(f"Found {len(topics)} topics across all modules.\n")

            # Save TOC for reference
            SAVE_DIR.mkdir(parents=True, exist_ok=True)
            with open(SAVE_DIR / "toc.json", "w") as f:
                json.dump(toc, f, indent=2)

            # Download PDFs and files
            downloaded = 0
            skipped = 0
            for topic in topics:
                url = topic["url"]
                title = topic["title"]
                module = topic["module_title"]

                if not url:
                    continue

                # Determine unit folder from module title
                unit_match = re.search(r'unit\s*(\d+)', module, re.IGNORECASE)
                if unit_match:
                    folder = SAVE_DIR / f"unit_{unit_match.group(1)}"
                else:
                    folder = SAVE_DIR / sanitize(module)[:50] if module else SAVE_DIR

                # Only download PDFs and documents
                is_pdf = ".pdf" in url.lower()
                is_doc = any(ext in url.lower() for ext in [".doc", ".docx", ".ppt", ".pptx"])
                is_content = "/viewContent/" in url

                if is_pdf or is_doc:
                    fname = sanitize(url.split("/")[-1].split("?")[0])
                    if not fname or fname == "_":
                        fname = sanitize(title) + ".pdf"
                    if download_file(page, url, folder / fname):
                        downloaded += 1
                    else:
                        skipped += 1
                elif is_content:
                    # Navigate to content page and look for PDF links
                    full_url = url if url.startswith("http") else f"{D2L_BASE}{url}"
                    page.goto(full_url, timeout=30000)
                    time.sleep(2)
                    html = page.content()
                    pdf_links = re.findall(r'href=["\']([^"\']*\.pdf[^"\']*)["\']', html)
                    for purl in pdf_links:
                        fname = sanitize(purl.split("/")[-1].split("?")[0])
                        if download_file(page, purl, folder / fname):
                            downloaded += 1

            print(f"\n{'=' * 40}")
            print(f"Downloaded: {downloaded} files")
            print(f"Skipped: {skipped} (already exist)")
            print(f"Saved to: {SAVE_DIR}")

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            browser.close()


def submit_to_dropbox(page, filled_pdf_path, unit_num):
    """Submit a filled PDF to the D2L dropbox for the given unit."""
    # Get dropbox folders
    for ver in ["1.67", "1.50", "1.47"]:
        url = f"{D2L_BASE}/d2l/api/le/{ver}/{COURSE_OU}/dropbox/folders/"
        resp = page.request.get(url)
        if resp.ok:
            folders = resp.json()
            break
    else:
        print(f"  ERROR: Could not fetch dropbox folders")
        return False

    # Find the folder matching this unit
    target_folder = None
    for folder in folders:
        title = folder.get("Name", "").lower()
        if f"unit {unit_num}" in title or f"u{unit_num:02d}" in title or f"u{unit_num}" in title:
            if "learning guide" in title or "lg" in title:
                target_folder = folder
                break
    if not target_folder:
        # Try broader match
        for folder in folders:
            title = folder.get("Name", "").lower()
            if f"unit {unit_num}" in title or f"u{unit_num}" in title:
                target_folder = folder
                break

    if not target_folder:
        print(f"  ERROR: No dropbox folder found for unit {unit_num}")
        print(f"  Available folders: {[f.get('Name') for f in folders]}")
        return False

    folder_id = target_folder["Id"]
    print(f"  Dropbox folder: {target_folder['Name']} (ID: {folder_id})")

    # Upload via multipart form
    pdf_bytes = Path(filled_pdf_path).read_bytes()
    filename = Path(filled_pdf_path).name

    for ver in ["1.67", "1.50", "1.47"]:
        upload_url = f"{D2L_BASE}/d2l/api/le/{ver}/{COURSE_OU}/dropbox/folders/{folder_id}/submissions/mysubmissions/"
        # D2L expects multipart with a JSON part and a file part
        import io
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name=""; filename="{filename}"\r\n'
            f"Content-Type: application/pdf\r\n\r\n"
        ).encode() + pdf_bytes + f"\r\n--{boundary}--\r\n".encode()

        resp = page.request.post(
            upload_url,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            data=body,
        )
        if resp.ok:
            print(f"  SUBMITTED: {filename} -> {target_folder['Name']}")
            return True
        elif resp.status == 404:
            continue
        else:
            print(f"  FAIL: status {resp.status} - {resp.text()[:200]}")

    return False


def submit_filled_pdfs():
    """Find and submit all filled PDFs to D2L dropbox."""
    username, password = get_creds()
    if not username or not password:
        print("ERROR: Could not read credentials from Keychain.")
        return

    # Find all filled PDFs
    filled = []
    for base in [Path.home() / "Documents" / "School" / "science"]:
        for unit_dir in sorted(base.iterdir()):
            if not unit_dir.is_dir():
                continue
            for pdf in unit_dir.glob("*_FILLED.pdf"):
                unit_match = re.search(r'U(\d+)', pdf.name, re.IGNORECASE)
                if unit_match:
                    filled.append((int(unit_match.group(1)), pdf))

    if not filled:
        print("No filled PDFs found to submit.")
        return

    print(f"Found {len(filled)} filled PDFs:")
    for unit, path in filled:
        print(f"  Unit {unit}: {path}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        try:
            login(page, username, password)
            for unit, path in filled:
                print(f"\nSubmitting Unit {unit}...")
                submit_to_dropbox(page, path, unit)
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            browser.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "submit":
        submit_filled_pdfs()
    else:
        main()
