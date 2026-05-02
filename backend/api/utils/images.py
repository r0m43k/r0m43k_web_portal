from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None


def optimize_carousel_image(uploaded_file):
    if Image is None or ImageOps is None:
        return uploaded_file

    try:
        uploaded_file.seek(0)
    except Exception:
        pass

    try:
        image = Image.open(uploaded_file)
        image = ImageOps.exif_transpose(image)
    except Exception:
        try:
            uploaded_file.seek(0)
        except Exception:
            pass
        return uploaded_file

    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    image.thumbnail((1440, 2560), Image.Resampling.LANCZOS)

    output = BytesIO()
    image.save(output, format="WEBP", quality=82, method=6)
    output.seek(0)

    stem = Path(getattr(uploaded_file, "name", "") or "carousel").stem
    return ContentFile(output.read(), name=f"{stem}.webp")
