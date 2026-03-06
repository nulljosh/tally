#!/usr/bin/env python3
"""
Biology 12 Answer Extractor - Extracts answers from learning guide answer keys.
Takes a learning guide PDF, finds the matching answer key, diffs them,
and outputs a markdown file with all answers.
"""

import sys
import re
import difflib
from pathlib import Path

try:
    import pypdf
except ImportError:
    print("ERROR: pypdf not installed. Run: pip3 install pypdf")
    sys.exit(1)

KEY_DIRS = [
    Path.home() / "Downloads" / "d2l-science",
    Path.home() / "Documents" / "School" / "science",
]


def detect_unit(filename):
    """Extract unit number from filename like BI12_LG_U03."""
    m = re.search(r'U(\d+)', filename, re.IGNORECASE)
    return int(m.group(1)) if m else None


def find_key(unit):
    """Search known directories for the answer key PDF."""
    key_name = f"BI12_LG_U{unit:02d}-KEY.pdf"
    for base in KEY_DIRS:
        for variant in [f"unit_{unit}", f"unit {unit}"]:
            path = base / variant / key_name
            if path.exists():
                return path
    return None


def extract_text(pdf_path):
    """Extract all text from a PDF, returning list of (page_num, text)."""
    reader = pypdf.PdfReader(str(pdf_path))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append((i + 1, text))
    return pages


def diff_answers(orig_lines, key_lines):
    """Find lines in the key that differ from the original (the answers)."""
    differ = difflib.unified_diff(
        orig_lines, key_lines,
        fromfile="original", tofile="answer_key",
        lineterm="", n=1
    )
    additions = []
    for line in differ:
        if line.startswith("+") and not line.startswith("+++"):
            additions.append(line[1:].strip())
    return [a for a in additions if a and len(a) > 1]


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 fill_pdf.py <learning_guide.pdf>")
        print("Example: python3 fill_pdf.py ~/Documents/School/science/unit\\ 3/BI12_LG_U03.pdf")
        sys.exit(1)

    orig_path = Path(sys.argv[1]).expanduser().resolve()
    if not orig_path.exists():
        print(f"ERROR: File not found: {orig_path}")
        sys.exit(1)

    unit = detect_unit(orig_path.name)
    if unit is None:
        print(f"ERROR: Cannot detect unit number from filename: {orig_path.name}")
        print("Expected format: BI12_LG_U03.pdf")
        sys.exit(1)

    print(f"[*] Unit {unit} detected from {orig_path.name}")

    key_path = find_key(unit)
    if not key_path:
        print(f"ERROR: Answer key not found for unit {unit}")
        print(f"Expected: BI12_LG_U{unit:02d}-KEY.pdf in one of:")
        for d in KEY_DIRS:
            print(f"  {d}/unit_{unit}/ or {d}/unit {unit}/")
        sys.exit(1)

    print(f"[*] Answer key: {key_path}")

    print("[*] Extracting text from original...")
    orig_pages = extract_text(orig_path)
    orig_text = "\n".join(text for _, text in orig_pages)
    print(f"    {len(orig_pages)} pages, {len(orig_text)} chars")

    print("[*] Extracting text from answer key...")
    key_pages = extract_text(key_path)
    key_text = "\n".join(text for _, text in key_pages)
    print(f"    {len(key_pages)} pages, {len(key_text)} chars")

    orig_lines = [l.strip() for l in orig_text.splitlines() if l.strip()]
    key_lines = [l.strip() for l in key_text.splitlines() if l.strip()]
    answer_lines = diff_answers(orig_lines, key_lines)

    out_path = orig_path.parent / f"U{unit:02d}_answers.md"
    with open(out_path, "w") as f:
        f.write(f"# Unit {unit} -- Answer Key\n\n")
        f.write(f"Source: `{key_path.name}`\n\n")
        f.write("---\n\n")
        f.write("## Full Answer Key\n\n")
        for page_num, text in key_pages:
            f.write(f"### Page {page_num}\n\n")
            f.write(text.strip() + "\n\n")
        if answer_lines:
            f.write("---\n\n")
            f.write("## Answers Only (diff from original)\n\n")
            for line in answer_lines:
                f.write(f"- {line}\n")
            f.write("\n")

    print(f"[*] Saved: {out_path}")
    print(f"    {len(answer_lines)} answer-only lines extracted")


if __name__ == "__main__":
    main()
