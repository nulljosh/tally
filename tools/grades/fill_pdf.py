#!/usr/bin/env python3
"""
Biology 12 PDF Blank Filler -- Uses PyMuPDF to find underscore blanks in
learning guide PDFs and fills them with answers from the answer key.

Uses Claude CLI (sonnet) to match blanks to answers when the answer key
format doesn't match the original (paragraph answers vs fill-in-the-blank).

Usage: python3 fill_pdf.py <learning_guide.pdf> [--dry-run]
"""

import sys
import re
import json
import subprocess
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


def find_original(unit):
    orig_name = f"BI12_LG_U{unit:02d}.pdf"
    for base in KEY_DIRS:
        for variant in [f"unit_{unit}", f"unit {unit}"]:
            path = base / variant / orig_name
            if path.exists():
                return path
    school = Path.home() / "Documents" / "School" / "science" / f"unit {unit}"
    path = school / orig_name
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


def match_blanks_with_llm(blanks, key_text):
    """Use Claude CLI to match blanks to answers from the key."""
    blank_list = []
    for i, (page_idx, rect, font_size, context) in enumerate(blanks):
        blank_list.append({
            "id": i,
            "page": page_idx + 1,
            "context": context[:200],
        })

    prompt = f"""You are filling in blanks for a Biology 12 learning guide. Below is the ANSWER KEY text, followed by a list of blanks from the original document. Each blank has surrounding context (the line it appears on).

For each blank, determine the correct answer from the key. The answer key may have the answers in paragraph form, table form, or as labeled fill-in-the-blank. Match by topic/context, not by position.

RULES:
- Blank #0 is always the student name field. Answer: "{STUDENT_NAME}"
- Return ONLY a JSON array of strings, one per blank, in order by blank ID
- Each string is the answer for that blank (short -- fits in an underscore field)
- If you cannot determine an answer, use "???"
- Do NOT include any explanation, just the JSON array

ANSWER KEY TEXT:
{key_text}

BLANKS TO FILL (id, page, surrounding context):
{json.dumps(blank_list, indent=1)}

Return the JSON array of {len(blank_list)} answers:"""

    try:
        result = subprocess.run(
            ["claude", "-p", "--model", "sonnet", "--dangerously-skip-permissions"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=300,
            env={**__import__('os').environ, "CLAUDECODE": ""},
        )
        response = result.stdout.strip()
        # Extract JSON array from response
        match = re.search(r'\[[\s\S]*\]', response)
        if match:
            answers = json.loads(match.group())
            if isinstance(answers, list) and len(answers) == len(blanks):
                return answers
            elif isinstance(answers, list):
                print(f"[!] LLM returned {len(answers)} answers for {len(blanks)} blanks")
                # Pad or truncate
                while len(answers) < len(blanks):
                    answers.append("???")
                return answers[:len(blanks)]
        print(f"[!] Could not parse LLM response. First 200 chars: {response[:200]}")
    except subprocess.TimeoutExpired:
        print("[!] LLM call timed out after 300s")
    except Exception as e:
        print(f"[!] LLM call failed: {e}")

    # Fallback: sequential regex matching
    print("[*] Falling back to regex-based matching")
    return fallback_match(blanks, key_text)


def fallback_match(blanks, key_text):
    """Fallback: extract answers with regex and match sequentially."""
    answers = []
    pattern = re.compile(r'_+([^_\n]{1,80}?)_+')
    for m in pattern.finditer(key_text):
        ans = m.group(1).strip()
        if ans:
            answers.append(ans)

    result = []
    for i in range(len(blanks)):
        if i == 0:
            result.append(STUDENT_NAME)
        elif i - 1 < len(answers):
            result.append(answers[i - 1])
        else:
            result.append("???")
    return result


def fill_pdf(doc, blanks, answers):
    """White-out blanks and insert answer text."""
    for (page_idx, rect, font_size, context), answer in zip(blanks, answers):
        page = doc[page_idx]
        page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1))
        text_size = min(font_size * 0.85, rect.height * 0.8)
        if text_size < 4:
            text_size = font_size * 0.7
        insert_point = fitz.Point(rect.x0 + 1, rect.y1 - 2)
        page.insert_text(
            insert_point, str(answer),
            fontname="helv", fontsize=text_size,
            color=(0, 0, 0.6),
        )


def process_unit(unit, dry_run=False):
    """Process a single unit. Returns output path or None."""
    orig_path = find_original(unit)
    if not orig_path:
        print(f"[!] No original PDF found for unit {unit}")
        return None

    key_path = find_key(unit)
    if not key_path:
        print(f"[!] No answer key found for unit {unit}")
        return None

    print(f"\n{'='*60}")
    print(f"[*] Unit {unit}")
    print(f"    Original: {orig_path}")
    print(f"    Key:      {key_path}")

    key_text = extract_key_text(key_path)
    print(f"    Key text: {len(key_text)} chars")

    doc = fitz.open(str(orig_path))
    print(f"    Pages: {len(doc)}")

    blanks = find_blanks(doc)
    print(f"    Blanks found: {len(blanks)}")

    if not blanks:
        print("[!] No blanks found.")
        doc.close()
        return None

    # Show first/last few blanks
    for i in [0, 1, 2, len(blanks)-2, len(blanks)-1]:
        if 0 <= i < len(blanks):
            pg, rect, fs, ctx = blanks[i]
            ctx_short = ctx[:60] + "..." if len(ctx) > 60 else ctx
            print(f"    BLANK {i:3d} pg{pg+1}: {ctx_short}")

    print(f"\n[*] Matching blanks via LLM...")
    answers = match_blanks_with_llm(blanks, key_text)

    # Count real answers vs ???
    real = sum(1 for a in answers if a != "???")
    print(f"    Matched: {real}/{len(blanks)} ({100*real//len(blanks)}%)")

    if dry_run:
        for i, (blank, ans) in enumerate(zip(blanks, answers)):
            pg, rect, fs, ctx = blank
            ctx_short = ctx[:50] + "..." if len(ctx) > 50 else ctx
            print(f"    {i:3d} pg{pg+1}: '{ans}' <- {ctx_short}")
        doc.close()
        return None

    fill_pdf(doc, blanks, answers)

    out_name = orig_path.stem + "_FILLED.pdf"
    out_path = orig_path.parent / out_name
    doc.save(str(out_path))
    doc.close()
    print(f"[*] Saved: {out_path}")
    return out_path


def main():
    dry_run = "--dry-run" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if args:
        # Single file mode
        orig_path = Path(args[0]).expanduser().resolve()
        if not orig_path.exists():
            print(f"ERROR: File not found: {orig_path}")
            sys.exit(1)
        unit = detect_unit(orig_path.name)
        if unit is None:
            print(f"ERROR: Cannot detect unit from filename: {orig_path.name}")
            sys.exit(1)
        process_unit(unit, dry_run)
    else:
        # Batch mode: process all units with both original + key available
        print("[*] Batch mode: scanning for units with original + key PDFs")
        for unit in range(1, 10):
            orig = find_original(unit)
            key = find_key(unit)
            if orig and key:
                process_unit(unit, dry_run)
            elif orig:
                print(f"[!] Unit {unit}: has original but no key")
            elif key:
                print(f"[!] Unit {unit}: has key but no original")


if __name__ == "__main__":
    main()
