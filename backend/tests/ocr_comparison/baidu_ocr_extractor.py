"""
Baidu OCR Extractor using Python Transformers
Alternative OCR implementation to compare with Paddle OCR

This module uses transformers-based OCR models to extract text from PDFs
and compare performance with the Paddle OCR approach used in production.
"""

import json
import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from PIL import Image
    import io
except ImportError:
    Image = None

# Transformer-based OCR options
# Option 1: PaddleOCR (for comparison baseline)
try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
except ImportError:
    PADDLE_AVAILABLE = False

# Option 2: EasyOCR (Baidu-compatible approach)
try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False

# Option 3: TrOCR from Transformers (Baidu-inspired architecture)
try:
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel
    TROCR_AVAILABLE = True
except ImportError:
    TROCR_AVAILABLE = False

# Option 4: LayoutParser with Baidu backend simulation
try:
    import layoutparser as lp
    LAYOUTPARSER_AVAILABLE = True
except ImportError:
    LAYOUTPARSER_AVAILABLE = False


class BaiduOCRExtractor:
    """
    Baidu OCR Extractor using transformers-based models.
    Supports multiple OCR backends for comparison.
    """

    def __init__(self, method: str = "easyocr", language: str = "ja"):
        """
        Initialize Baidu OCR extractor.

        Args:
            method: OCR method to use ('easyocr', 'trocr', 'layoutparser')
            language: Language to detect (default: 'ja' for Japanese)
        """
        self.method = method
        self.language = language
        self.ocr_instance = None
        self.processor = None
        self.model = None

        self._initialize_ocr()

    def _initialize_ocr(self):
        """Initialize the selected OCR method."""
        if self.method == "easyocr":
            if not EASYOCR_AVAILABLE:
                raise ImportError(
                    "easyocr is required. Install with: pip install easyocr"
                )
            print(f"Initializing EasyOCR with language: {self.language}")
            self.ocr_instance = easyocr.Reader(
                [self.language, "en"], gpu=True, verbose=False
            )

        elif self.method == "trocr":
            if not TROCR_AVAILABLE:
                raise ImportError(
                    "transformers and torch are required. "
                    "Install with: pip install transformers torch"
                )
            print("Initializing TrOCR model...")
            self.processor = TrOCRProcessor.from_pretrained(
                "microsoft/trocr-base-printed"
            )
            self.model = VisionEncoderDecoderModel.from_pretrained(
                "microsoft/trocr-base-printed"
            )

        elif self.method == "paddle":
            if not PADDLE_AVAILABLE:
                raise ImportError(
                    "paddleocr is required. Install with: pip install paddleocr"
                )
            print("Initializing PaddleOCR (baseline for comparison)...")
            try:
                self.ocr_instance = PaddleOCR(
                    use_angle_cls=True, lang="japan", use_gpu=True
                )
            except TypeError:
                self.ocr_instance = PaddleOCR(
                    use_angle_cls=True, lang="japan"
                )

        else:
            raise ValueError(
                f"Unknown OCR method: {self.method}. "
                "Choose from: easyocr, trocr, paddle"
            )

    def extract_text_from_pdf_page(self, pdf_path: str, page_num: int = 0) -> str:
        """
        Extract text from a single PDF page using OCR.

        Args:
            pdf_path: Path to the PDF file
            page_num: Page number (0-indexed)

        Returns:
            Extracted text from the page
        """
        if pdfplumber is None:
            raise ImportError("pdfplumber is required. Install with: pip install pdfplumber")

        with pdfplumber.open(pdf_path) as pdf:
            if page_num >= len(pdf.pages):
                raise ValueError(f"Page {page_num} not found in PDF")

            page = pdf.pages[page_num]
            # Render page to image
            pil_image = page.to_image().original

            # Try to extract text using OCR method
            if self.method == "easyocr":
                return self._extract_easyocr(pil_image)
            elif self.method == "trocr":
                return self._extract_trocr(pil_image)
            elif self.method == "paddle":
                return self._extract_paddle(pil_image)

    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """
        Extract text from all pages of a PDF using OCR.

        Args:
            pdf_path: Path to the PDF file

        Returns:
            Combined text from all pages
        """
        if pdfplumber is None:
            raise ImportError("pdfplumber is required. Install with: pip install pdfplumber")

        text_parts: List[str] = []

        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                try:
                    print(f"Processing page {page_num + 1}/{len(pdf.pages)}...")
                    pil_image = page.to_image().original

                    if self.method == "easyocr":
                        page_text = self._extract_easyocr(pil_image)
                    elif self.method == "trocr":
                        page_text = self._extract_trocr(pil_image)
                    elif self.method == "paddle":
                        page_text = self._extract_paddle(pil_image)

                    text_parts.append(page_text)
                except Exception as e:
                    print(f"Error processing page {page_num + 1}: {e}")
                    text_parts.append("")

        return "\n".join(text_parts)

    def _extract_easyocr(self, image) -> str:
        """Extract text using EasyOCR."""
        try:
            import numpy as np
            # Convert PIL Image to numpy array if needed
            if hasattr(image, 'convert'):
                image = np.array(image.convert('RGB'))

            result = self.ocr_instance.readtext(
                image, detail=1, paragraph=False
            )
            text_lines = []
            for detection in result:
                if isinstance(detection, (list, tuple)) and len(detection) >= 2:
                    text = detection[1]
                    confidence = detection[2] if len(detection) > 2 else 0
                    if confidence > 0.3:  # Filter low confidence
                        text_lines.append(text)
            return "\n".join(text_lines)
        except Exception as e:
            print(f"EasyOCR extraction error: {e}")
            return ""

    def _extract_trocr(self, image) -> str:
        """Extract text using TrOCR from Transformers."""
        try:
            import torch
            # Prepare image for TrOCR
            pixel_values = self.processor(images=image, return_tensors="pt").pixel_values

            # Move to GPU if available
            if torch.cuda.is_available():
                pixel_values = pixel_values.to('cuda')
                self.model = self.model.to('cuda')

            generated_ids = self.model.generate(pixel_values)
            generated_text = self.processor.batch_decode(
                generated_ids, skip_special_tokens=True
            )
            return "\n".join(generated_text)
        except Exception as e:
            print(f"TrOCR extraction error: {e}")
            return ""

    def _extract_paddle(self, image) -> str:
        """Extract text using PaddleOCR (baseline)."""
        try:
            import numpy as np
            # Convert PIL Image to numpy array if needed
            if hasattr(image, 'convert'):
                image = np.array(image.convert('RGB'))

            result = self.ocr_instance.ocr(image, cls=True)
            text_lines = []
            if result and result[0]:
                for line in result[0]:
                    if len(line) >= 2:
                        text = line[1][0]
                        confidence = line[1][1]
                        if confidence > 0.3:
                            text_lines.append(text)
            return "\n".join(text_lines)
        except Exception as e:
            print(f"PaddleOCR extraction error: {e}")
            return ""

    def compare_methods(self, pdf_path: str, page_num: int = 0) -> Dict[str, Any]:
        """
        Compare multiple OCR methods on the same PDF page.

        Args:
            pdf_path: Path to the PDF file
            page_num: Page number (0-indexed)

        Returns:
            Comparison results
        """
        results = {}
        methods = []

        if PADDLE_AVAILABLE:
            methods.append("paddle")
        if EASYOCR_AVAILABLE:
            methods.append("easyocr")
        if TROCR_AVAILABLE:
            methods.append("trocr")

        if pdfplumber is None:
            raise ImportError("pdfplumber is required. Install with: pip install pdfplumber")

        with pdfplumber.open(pdf_path) as pdf:
            if page_num >= len(pdf.pages):
                raise ValueError(f"Page {page_num} not found in PDF")

            page = pdf.pages[page_num]
            pil_image = page.to_image().original

            for method in methods:
                print(f"Testing {method}...")
                try:
                    temp_extractor = BaiduOCRExtractor(method=method)
                    if method == "paddle":
                        text = temp_extractor._extract_paddle(pil_image)
                    elif method == "easyocr":
                        text = temp_extractor._extract_easyocr(pil_image)
                    elif method == "trocr":
                        text = temp_extractor._extract_trocr(pil_image)

                    results[method] = {
                        "text": text,
                        "length": len(text),
                        "line_count": len(text.split("\n")),
                    }
                except Exception as e:
                    results[method] = {"error": str(e)}

        return results


def normalize_text(text: str) -> str:
    """Normalize extracted text."""
    if not text:
        return ""
    text = text.replace("\xa0", " ").replace("​", "")
    text = text.replace("，", ",")
    text = text.replace("．", ".")
    text = text.replace("（", "(").replace("）", ")")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return text.strip()


def clean_amount(value: Optional[str]) -> Optional[float]:
    """Clean and parse JPY amount."""
    if value is None:
        return None

    value = str(value).strip()
    value = (
        value.replace(",", "")
        .replace(".", "")
        if re.search(r"\d\.\d{3}", value)
        else value
    )
    value = (
        value.replace(",", "")
        .replace("円", "")
        .replace("￥", "")
        .replace("¥", "")
        .replace(" ", "")
        .replace("　", "")
    )

    if value in {"", "-", "－"}:
        return 0.0

    try:
        return float(value)
    except ValueError:
        return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Baidu OCR Extractor for SDG PDFs"
    )
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument(
        "--method",
        default="easyocr",
        choices=["easyocr", "trocr", "paddle"],
        help="OCR method to use",
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Compare all available OCR methods",
    )
    parser.add_argument("--page", type=int, default=0, help="Page number (0-indexed)")

    args = parser.parse_args()

    if not os.path.exists(args.pdf_path):
        print(f"Error: PDF file not found: {args.pdf_path}")
        sys.exit(1)

    if args.compare:
        extractor = BaiduOCRExtractor(method="paddle")
        print("Comparing OCR methods...")
        results = extractor.compare_methods(args.pdf_path, args.page)
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        extractor = BaiduOCRExtractor(method=args.method)
        print(f"Extracting text using {args.method}...")
        text = extractor.extract_text_from_pdf(args.pdf_path)
        print("\n" + "=" * 80)
        print("EXTRACTED TEXT:")
        print("=" * 80)
        print(text)
        print("=" * 80)
