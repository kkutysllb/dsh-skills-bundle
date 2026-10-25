"""Capture browser console output (logs, warnings, errors) during automation.

Usage:
    python examples/console_logging.py <url> [timeout_seconds]

Attaches a console listener before navigating, so nothing emitted during page
load is missed. Useful when a dynamic app fails silently in the DOM.
"""

import sys

from playwright.sync_api import sync_playwright


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    url = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 15000

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)  # Always headless
        page = browser.new_page()

        # Attach BEFORE goto: early console messages are the interesting ones.
        page.on(
            "console",
            lambda message: print(f"[console.{message.type}] {message.text}"),
        )
        page.on(
            "pageerror",
            lambda error: print(f"[pageerror] {error}"),
        )

        page.goto(url, timeout=timeout)
        page.wait_for_load_state("load")
        page.wait_for_timeout(1000)  # let late async work emit

        browser.close()


if __name__ == "__main__":
    main()
