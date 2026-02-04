import logging
import os
import shutil
import tempfile
from pathlib import Path
import subprocess

from django.conf import settings


logger = logging.getLogger(__name__)


def _is_mp4(path: str) -> bool:
    return str(path).lower().endswith(".mp4")


def _is_video_file(path: str) -> bool:
    ext = str(path).lower().split(".")[-1]
    return ext in {
        "mp4",
        "mov",
        "m4v",
        "webm",
        "mkv",
        "avi",
        "flv",
        "wmv",
    }


def _run_ffmpeg(cmd, file_path):
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError:
        logger.warning("ffmpeg not found; skip media prep for %s", file_path)
        return False

    if result.returncode != 0:
        logger.warning(
            "ffmpeg failed for %s: %s",
            file_path,
            result.stderr.decode("utf-8", "ignore")[:500],
        )
        return False
    return True


def hls_dir(kind: str, object_id: int) -> Path:
    return Path(settings.MEDIA_ROOT) / "hls" / str(kind) / str(object_id)


def hls_manifest_path(kind: str, object_id: int) -> Path:
    return hls_dir(kind, object_id) / "index.m3u8"


def hls_manifest_url(request, kind: str, object_id: int) -> str:
    rel = f"hls/{kind}/{object_id}/index.m3u8"
    base = settings.MEDIA_URL.rstrip("/")
    url = f"{base}/{rel}"
    return request.build_absolute_uri(url) if request else url


def faststart_inplace(path: str) -> bool:
    if not path:
        return False
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        return False
    if not _is_mp4(file_path):
        return False

    tmp_fd, tmp_path = tempfile.mkstemp(
        suffix=".mp4",
        dir=str(file_path.parent),
    )
    os.close(tmp_fd)

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(file_path),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(tmp_path),
    ]

    if not _run_ffmpeg(cmd, file_path):
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return False

    try:
        os.replace(tmp_path, file_path)
        return True
    except OSError as exc:
        logger.warning("faststart replace failed for %s: %s", file_path, exc)
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return False


def _transcode_to_mp4(src_path: str, dst_path: str) -> bool:
    if not src_path or not dst_path:
        return False
    src = Path(src_path)
    if not src.exists():
        return False

    cmd_copy = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(dst_path),
    ]
    if _run_ffmpeg(cmd_copy, src):
        return True

    if os.path.exists(dst_path):
        try:
            os.unlink(dst_path)
        except OSError:
            pass

    cmd_reencode = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(dst_path),
    ]
    return _run_ffmpeg(cmd_reencode, src)


def _generate_hls(mp4_path: str, out_dir: Path) -> bool:
    if not mp4_path:
        return False
    out_dir.mkdir(parents=True, exist_ok=True)
    playlist = out_dir / "index.m3u8"
    segment_pattern = out_dir / "seg_%05d.ts"

    segment_seconds = int(os.getenv("HLS_SEGMENT_SECONDS") or "2")
    height = int(os.getenv("HLS_HEIGHT") or "720")
    maxrate = os.getenv("HLS_MAXRATE") or "3500k"
    bufsize = os.getenv("HLS_BUFSIZE") or "7000k"
    force_reencode = (os.getenv("HLS_FORCE_REENCODE") or "1") == "1"

    if not force_reencode:
        cmd_copy = [
            "ffmpeg",
            "-y",
            "-i",
            str(mp4_path),
            "-c",
            "copy",
            "-hls_time",
            str(segment_seconds),
            "-hls_playlist_type",
            "vod",
            "-hls_segment_filename",
            str(segment_pattern),
            str(playlist),
        ]
        if _run_ffmpeg(cmd_copy, mp4_path):
            return True

    cmd_reencode = [
        "ffmpeg",
        "-y",
        "-i",
        str(mp4_path),
        "-vf",
        f"scale=-2:{height}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-maxrate",
        maxrate,
        "-bufsize",
        bufsize,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-force_key_frames",
        f"expr:gte(t,n_forced*{segment_seconds})",
        "-hls_time",
        str(segment_seconds),
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments",
        "-hls_segment_filename",
        str(segment_pattern),
        str(playlist),
    ]
    return _run_ffmpeg(cmd_reencode, mp4_path)


def prepare_video_for_streaming(
    file_field,
    model=None,
    kind: str = None,
) -> bool:
    if not file_field:
        return False
    try:
        path = file_field.path
        name = file_field.name
    except Exception:
        return False

    if not _is_video_file(name):
        return False

    if _is_mp4(name):
        ok = faststart_inplace(path)
        if not ok:
            return False
        mp4_path = path
    else:
        storage = file_field.storage
        base_name = Path(name)
        new_name = str(base_name.with_suffix(".mp4"))
        try:
            new_name = storage.get_available_name(new_name)
            new_path = storage.path(new_name)
        except Exception:
            return False

        tmp_fd, tmp_path = tempfile.mkstemp(
            suffix=".mp4",
            dir=str(Path(path).parent),
        )
        os.close(tmp_fd)

        ok = _transcode_to_mp4(path, tmp_path)
        if not ok:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            return False

        try:
            os.replace(tmp_path, new_path)
        except OSError as exc:
            logger.warning("mp4 replace failed for %s: %s", path, exc)
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            return False

        try:
            storage.delete(name)
        except Exception:
            pass

        try:
            file_field.name = new_name
            if model is not None:
                model.save(update_fields=["file"])
        except Exception:
            return False
        mp4_path = new_path

    if not model or not model.pk:
        return True

    hls_kind = kind or "video"
    if kind is None:
        name_hint = model.__class__.__name__.lower()
        if "hero" in name_hint:
            hls_kind = "hero"

    out_dir = hls_dir(hls_kind, model.pk)
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    return _generate_hls(mp4_path, out_dir)
