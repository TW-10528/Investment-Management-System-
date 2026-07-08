"""
Real Baidu OCR API Integration

This module provides access to Baidu's official OCR service via their API.
Requires Baidu Cloud credentials (APP_ID, API_KEY, SECRET_KEY).

Get credentials: https://cloud.baidu.com/product/ocr
"""

import json
import os
import sys
import time
from typing import Any, Dict, List, Optional
from pathlib import Path

try:
    from aip import AipOcr
    BAIDU_SDK_AVAILABLE = True
except ImportError:
    BAIDU_SDK_AVAILABLE = False


class BaiduOCRAPI:
    """
    Baidu OCR API client for Japanese text extraction.

    Requires Baidu Cloud credentials:
    - APP_ID: Baidu Cloud application ID
    - API_KEY: Baidu Cloud API key
    - SECRET_KEY: Baidu Cloud secret key
    """

    def __init__(
        self,
        app_id: str,
        api_key: str,
        secret_key: str,
        use_general_basic: bool = False
    ):
        """
        Initialize Baidu OCR API client.

        Args:
            app_id: Baidu Cloud APP_ID
            api_key: Baidu Cloud API_KEY
            secret_key: Baidu Cloud SECRET_KEY
            use_general_basic: Use general_basic endpoint (free tier)
                             or general endpoint (paid, more accurate)
        """
        if not BAIDU_SDK_AVAILABLE:
            raise ImportError(
                "baidu-aip is required. Install with: pip install baidu-aip"
            )

        self.app_id = app_id
        self.api_key = api_key
        self.secret_key = secret_key
        self.use_general_basic = use_general_basic

        # Initialize Baidu OCR client
        self.client = AipOcr(app_id, api_key, secret_key)

        print(f"✅ Baidu OCR API initialized")
        print(f"   Endpoint: {'general_basic' if use_general_basic else 'general'}")

    def extract_text_from_pdf(
        self,
        pdf_path: str,
        convert_to_images: bool = True
    ) -> Dict[str, Any]:
        """
        Extract text from PDF using Baidu OCR API.

        Note: Baidu OCR API works on images, not PDFs directly.
        PDFs must be converted to images first.

        Args:
            pdf_path: Path to PDF file
            convert_to_images: Convert PDF to images first

        Returns:
            Extraction results dictionary
        """
        try:
            import pdfplumber
        except ImportError:
            raise ImportError("pdfplumber required for PDF processing")

        results = {
            "pdf_path": pdf_path,
            "pages": [],
            "total_text": "",
            "extraction_time": 0
        }

        start_time = time.time()

        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                print(f"Processing page {page_num + 1}/{len(pdf.pages)}...")

                # Convert page to image
                pil_image = page.to_image().original

                # Extract text using Baidu OCR
                page_result = self._extract_from_image(pil_image)

                results["pages"].append({
                    "page_num": page_num + 1,
                    "text": page_result.get("text", ""),
                    "words_num": page_result.get("words_num", 0),
                    "confidence": page_result.get("confidence", 0)
                })

                results["total_text"] += page_result.get("text", "") + "\n"

        results["extraction_time"] = time.time() - start_time
        results["status"] = "success"

        return results

    def _extract_from_image(self, image) -> Dict[str, Any]:
        """
        Extract text from PIL Image using Baidu OCR API.

        Args:
            image: PIL Image object

        Returns:
            Extraction result with text and confidence
        """
        try:
            import io
            import base64

            # Convert PIL image to bytes
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)

            # Encode as base64
            image_data = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

            # Call Baidu OCR API
            if self.use_general_basic:
                response = self.client.basicGeneral(image_data)
            else:
                response = self.client.general(image_data)

            # Parse response
            if "error_code" in response:
                error_msg = response.get("error_msg", "Unknown error")
                print(f"❌ Baidu API Error: {error_msg}")
                return {
                    "text": "",
                    "words_num": 0,
                    "confidence": 0,
                    "error": error_msg
                }

            # Extract text from response
            words_result = response.get("words_result", [])
            text_lines = []
            confidences = []

            for item in words_result:
                text = item.get("words", "")
                confidence = item.get("confidence", 0)

                if text:
                    text_lines.append(text)
                    confidences.append(confidence)

            text = "\n".join(text_lines)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0

            return {
                "text": text,
                "words_num": len(words_result),
                "confidence": avg_confidence
            }

        except Exception as e:
            print(f"❌ Extraction error: {e}")
            return {
                "text": "",
                "words_num": 0,
                "confidence": 0,
                "error": str(e)
            }

    @staticmethod
    def load_credentials_from_env() -> Optional[tuple]:
        """
        Load Baidu OCR credentials from environment variables.

        Environment variables needed:
        - BAIDU_APP_ID
        - BAIDU_API_KEY
        - BAIDU_SECRET_KEY

        Returns:
            Tuple of (app_id, api_key, secret_key) or None if not found
        """
        app_id = os.getenv("BAIDU_APP_ID")
        api_key = os.getenv("BAIDU_API_KEY")
        secret_key = os.getenv("BAIDU_SECRET_KEY")

        if app_id and api_key and secret_key:
            return app_id, api_key, secret_key

        return None

    @staticmethod
    def load_credentials_from_file(config_file: str) -> Optional[dict]:
        """
        Load Baidu OCR credentials from JSON file.

        File format:
        {
            "app_id": "your_app_id",
            "api_key": "your_api_key",
            "secret_key": "your_secret_key"
        }

        Args:
            config_file: Path to JSON config file

        Returns:
            Dictionary with credentials or None if not found
        """
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            return config
        except Exception as e:
            print(f"Error loading config: {e}")
            return None


def main():
    """CLI interface for Baidu OCR testing."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Test Baidu OCR API for SDG PDFs"
    )
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--app-id", help="Baidu Cloud APP_ID")
    parser.add_argument("--api-key", help="Baidu Cloud API_KEY")
    parser.add_argument("--secret-key", help="Baidu Cloud SECRET_KEY")
    parser.add_argument("--config", help="JSON config file with credentials")
    parser.add_argument("--basic", action="store_true", help="Use basic endpoint (free)")

    args = parser.parse_args()

    # Get credentials
    credentials = None

    if args.config:
        credentials = BaiduOCRAPI.load_credentials_from_file(args.config)
    elif args.app_id and args.api_key and args.secret_key:
        credentials = {
            "app_id": args.app_id,
            "api_key": args.api_key,
            "secret_key": args.secret_key
        }
    else:
        credentials = BaiduOCRAPI.load_credentials_from_env()

    if not credentials:
        print("❌ Baidu credentials not found!")
        print("\nProvide credentials in one of these ways:")
        print("  1. Command line: --app-id, --api-key, --secret-key")
        print("  2. Config file: --config baidu_config.json")
        print("  3. Environment: BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY")
        print("\nGet credentials: https://cloud.baidu.com/product/ocr")
        sys.exit(1)

    # Initialize and test
    try:
        ocr = BaiduOCRAPI(
            app_id=credentials["app_id"],
            api_key=credentials["api_key"],
            secret_key=credentials["secret_key"],
            use_general_basic=args.basic
        )

        print(f"\nExtracting text from: {args.pdf_path}")
        print("=" * 80)

        result = ocr.extract_text_from_pdf(args.pdf_path)

        print("\n" + "=" * 80)
        print("RESULTS:")
        print("=" * 80)
        print(f"Status: {result.get('status')}")
        print(f"Pages processed: {len(result.get('pages', []))}")
        print(f"Extraction time: {result.get('extraction_time', 0):.2f}s")
        print(f"Total text length: {len(result.get('total_text', ''))} chars")
        print()
        print("Extracted text (first 1000 chars):")
        print("-" * 80)
        print(result.get('total_text', '')[:1000])
        print()
        print("=" * 80)
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
