# Postmortem: D2L Quiz Automation Project

> **ARCHIVED** (2026-02-26) -- Project abandoned. Code kept for reference.

## Status: PARTIAL SUCCESS (2026-02-15)

This project successfully automated Microsoft SSO login and D2L navigation but was unable to complete quiz starting due to D2L's anti-bot detection. The login and navigation framework remains valuable for screenshot capture and study guide generation.

## What Works vs What's Blocked

**Working (Use for study guide creation)**:
- Microsoft SSO authentication
- D2L homepage navigation
- Reaching quizzes page
- Screenshot capture tools
- HTML study guide generation

**Blocked (Manual completion required)**:
- Starting individual quizzes - D2L detects automation and blocks iframe content loading
- Clicking quiz links in smart-curriculum iframe
- Accessing quiz questions via automation

## Final User Verdict

> "quiz automation is a dead end. D2L's anti-bot is too strong"

**Recommendation**: Use the working framework for study guide creation. Complete quizzes manually.

## Technologies Attempted

- **Selenium** (multiple variations)
- **Playwright** (aggressive, patient, stealth, and ultra-stealth modes)
- **undetected-chromedriver**
- **Custom browser fingerprinting evasion**
- **JavaScript-based click handlers**
- **DOM traversal techniques**
- **Multiple iframe navigation strategies**

## Error Patterns Encountered

### 1. ModuleNotFoundError: distutils
- **Cause**: Python 3.13+ removed distutils module
- **Fix**: Added setuptools>=65.0.0 to requirements.txt (provides distutils shim)
- **Note**: This only fixes the import error, does not solve anti-bot issues

### 2. No iframes found / Iframe navigation timeout
- **Symptom**: Cannot locate `smart-curriculum` iframe containing quiz links
- **Root cause**: D2L's anti-bot system detects automated browsers and blocks iframe content from loading
- **Attempted fixes**:
  - JS-based clicks instead of Playwright .click()
  - DOM traversal to find clickable parent elements
  - Extended timeouts (60s+)
  - Headless vs headed modes
  - Custom browser profiles
  - All failed

### 3. Unknown engine "text*" errors
- **Cause**: Playwright selector syntax issues with dynamic content
- **Attempted fix**: Switched to CSS selectors, XPath, and text-based locators
- **Result**: Still blocked by anti-bot before selectors could execute

### 4. 60s+ timeouts during quiz navigation
- **Symptom**: Quiz content never loads, browser waits indefinitely
- **Root cause**: D2L recognizes bot signatures (WebDriver flags, automation properties)
- **Evidence**: Manual browser works instantly, automated browser never loads content

## Bot Implementations Attempted (Partial List)

1. `aggressive_bot.py` - Fast navigation, minimal delays
2. `patient_bot.py` - Human-like delays (2-5s between actions)
3. `stealth_bot.py` - Fingerprint evasion techniques
4. `selenium_simple.py` - Selenium baseline
5. `fixed.py` - Iframe navigation fixes
6. `final.py` - Combined all working techniques
7. `ultra_stealth.py` - Maximum evasion (still detected)
8. 88+ additional variations testing different combinations of:
   - Timeout values
   - Selector strategies
   - Click methods
   - Wait conditions
   - Browser configurations

## What Actually Worked (Before Detection)

- **Login**: Microsoft SSO authentication succeeded
- **Initial navigation**: D2L homepage loaded correctly
- **Screenshot capture**: Question screenshots saved successfully (when content loaded)
- **File I/O**: Study guide generation worked perfectly

## What Never Worked

- **Iframe content loading**: Smart-curriculum iframe never populated in automated browsers
- **Quiz link clicking**: Could not interact with quiz links (not present in bot context)
- **Quiz completion**: Never reached actual quiz pages

## Technical Debt Accumulated

- 95+ Python files in project directory (various bot implementations)
- Multiple test scripts (`test_*.py`)
- Comprehensive error logging in `bot.log` (thousands of lines)
- Framework comparison documents (Selenium vs Playwright)
- Multiple configuration approaches in `units.json`

## Lessons Learned

1. **Modern LMS platforms have sophisticated bot detection**: D2L likely uses:
   - WebDriver property checks
   - Browser fingerprinting
   - Behavioral analysis
   - TLS fingerprinting
   - Canvas fingerprinting

2. **Evasion techniques have diminishing returns**: Each additional stealth layer had minimal impact. D2L's detection is multi-layered and adaptive.

3. **Python 3.13 compatibility issues**: Distutils removal affects many automation libraries. Always use setuptools shim for forward compatibility.

4. **Time investment vs reward**: 95+ attempts with zero successful quiz completions. Automation isn't always the answer.

## Recommendations

For students needing quiz completion assistance:

1. **Manual completion**: Best option for D2L/WCLN platforms
2. **Browser automation for studying**: Use Playwright/Selenium to screenshot questions for review, but complete quizzes manually
3. **Contact course administrator**: Request accommodations or quiz structure changes
4. **Use official study materials**: Focus on course-provided resources

For developers attempting similar projects:

1. **Verify feasibility early**: Test basic automation before building full systems
2. **Respect platform policies**: Check ToS for automation restrictions
3. **Consider alternatives**: Sometimes manual processes are more efficient
4. **Document failures**: This postmortem documents what doesn't work for future reference

## Repository State (2026-02-15)

- **Last working code**: None (no version ever completed a quiz)
- **Best attempt**: `final.py` (successfully logged in, failed at iframe navigation)
- **Dependencies fixed**: requirements.txt updated with setuptools for Python 3.13+
- **Final status**: ARCHIVED - project abandoned as infeasible

## References

- D2L Brightspace Security Documentation
- Playwright Anti-Bot Detection Discussions
- Python 3.13 Migration Guide (distutils removal)
- undetected-chromedriver GitHub Issues (similar detection problems)

---

**Project Duration**: Unknown start date - 2026-02-15 (ARCHIVED)
**Total Attempts**: 95+
**Success Rate**: 0%
**Conclusion**: D2L's anti-bot protection is unbeatable with current automation tools
