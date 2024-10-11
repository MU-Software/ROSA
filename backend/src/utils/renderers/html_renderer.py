import functools
import io

import async_lru
import jinja2
import PIL.Image
import playwright.async_api


@functools.lru_cache(maxsize=32)
def get_template_obj(template: str) -> jinja2.Template:
    return jinja2.Template(
        source=template,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=False,
        variable_start_string='"{{',
        variable_end_string='}}"',
    )


@async_lru.alru_cache(maxsize=64)
async def _render_html(browser: playwright.async_api.Browser, html: str, element: str | None = None) -> bytes:
    page = await browser.new_page()
    await page.set_content(html=html, wait_until="networkidle")
    result = await (page.locator(element) if element else page).screenshot(type="png", omit_background=True)
    await page.close()
    return result


async def render_html(
    browser: playwright.async_api.Browser, template: str, context: dict[str, str], element: str | None = None
) -> bytes:
    # As context is a dictionary and lru_cache cannot handle it,
    # we need to build a html first and then lru_cache it with the html
    html = get_template_obj(template).render(**context)
    return await _render_html(browser=browser, html=html, element=element)


def image_to_bw(image: bytes) -> bytes:
    with io.BytesIO(image) as input:
        with PIL.Image.open(input) as img:
            with io.BytesIO() as output:
                img.convert("1", dither=PIL.Image.Dither.NONE).save(output, format="PNG")
                return output.getvalue()
