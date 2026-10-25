"""Automate a local static HTML file via a file:// URL (no server needed).

Usage:
    python examples/static_html_automation.py <path/to/page.html>

Loads the file directly, interacts with it, and saves a screenshot so you can
verify the rendered state visually.
"""

import pathlib
import sys

from playwright.sync_api import sync_playwright


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    target = pathlib.Path(sys.argv[1]).resolve()
    url = target.as_uri()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)  # Always headless
        page = browser.new_page()
        page.goto(url)
        page.wait_for_load_state("load")

        # Reconnaissance-then-action: inspect first, then act on what exists.
        buttons = page.locator("button")
        print(f"found {buttons.count()} button(s) on {target.name}")
        for index in range(buttons.count()):
            print(f"  [{index}] {buttons.nth(index).inner_text().strip()}")

        page.screenshot(path="/tmp/static_html.png", full_page=True)
        print("screenshot: /tmp/static_html.png")
        browser.close()


if __name__ == "__main__":
    main()
