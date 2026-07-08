"""
Test Script for Baidu OCR vs Paddle OCR Comparison

This script provides utilities to:
1. Test individual PDF files with different OCR methods
2. Compare results between OCR methods
3. Measure accuracy and performance
4. Generate detailed comparison reports
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

from baidu_sdg_extractor import (
    extract_sdg_notice_with_baidu_ocr,
    extract_pdf_text_hybrid,
)


class OCRComparator:
    """Compare OCR methods for SDG PDF extraction."""

    def __init__(self, sample_pdf_dir: str = "./sample_pdfs"):
        """Initialize comparator."""
        self.sample_pdf_dir = Path(sample_pdf_dir)
        self.results = {}

    def test_single_pdf(
        self,
        pdf_path: str,
        methods: List[str] = None,
    ) -> Dict[str, Any]:
        """
        Test a single PDF with specified OCR methods.

        Args:
            pdf_path: Path to PDF file
            methods: List of OCR methods to test (default: all available)

        Returns:
            Comparison results for all methods
        """
        if methods is None:
            methods = ["easyocr", "trocr"]  # Skip paddle due to segfault on this system

        if not os.path.exists(pdf_path):
            return {"error": f"PDF not found: {pdf_path}"}

        print(f"\n{'='*80}")
        print(f"Testing: {os.path.basename(pdf_path)}")
        print(f"{'='*80}")

        results = {
            "pdf_name": os.path.basename(pdf_path),
            "file_size_mb": os.path.getsize(pdf_path) / (1024 * 1024),
            "methods": {},
        }

        for method in methods:
            print(f"\n[{method.upper()}] Processing...")
            try:
                start_time = time.time()
                result = extract_sdg_notice_with_baidu_ocr(
                    pdf_path,
                    ocr_method=method,
                    use_hybrid=True,
                )
                elapsed = time.time() - start_time

                extraction_info = result.get("extraction_info", {})
                excel_fields = result.get("excel_fields", {})
                validation = result.get("validation", {})

                method_result = {
                    "status": "success",
                    "elapsed_seconds": round(elapsed, 2),
                    "extraction_method": extraction_info.get("extraction_method"),
                    "document_type": result.get("document_type"),
                    "extracted_fields": {
                        "transaction_date": excel_fields.get("transaction_date"),
                        "capital_contribution_amount": excel_fields.get("capital_contribution_amount"),
                        "distribution_amount_received": excel_fields.get("distribution_amount_received"),
                        "current_unfunded_commitment": excel_fields.get("current_unfunded_commitment"),
                        "remaining_commitment": excel_fields.get("remaining_commitment"),
                    },
                    "validation": {
                        "needs_review": validation.get("needs_review"),
                        "missing_fields": validation.get("missing_fields", []),
                    },
                    "text_preview": result.get("extracted_text_preview", "")[:200],
                }

                results["methods"][method] = method_result

                # Print summary
                print(f"  ✓ Success in {elapsed:.2f}s")
                print(f"  Document type: {result.get('document_type')}")
                print(f"  Extraction method: {extraction_info.get('extraction_method')}")
                print(f"  Capital call: ¥{excel_fields.get('capital_contribution_amount', 0):,.0f}")
                print(f"  Distribution: ¥{excel_fields.get('distribution_amount_received', 0):,.0f}")
                if validation.get("missing_fields"):
                    print(f"  ⚠ Missing: {', '.join(validation['missing_fields'])}")

            except Exception as e:
                print(f"  ✗ Error: {str(e)}")
                results["methods"][method] = {
                    "status": "error",
                    "error": str(e),
                }

        return results

    def compare_methods_for_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """
        Compare all OCR methods for a single PDF.

        Returns comparison metrics and recommendations.
        """
        if not os.path.exists(pdf_path):
            return {"error": f"PDF not found: {pdf_path}"}

        print(f"\n{'='*80}")
        print(f"Detailed Comparison: {os.path.basename(pdf_path)}")
        print(f"{'='*80}")

        # Extract with all methods
        results = self.test_single_pdf(pdf_path, methods=["easyocr", "paddle", "trocr"])

        if "error" in results:
            return results

        # Build comparison metrics
        comparison = {
            "pdf_name": results["pdf_name"],
            "metrics": {},
            "recommendation": None,
        }

        method_results = results.get("methods", {})

        # Compare extraction times
        print(f"\n{'─'*80}")
        print("Performance Comparison:")
        print(f"{'─'*80}")

        for method, result in method_results.items():
            if result.get("status") == "success":
                elapsed = result.get("elapsed_seconds", 0)
                comparison["metrics"][method] = {
                    "elapsed_seconds": elapsed,
                    "document_type": result.get("document_type"),
                    "has_errors": result.get("validation", {}).get("needs_review", False),
                    "missing_fields": len(
                        result.get("validation", {}).get("missing_fields", [])
                    ),
                }
                print(
                    f"  {method:12} : {elapsed:6.2f}s  |  "
                    f"Type: {result.get('document_type', 'unknown'):20} | "
                    f"Missing: {len(result.get('validation', {}).get('missing_fields', []))} fields"
                )

        # Recommend best method
        valid_methods = {
            m: r
            for m, r in comparison["metrics"].items()
            if m in method_results and method_results[m].get("status") == "success"
        }

        if valid_methods:
            # Prefer method with no missing fields, then fastest
            best_method = min(
                valid_methods.items(),
                key=lambda x: (x[1]["missing_fields"], x[1]["elapsed_seconds"]),
            )
            comparison["recommendation"] = {
                "method": best_method[0],
                "reason": f"Best accuracy with {best_method[1]['missing_fields']} missing fields "
                f"in {best_method[1]['elapsed_seconds']:.2f}s",
            }

            print(f"\n{'─'*80}")
            print(f"Recommendation: {best_method[0].upper()}")
            print(f"  {comparison['recommendation']['reason']}")
            print(f"{'─'*80}")

        return comparison

    def test_all_pdfs_in_directory(self, directory: str = None) -> Dict[str, Any]:
        """
        Test all PDFs in a directory.

        Args:
            directory: Directory containing PDFs (default: sample_pdfs)
        """
        if directory is None:
            directory = str(self.sample_pdf_dir)

        pdf_dir = Path(directory)
        if not pdf_dir.exists():
            return {"error": f"Directory not found: {directory}"}

        pdfs = list(pdf_dir.glob("*.pdf"))
        if not pdfs:
            return {"error": f"No PDFs found in {directory}"}

        print(f"\nFound {len(pdfs)} PDF(s) to test")

        all_results = {
            "directory": directory,
            "total_pdfs": len(pdfs),
            "results": {},
            "summary": {},
        }

        for pdf_path in pdfs:
            result = self.test_single_pdf(str(pdf_path))
            all_results["results"][pdf_path.name] = result

        # Build summary
        success_count = 0
        error_count = 0
        method_success_count = {"easyocr": 0, "paddle": 0, "trocr": 0}

        for pdf_name, result in all_results["results"].items():
            if "error" not in result:
                success_count += 1
                for method, method_result in result.get("methods", {}).items():
                    if method_result.get("status") == "success":
                        method_success_count[method] = method_success_count.get(method, 0) + 1
            else:
                error_count += 1

        all_results["summary"] = {
            "successful_pdfs": success_count,
            "failed_pdfs": error_count,
            "method_success_rates": {
                method: f"{count}/{success_count}"
                for method, count in method_success_count.items()
            },
        }

        return all_results

    def generate_report(self, results: Dict[str, Any], output_file: str = None) -> str:
        """
        Generate a detailed text report of comparison results.

        Args:
            results: Comparison results dictionary
            output_file: Optional file to save report

        Returns:
            Report text
        """
        report_lines = [
            "=" * 80,
            "OCR METHOD COMPARISON REPORT",
            "=" * 80,
            f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            "",
        ]

        if "pdf_name" in results:
            # Single PDF report
            report_lines.extend([
                f"PDF: {results['pdf_name']}",
                f"File Size: {results.get('file_size_mb', 0):.2f} MB",
                "",
                "RESULTS:",
                "─" * 80,
            ])

            for method, result in results.get("methods", {}).items():
                report_lines.append(f"\n{method.upper()}:")
                if result.get("status") == "success":
                    report_lines.extend([
                        f"  Status: ✓ Success",
                        f"  Time: {result.get('elapsed_seconds', 0):.2f}s",
                        f"  Document Type: {result.get('document_type')}",
                        f"  Capital Contribution: ¥{result.get('extracted_fields', {}).get('capital_contribution_amount', 0):,.0f}",
                        f"  Distribution: ¥{result.get('extracted_fields', {}).get('distribution_amount_received', 0):,.0f}",
                    ])
                    missing = result.get("validation", {}).get("missing_fields", [])
                    if missing:
                        report_lines.append(f"  Missing Fields: {', '.join(missing)}")
                else:
                    report_lines.append(f"  Status: ✗ Error")
                    report_lines.append(f"  Error: {result.get('error', 'Unknown error')}")

        elif "directory" in results:
            # Directory report
            report_lines.extend([
                f"Directory: {results['directory']}",
                f"Total PDFs: {results['total_pdfs']}",
                "",
                "SUMMARY:",
                "─" * 80,
            ])
            summary = results.get("summary", {})
            report_lines.extend([
                f"  Successful: {summary.get('successful_pdfs', 0)}",
                f"  Failed: {summary.get('failed_pdfs', 0)}",
                "",
                "Method Success Rates:",
            ])
            for method, rate in summary.get("method_success_rates", {}).items():
                report_lines.append(f"  {method}: {rate}")

        report_text = "\n".join(report_lines)

        if output_file:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(report_text)
            print(f"\nReport saved to: {output_file}")

        return report_text

    def save_results_json(self, results: Dict[str, Any], output_file: str) -> None:
        """Save results as JSON."""
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"Results saved to: {output_file}")


def main():
    """Main test runner."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Test Baidu OCR vs Paddle OCR for SDG PDFs"
    )
    parser.add_argument("--pdf", help="Test single PDF file")
    parser.add_argument(
        "--dir",
        default="./sample_pdfs",
        help="Test all PDFs in directory (default: ./sample_pdfs)",
    )
    parser.add_argument(
        "--methods",
        default="easyocr,paddle,trocr",
        help="Comma-separated OCR methods to test",
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Run detailed comparison for single PDF",
    )
    parser.add_argument(
        "--report",
        help="Save text report to file",
    )
    parser.add_argument(
        "--json",
        help="Save JSON results to file",
    )

    args = parser.parse_args()

    comparator = OCRComparator(sample_pdf_dir=args.dir)

    if args.pdf:
        # Test single PDF
        if not os.path.exists(args.pdf):
            print(f"Error: PDF not found: {args.pdf}")
            sys.exit(1)

        if args.compare:
            results = comparator.compare_methods_for_pdf(args.pdf)
        else:
            methods = args.methods.split(",")
            results = comparator.test_single_pdf(args.pdf, methods=methods)

    else:
        # Test all PDFs in directory
        results = comparator.test_all_pdfs_in_directory(args.dir)

    # Generate report
    if args.report:
        comparator.generate_report(results, args.report)
    else:
        report = comparator.generate_report(results)
        print("\n" + report)

    # Save JSON
    if args.json:
        comparator.save_results_json(results, args.json)


if __name__ == "__main__":
    main()
