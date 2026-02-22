#!/usr/bin/env python3
"""Check grades to see quiz completion"""

import os
import time
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

load_dotenv()

D2L_BASE_URL = "https://langleysd35.onlinelearningbc.com"
COURSE_OU = "6877"
USERNAME = os.getenv("D2L_USERNAME")
PASSWORD = os.getenv("D2L_PASSWORD")

def login(page):
    """Login to D2L"""
    print(f"[LOGIN] Starting login...")
    page.goto(f"{D2L_BASE_URL}/d2l/login", timeout=30000)
    time.sleep(2)
    
    # Microsoft SSO
    page.fill('input[name="loginfmt"]', USERNAME)
    time.sleep(1)
    page.click('#idSIButton9')
    time.sleep(3)
    
    # Password
    page.fill('input[name="passwd"]', PASSWORD)
    time.sleep(1)
    page.click('#idSIButton9')
    time.sleep(3)
    
    # Stay signed in? No
    try:
        page.click('text="No"', timeout=5000)
        time.sleep(2)
    except:
        pass
    
    print(f"[LOGIN] Logged in: {page.url}")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={'width': 1400, 'height': 900})
        
        login(page)
        
        # Go to grades page
        print("\n[GRADES] Navigating to grades...")
        page.goto(f"{D2L_BASE_URL}/d2l/lms/grades/my_grades/main.d2l?ou={COURSE_OU}", timeout=30000)
        time.sleep(5)
        
        # Screenshot
        page.screenshot(path="grades_page.png", full_page=True)
        print("[GRADES] Screenshot saved: grades_page.png")
        
        # Extract grades text
        try:
            page_text = page.text_content('body')
            print("\n" + "="*60)
            print("GRADES PAGE CONTENT:")
            print("="*60)
            
            # Look for quiz-related lines
            for line in page_text.split('\n'):
                if 'quiz' in line.lower() or 'u1' in line.lower() or 'u2' in line.lower() or 'u3' in line.lower():
                    print(line.strip())
                    
        except Exception as e:
            print(f"Error extracting grades: {e}")
        
        print("\n[DONE] Check grades_page.png for full details. Press Enter to close...")
        input()
        browser.close()

if __name__ == "__main__":
    main()
