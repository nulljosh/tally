#!/usr/bin/env python3
"""
D2L Grade Checker v2.1
Logs into D2L via Microsoft SSO, discovers all courses, retrieves grades.
Run: python grades.py
"""

import os
import re
import json
import time
from datetime import datetime
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

load_dotenv()

D2L_BASE_URL = "https://langleysd35.onlinelearningbc.com"
USERNAME = os.getenv("D2L_USERNAME")
PASSWORD = os.getenv("D2L_PASSWORD")


def login(page):
    print("Logging in...")
    page.goto(f"{D2L_BASE_URL}/d2l/login", timeout=30000)
    time.sleep(2)
    page.fill('input[name="loginfmt"]', USERNAME)
    time.sleep(1)
    page.click('#idSIButton9')
    time.sleep(3)
    page.fill('input[name="passwd"]', PASSWORD)
    time.sleep(1)
    page.click('#idSIButton9')
    time.sleep(3)
    try:
        page.click('text="No"', timeout=5000)
        time.sleep(2)
    except:
        pass
    print("Logged in.")


def discover_courses(page):
    print("Finding courses...")
    page.goto(f"{D2L_BASE_URL}/d2l/home", timeout=30000)
    time.sleep(3)

    links = page.query_selector_all('a[href*="/d2l/home/"]')
    courses = []
    seen = set()
    for link in links:
        href = link.get_attribute('href') or ''
        text = link.inner_text().strip()
        match = re.search(r'/d2l/home/(\d+)', href)
        if match and text and len(text) > 3:
            ou = match.group(1)
            if ou not in seen:
                seen.add(ou)
                courses.append({"name": text, "ou": ou})
                print(f"  {text} (OU: {ou})")

    if not courses:
        all_links = page.query_selector_all('a[href*="/d2l/"]')
        for link in all_links:
            href = link.get_attribute('href') or ''
            text = link.inner_text().strip()
            match = re.search(r'/d2l/(?:home|le/content|lms/grades)/(\d+)', href)
            if match and text and len(text) > 3:
                ou = match.group(1)
                if ou not in seen:
                    seen.add(ou)
                    courses.append({"name": text, "ou": ou})

    return courses


def parse_grade_table(page):
    """Parse the D2L grades table (id=z_l). Returns categories with items."""
    from bs4 import BeautifulSoup
    html = page.content()
    soup = BeautifulSoup(html, 'html.parser')

    table = soup.find('table', id='z_l')
    if not table:
        # Fallback: find any table with Grade Item header
        for t in soup.find_all('table'):
            th = t.find('th')
            if th and 'grade' in th.get_text(strip=True).lower():
                table = t
                break

    if not table:
        return []

    rows = table.find_all('tr')
    categories = []
    current_category = None

    for row in rows[1:]:  # skip header
        cells = row.find_all(['td', 'th'])
        texts = [c.get_text(strip=True) for c in cells]

        if len(texts) < 2:
            continue

        # Category row: first cell has text, second is empty or has no points
        # Item row: first cell empty, second has name
        if texts[0] and texts[0] not in ('', '-'):
            # This is a category header
            cat_grade = None
            for t in texts[1:]:
                pct = re.match(r'^(\d+(?:\.\d+)?)\s*%$', t)
                if pct:
                    cat_grade = float(pct.group(1))
                    break

            current_category = {
                "category": texts[0],
                "grade_pct": cat_grade,
                "items": []
            }
            categories.append(current_category)
        elif texts[0] == '' and len(texts) >= 3 and current_category is not None:
            # This is a grade item under current category
            name = texts[1]
            if not name:
                continue

            score = None
            out_of = None
            pct = None

            for t in texts[2:]:
                # Match "83 / 100"
                score_match = re.match(r'^(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$', t)
                if score_match:
                    score = float(score_match.group(1))
                    out_of = float(score_match.group(2))
                    continue
                # Match "- / 100" (not graded)
                if re.match(r'^-\s*/\s*\d+', t):
                    m = re.search(r'/\s*(\d+(?:\.\d+)?)', t)
                    if m:
                        out_of = float(m.group(1))
                    continue
                # Match "83 %" 
                pct_match = re.match(r'^(\d+(?:\.\d+)?)\s*%$', t)
                if pct_match:
                    pct = float(pct_match.group(1))

            if score is not None and out_of and pct is None:
                pct = round((score / out_of) * 100, 2)

            current_category["items"].append({
                "name": name,
                "score": score,
                "out_of": out_of,
                "percentage": pct
            })

    return categories


def get_grades_for_course(page, course_name, course_ou):
    print(f"\nFetching: {course_name}")

    page.goto(
        f"{D2L_BASE_URL}/d2l/lms/grades/my_grades/main.d2l?ou={course_ou}",
        timeout=30000
    )
    time.sleep(3)

    content = page.text_content('body') or ''
    if 'not available' in content.lower():
        # Try through course nav
        page.goto(f"{D2L_BASE_URL}/d2l/home/{course_ou}", timeout=30000)
        time.sleep(3)
        for sel in ['a:has-text("Grades")', 'text="Grades"']:
            try:
                page.click(sel, timeout=3000)
                time.sleep(3)
                content = page.text_content('body') or ''
                if 'not available' not in content.lower():
                    break
            except:
                continue

    content = page.text_content('body') or ''
    if 'not available' in content.lower():
        print(f"  Grades not available.")
        return None

    # Save debug files
    page.screenshot(path=f"grades_{course_ou}.png", full_page=True)
    with open(f"grades_{course_ou}.html", "w") as f:
        f.write(page.content())

    categories = parse_grade_table(page)

    return {
        "course": course_name,
        "course_ou": course_ou,
        "retrieved_at": datetime.now().isoformat(),
        "categories": categories
    }


def print_report(all_grades):
    print("\n" + "=" * 70)
    print("GRADE REPORT")
    print("=" * 70)

    for course in all_grades:
        if not course:
            continue
        print(f"\n  {course['course']}")
        print("  " + "-" * 60)

        if not course["categories"]:
            print("    No grades found")
            continue

        for cat in course["categories"]:
            cat_str = f"  {cat['category']}"
            if cat["grade_pct"] is not None:
                cat_str += f" — {cat['grade_pct']}%"
            print(cat_str)

            for item in cat["items"]:
                name = item["name"]
                if item["score"] is not None:
                    score = f"{int(item['score'])}/{int(item['out_of'])}"
                    pct = f"{item['percentage']}%"
                    print(f"      {name:<40} {score:>8}  {pct:>6}")
                else:
                    print(f"      {name:<40}        -")

    print("\n" + "=" * 70)


def main():
    print("\nD2L Grade Checker v2.1\n" + "-" * 40)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1400, 'height': 900})

        try:
            login(page)
            courses = discover_courses(page)

            if not courses:
                print("No courses found.")
                return

            all_grades = []
            for c in courses:
                result = get_grades_for_course(page, c["name"], c["ou"])
                if result:
                    all_grades.append(result)

            print_report(all_grades)

            with open("grades.json", "w") as f:
                json.dump({"retrieved_at": datetime.now().isoformat(), "courses": all_grades}, f, indent=2)
            print(f"Saved to grades.json")
            print("Done.")

        except Exception as e:
            print(f"Error: {e}")
            try:
                page.screenshot(path="error_grades.png")
            except:
                pass
        finally:
            browser.close()


if __name__ == "__main__":
    main()
