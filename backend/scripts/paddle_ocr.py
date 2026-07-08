#!/usr/bin/env python3
"""
PaddleOCR sidecar — invoked as a subprocess from the Node backend.

Usage (single image):
    paddle-venv/bin/python scripts/paddle_ocr.py <image_path> [--lang=japan|en]

Usage (multi-page PDF — all pages in one call, models loaded once):
    paddle-venv/bin/python scripts/paddle_ocr.py p1.png p2.png p3.png [--lang=japan]

Prints a single JSON line to stdout:
    {"text": "...", "lines": [...], "pages": N}

On failure, prints {"error": "..."} and exits non-zero.

Passing ALL page images in one call means the models (PP-OCRv6_medium_det +
PP-OCRv6_medium_rec) are loaded only once instead of once per page, cutting
total time from (N pages × model-load × inference) to (1 model-load + N × inference).
"""
import json
import sys


def main():
    # All positional args are image paths; --lang=X is optional.
    image_paths = []
    lang = "japan"
    for a in sys.argv[1:]:
        if a.startswith("--lang="):
            lang = a.split("=", 1)[1]
        elif not a.startswith("--"):
            image_paths.append(a)

    if not image_paths:
        print(json.dumps({"error": "usage: paddle_ocr.py <image1> [image2 ...] [--lang=japan|en]"}))
        sys.exit(1)

    try:
        from paddleocr import PaddleOCR
    except Exception as e:
        print(json.dumps({"error": f"paddleocr not available: {e}"}))
        sys.exit(1)

    try:
        # lang='japan' loads Japanese-tuned detection + recognition models
        # (covers kanji/hiragana/katakana + ASCII digits/punctuation in SDG
        # notices).  Orientation/unwarping models are disabled — uploaded scans
        # are already upright; skipping them saves ~5s model download per call.
        ocr = PaddleOCR(
            lang=lang,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )

        # Pass all page paths at once — PaddleOCR 3.x predict() accepts a list,
        # keeping models in memory across pages and processing them in sequence.
        input_arg = image_paths[0] if len(image_paths) == 1 else image_paths
        results = list(ocr.predict(input_arg))

        lines = []
        for page_result in results:
            texts  = page_result.get("rec_texts")  or []
            scores = page_result.get("rec_scores") or []
            for i, t in enumerate(texts):
                score = scores[i] if i < len(scores) else None
                lines.append({"text": t, "score": score})

        full_text = "\n".join(l["text"] for l in lines)
        print(json.dumps({
            "text":  full_text,
            "lines": lines,
            "pages": len(results),
        }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
