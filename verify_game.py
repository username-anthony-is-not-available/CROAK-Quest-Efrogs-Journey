from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Go to the dev server
            page.goto('http://localhost:8081')
            # Wait for the game to load
            time.sleep(10)
            page.screenshot(path='main_menu.png')

            # Click to start the game (assuming clicking anywhere on canvas starts it)
            # Find the canvas element
            canvas = page.locator('canvas')
            if canvas.is_visible():
                canvas.click()
                # Wait for some gameplay to happen
                time.sleep(5)
                page.screenshot(path='gameplay.png')
            else:
                print("Canvas not found")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
