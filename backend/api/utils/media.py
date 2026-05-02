import logging
import os
import shutil
import subprocess
import tempfile
import json
import uuid
from pathlib import Path

from django.conf import settings


logger = logging.getLogger(__name__)


class MediaProcessingCancelled(Exception):
    pass


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


def _report(progress_callback, percent: int, stage: str):
    if not progress_callback:
        return
    try:
        progress_callback(int(percent), stage)
    except Exception:
        logger.debug("progress callback failed", exc_info=True)


def _ensure_not_canceled(should_abort):
    if should_abort and should_abort():
        raise MediaProcessingCancelled("cancel requested")


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
        stderr_text = result.stderr.decode("utf-8", "ignore")
        stderr_tail = stderr_text[-2000:] if stderr_text else ""
        cmd_text = " ".join(str(part) for part in cmd)
        logger.warning(
            "ffmpeg failed for %s (code %s). cmd=%s stderr_tail=%s",
            file_path,
            result.returncode,
            cmd_text,
            stderr_tail,
        )
        return False
    return True


def _has_audio(path: str) -> bool:
    if not path:
        return False
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(path),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError:
        return True
    if result.returncode != 0:
        return False
    return bool(result.stdout.strip())


def _probe_video_stream(path: str) -> dict:
    if not path:
        return {}
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=color_transfer,color_primaries,color_space",
                "-of",
                "json",
                str(path),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError:
        return {}
    if result.returncode != 0:
        return {}
    try:
        payload = json.loads(result.stdout.decode("utf-8", "ignore") or "{}")
    except json.JSONDecodeError:
        return {}
    streams = payload.get("streams") or []
    if not streams:
        return {}
    stream = streams[0] or {}
    return {
        "color_transfer": str(stream.get("color_transfer") or "").lower(),
        "color_primaries": str(stream.get("color_primaries") or "").lower(),
        "color_space": str(stream.get("color_space") or "").lower(),
    }


def _is_hdr_source(path: str) -> bool:
    info = _probe_video_stream(path)
    transfer = info.get("color_transfer") or ""
    primaries = info.get("color_primaries") or ""
    color_space = info.get("color_space") or ""
    if transfer in {"smpte2084", "arib-std-b67"}:
        return True
    if primaries in {"bt2020", "bt2020-10", "bt2020-12"}:
        return True
    if color_space in {"bt2020nc", "bt2020c"}:
        return True
    return False


def _sanitize_segment_tag(raw: str) -> str:
    value = str(raw or "").strip()
    safe = "".join(ch for ch in value if ch.isalnum() or ch in {"-", "_"})
    return safe or os.urandom(4).hex()


def _scale_filter(height: int, hdr_to_sdr: bool) -> str:
    if hdr_to_sdr:
        # Convert HDR sources to SDR so browsers avoid near-black output.
        return (
            "zscale=t=linear:npl=100,format=gbrpf32le,"
            "tonemap=bt2390:desat=0,"  # noqa: E231
            f"zscale=t=bt709:m=bt709:r=tv:p=bt709,"  # noqa: E231
            f"scale=-2:{height}:flags=lanczos,"  # noqa: E231
            "format=yuv420p"
        )
    return f"scale=-2:{height}:flags=lanczos,format=yuv420p"  # noqa: E231


def hls_dir(kind: str, object_id: int) -> Path:
    return Path(settings.MEDIA_ROOT) / "hls" / str(kind) / str(object_id)


def hls_manifest_path(kind: str, object_id: int) -> Path:
    return hls_dir(kind, object_id) / "index.m3u8"


def hls_manifest_url(request, kind: str, object_id: int) -> str:
    rel = f"hls/{kind}/{object_id}/index.m3u8"
    base = settings.MEDIA_URL.rstrip("/")
    url = f"{base}/{rel}"
    return request.build_absolute_uri(url) if request else url


def hls_profile_version() -> str:
    return os.getenv("HLS_PROFILE_VERSION") or "mobile-v2"


def faststart_inplace(path: str, should_abort=None) -> bool:
    if not path:
        return False
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        return False
    if not _is_mp4(file_path):
        return False

    _ensure_not_canceled(should_abort)
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

    ok = _run_ffmpeg(cmd, file_path)
    if not ok:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return False

    _ensure_not_canceled(should_abort)
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


def _transcode_to_mp4(src_path: str, dst_path: str, should_abort=None) -> bool:
    if not src_path or not dst_path:
        return False
    src = Path(src_path)
    if not src.exists():
        return False

    _ensure_not_canceled(should_abort)
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
        _ensure_not_canceled(should_abort)
        return True

    if os.path.exists(dst_path):
        try:
            os.unlink(dst_path)
        except OSError:
            pass

    _ensure_not_canceled(should_abort)
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
        "22",
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
    ok = _run_ffmpeg(cmd_reencode, src)
    _ensure_not_canceled(should_abort)
    return ok


def _generate_hls(
    mp4_path: str,
    out_dir: Path,
    progress_callback=None,
    should_abort=None,
) -> bool:
    if not mp4_path:
        return False

    out_dir.mkdir(parents=True, exist_ok=True)
    segment_seconds = int(os.getenv("HLS_SEGMENT_SECONDS") or "1")
    height_main = int(os.getenv("HLS_HEIGHT") or "1080")
    height_low = int(os.getenv("HLS_HEIGHT_LOW") or "540")
    maxrate_main = os.getenv("HLS_MAXRATE") or "6000k"
    bufsize_main = os.getenv("HLS_BUFSIZE") or "12000k"
    maxrate_low = os.getenv("HLS_MAXRATE_LOW") or "1800k"
    bufsize_low = os.getenv("HLS_BUFSIZE_LOW") or "3600k"
    crf_main = os.getenv("HLS_CRF") or "22"
    crf_low = os.getenv("HLS_CRF_LOW") or "24"
    preset = os.getenv("HLS_PRESET") or "veryfast"
    audio_bitrate = os.getenv("HLS_AUDIO_BITRATE") or "160k"
    fast_mode_enabled = (os.getenv("HLS_FAST_MODE") or "1") == "1"
    fast_mode_min_mb = int(os.getenv("HLS_FAST_MODE_MIN_MB") or "500")
    segment_tag = _sanitize_segment_tag(
        os.getenv("HLS_SEGMENT_TAG") or os.urandom(5).hex()
    )
    gop = int(os.getenv("HLS_GOP") or str(segment_seconds * 30))
    if gop < 1:
        gop = segment_seconds * 30

    _ensure_not_canceled(should_abort)
    _report(progress_callback, 55, "hls:encoding")

    has_audio = _has_audio(mp4_path)
    multi_variant = height_low > 0 and height_low < height_main
    source_size_mb = 0
    try:
        source_size_mb = int(Path(mp4_path).stat().st_size / (1024 * 1024))
    except OSError:
        source_size_mb = 0
    if fast_mode_enabled and source_size_mb >= fast_mode_min_mb:
        multi_variant = False
        _report(
            progress_callback,
            56,
            (
                f"hls:fast-mode "  # noqa: E231
                f"({source_size_mb}MB, single variant)"
            ),
        )

    hdr_source = _is_hdr_source(mp4_path)
    if hdr_source:
        _report(progress_callback, 57, "hls:hdr-tonemap")

    def build_hls_cmd(hdr_to_sdr: bool):
        scale_main = _scale_filter(height_main, hdr_to_sdr)
        if multi_variant:
            scale_low = _scale_filter(height_low, hdr_to_sdr)
            filter_complex = (
                f"[0:v]split=2[vlow][vmain];"  # noqa: E231,E702
                f"[vlow]{scale_low}[v0];"  # noqa: E231,E702
                f"[vmain]{scale_main}[v1]"
            )
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                str(mp4_path),
                "-filter_complex",
                filter_complex,
                "-map",
                "[v0]",
                "-map",
                "[v1]",
            ]
            if has_audio:
                cmd += ["-map", "0:a:0?", "-map", "0:a:0?"]
            else:
                cmd += ["-an"]

            cmd += [
                "-c:v:0",
                "libx264",
                "-preset",
                preset,
                "-crf",
                str(crf_low),
                "-threads:v:0",
                "0",
                "-maxrate:v:0",
                maxrate_low,
                "-bufsize:v:0",
                bufsize_low,
                "-g:v:0",
                str(gop),
                "-keyint_min:v:0",
                str(gop),
                "-color_primaries:v:0",
                "bt709",
                "-color_trc:v:0",
                "bt709",
                "-colorspace:v:0",
                "bt709",
                "-color_range:v:0",
                "tv",
                "-c:v:1",
                "libx264",
                "-preset",
                preset,
                "-crf",
                str(crf_main),
                "-threads:v:1",
                "0",
                "-maxrate:v:1",
                maxrate_main,
                "-bufsize:v:1",
                bufsize_main,
                "-g:v:1",
                str(gop),
                "-keyint_min:v:1",
                str(gop),
                "-color_primaries:v:1",
                "bt709",
                "-color_trc:v:1",
                "bt709",
                "-colorspace:v:1",
                "bt709",
                "-color_range:v:1",
                "tv",
                "-sc_threshold",
                "0",
                "-force_key_frames",
                f"expr:gte(t,n_forced*{segment_seconds})",  # noqa: E231
            ]
            if has_audio:
                cmd += [
                    "-c:a:0",
                    "aac",
                    "-b:a:0",
                    audio_bitrate,
                    "-ac:a:0",
                    "2",
                    "-c:a:1",
                    "aac",
                    "-b:a:1",
                    audio_bitrate,
                    "-ac:a:1",
                    "2",
                ]
            cmd += [
                "-f",
                "hls",
                "-hls_time",
                str(segment_seconds),
                "-hls_playlist_type",
                "vod",
                "-hls_flags",
                "independent_segments",
                "-hls_segment_filename",
                str(out_dir / f"v%v_{segment_tag}_seg_%05d.ts"),
                "-master_pl_name",
                "index.m3u8",
                "-var_stream_map",
                "v:0,a:0 v:1,a:1" if has_audio else "v:0 v:1",
                str(out_dir / "v%v.m3u8"),
            ]
            return cmd

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(mp4_path),
            "-vf",
            scale_main,
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-crf",
            str(crf_main),
            "-threads",
            "0",
            "-maxrate",
            maxrate_main,
            "-bufsize",
            bufsize_main,
            "-g",
            str(gop),
            "-keyint_min",
            str(gop),
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-color_range",
            "tv",
            "-sc_threshold",
            "0",
            "-force_key_frames",
            f"expr:gte(t,n_forced*{segment_seconds})",  # noqa: E231
        ]
        if has_audio:
            cmd += [
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                "-ac",
                "2",
            ]
        else:
            cmd += ["-an"]
        cmd += [
            "-f",
            "hls",
            "-hls_time",
            str(segment_seconds),
            "-hls_playlist_type",
            "vod",
            "-hls_flags",
            "independent_segments",
            "-hls_segment_filename",
            str(out_dir / f"{segment_tag}_seg_%05d.ts"),
            str(out_dir / "index.m3u8"),
        ]
        return cmd

    cmd = build_hls_cmd(hdr_source)
    ok = _run_ffmpeg(cmd, mp4_path)
    if not ok and hdr_source:
        _report(progress_callback, 58, "hls:retry-without-tonemap")
        cmd = build_hls_cmd(False)
        ok = _run_ffmpeg(cmd, mp4_path)
    if not ok:
        return False

    try:
        (out_dir / ".profile").write_text(
            hls_profile_version(),
            encoding="utf-8",
        )
    except OSError:
        logger.debug("hls profile marker write failed", exc_info=True)

    _ensure_not_canceled(should_abort)
    _report(progress_callback, 95, "hls:finalizing")
    return True


def prepare_video_for_streaming(
    file_field,
    model=None,
    kind: str = None,
    progress_callback=None,
    should_abort=None,
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

    _ensure_not_canceled(should_abort)
    _report(progress_callback, 5, "validate")

    if _is_mp4(name):
        _report(progress_callback, 20, "faststart")
        ok = faststart_inplace(path, should_abort=should_abort)
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

        _report(progress_callback, 20, "remux")
        ok = _transcode_to_mp4(path, tmp_path, should_abort=should_abort)
        if not ok:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            return False

        _ensure_not_canceled(should_abort)
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
        _report(progress_callback, 100, "done")
        return True

    _ensure_not_canceled(should_abort)
    _report(progress_callback, 40, "hls:prepare")

    hls_kind = kind or "video"
    if kind is None:
        name_hint = model.__class__.__name__.lower()
        if "hero" in name_hint:
            hls_kind = "hero"

    out_dir = hls_dir(hls_kind, model.pk)
    out_parent = out_dir.parent
    out_parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = out_parent / (
        f".{out_dir.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    )
    old_dir = out_parent / (
        f".{out_dir.name}.old-{os.getpid()}-{uuid.uuid4().hex}"
    )
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    ok = _generate_hls(
        mp4_path,
        tmp_dir,
        progress_callback=progress_callback,
        should_abort=should_abort,
    )
    if not ok:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return False

    try:
        if out_dir.exists():
            out_dir.replace(old_dir)
        tmp_dir.replace(out_dir)
    except OSError as exc:
        logger.warning("hls swap failed for %s: %s", out_dir, exc)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return False
    finally:
        shutil.rmtree(old_dir, ignore_errors=True)

    _report(progress_callback, 100, "done")
    return True
