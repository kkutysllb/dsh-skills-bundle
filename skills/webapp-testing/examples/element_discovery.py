"""Discover actionable elements on a page before writing selectors.

Usage:
    python examples/element_discovery.py <url> [timeout_seconds]

Prints every button, link, and input with its role, accessible name, and a
suggested selector, so automation can target elements that actually exist in
the rendered DOM.
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
        page.goto(url, timeout=timeout)
        page.wait_for_load_state("networkidle")  # CRITICAL: wait for JS before inspecting

        print(f"# {url}\n")
        for role in ("button", "link", "textbox", "checkbox"):
            for locator in page.get_by_role(role).all():
                name = " ".join((locator.inner_text() or "").split()) or "<no text>"
                print(f"[{role}] {name}")
                try:
                    print(f"    id: {locator.get_attribute('id')}")
                except Exception:
                    pass

        browser.close()


if __name__ == "__main__":
    main()
