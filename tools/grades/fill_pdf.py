#!/usr/bin/env python3
"""
Biology 12 PDF Blank Filler -- Uses PyMuPDF to find underscore blanks in
learning guide PDFs and fills them with answers from the answer key.

Usage: python3 fill_pdf.py <learning_guide.pdf>
"""

import sys
import re
from pathlib import Path

try:
    import fitz
except ImportError:
    print("ERROR: PyMuPDF not installed. Run: pip3 install pymupdf")
    sys.exit(1)

try:
    import pypdf
except ImportError:
    print("ERROR: pypdf not installed. Run: pip3 install pypdf")
    sys.exit(1)

KEY_DIRS = [
    Path.home() / "Downloads" / "d2l-science",
    Path.home() / "Documents" / "School" / "science",
]

STUDENT_NAME = "Joshua Trommel"
BLANK_PATTERN = re.compile(r'_{3,}')


def detect_unit(filename):
    m = re.search(r'U(\d+)', filename, re.IGNORECASE)
    return int(m.group(1)) if m else None


def find_key(unit):
    key_name = f"BI12_LG_U{unit:02d}-KEY.pdf"
    for base in KEY_DIRS:
        for variant in [f"unit_{unit}", f"unit {unit}"]:
            path = base / variant / key_name
            if path.exists():
                return path
    return None


def extract_key_text(key_path):
    reader = pypdf.PdfReader(str(key_path))
    text = ""
    for page in reader.pages:
        text += (page.extract_text() or "") + "\n"
    return text


def find_blanks(doc):
    """Find all underscore blanks with exact pixel coordinates."""
    blanks = []
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                line_text = "".join(s["text"] for s in line.get("spans", []))
                for span in line.get("spans", []):
                    txt = span["text"]
                    for m in BLANK_PATTERN.finditer(txt):
                        x0, y0, x1, y1 = span["bbox"]
                        font_size = span["size"]
                        char_w = (x1 - x0) / len(txt) if len(txt) > 0 else font_size * 0.5
                        blank_x0 = x0 + m.start() * char_w
                        blank_x1 = x0 + m.end() * char_w
                        rect = fitz.Rect(blank_x0, y0, blank_x1, y1)
                        blanks.append((page_idx, rect, font_size, line_text.strip()))
    return blanks


def extract_answers_from_key(key_text):
    """Extract answer tokens from key -- text between underscore runs."""
    answers = []
    pattern = re.compile(r'_+([^_\n]{1,80}?)_+')
    for m in pattern.finditer(key_text):
        ans = m.group(1).strip()
        if ans:
            answers.append(ans)
    return answers


def match_answers(blanks, answers):
    """Match blanks to answers 1:1 sequentially."""
    matched = []
    ans_idx = 0
    for i, (page_idx, rect, font_size, context) in enumerate(blanks):
        if ans_idx < len(answers):
            answer = answers[ans_idx]
            if ans_idx == 0 and ("ANS KEY" in answer or "Name" in context):
                matched.append((page_idx, rect, font_size, context, STUDENT_NAME))
            else:
                matched.append((page_idx, rect, font_size, context, answer))
            ans_idx += 1
        else:
            matched.append((page_idx, rect, font_size, context, "???"))
    return matched


def fill_pdf(doc, matched):
    """White-out blanks and insert answer text."""
    for page_idx, rect, font_size, context, answer in matched:
        page = doc[page_idx]
        page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1))
        text_size = min(font_size * 0.85, rect.height * 0.8)
        if text_size < 4:
            text_size = font_size * 0.7
        insert_point = fitz.Point(rect.x0 + 1, rect.y1 - 2)
        page.insert_text(
            insert_point, answer,
            fontname="helv", fontsize=text_size,
            color=(0, 0, 0.6),
        )


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 fill_pdf.py <learning_guide.pdf>")
        sys.exit(1)

    orig_path = Path(sys.argv[1]).expanduser().resolve()
    if not orig_path.exists():
        print(f"ERROR: File not found: {orig_path}")
        sys.exit(1)

    unit = detect_unit(orig_path.name)
    if unit is None:
        print(f"ERROR: Cannot detect unit from filename: {orig_path.name}")
        sys.exit(1)

    print(f"[*] Unit {unit} -- {orig_path.name}")

    key_path = find_key(unit)
    if not key_path:
        print(f"ERROR: Answer key not found for unit {unit}")
        sys.exit(1)

    print(f"[*] Answer key: {key_path}")

    key_text = extract_key_text(key_path)
    answers = extract_answers_from_key(key_text)
    print(f"[*] Extracted {len(answers)} answer tokens from key")
    for i, a in enumerate(answers):
        print(f"    ANS {i:3d}: {a}")

    doc = fitz.open(str(orig_path))
    print(f"[*] Opened {orig_path.name}: {len(doc)} pages")

    blanks = find_blanks(doc)
    print(f"[*] Found {len(blanks)} blanks in original")
    for i, (pg, rect, fs, ctx) in enumerate(blanks):
        ctx_short = ctx[:70] + "..." if len(ctx) > 70 else ctx
        print(f"    BLANK {i:3d} pg{pg+1} ({rect.x0:.0f},{rect.y0:.0f})-"
              f"({rect.x1:.0f},{rect.y1:.0f}) fs={fs:.1f}: {ctx_short}")

    if not blanks:
        print("[!] No blanks found.")
        doc.close()
        sys.exit(0)

    matched = match_answers(blanks, answers)
    print(f"\n[*] Matching {len(matched)} blanks to answers:")
    for i, (pg, rect, fs, ctx, ans) in enumerate(matched):
        ctx_short = ctx[:50] + "..." if len(ctx) > 50 else ctx
        print(f"    {i:3d} pg{pg+1}: '{ans}' <- {ctx_short}")

    fill_pdf(doc, matched)

    out_name = orig_path.stem + "_FILLED.pdf"
    out_path = orig_path.parent / out_name
    doc.save(str(out_path))
    doc.close()
    print(f"\n[*] Saved: {out_path}")
    print(f"    {len(matched)} blanks filled")


if __name__ == "__main__":
    main()
