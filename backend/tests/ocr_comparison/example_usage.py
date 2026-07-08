"""
Example Usage of Baidu OCR SDG Extractor

This file demonstrates how to use the OCR extractor modules
in your own Python code (not just via command-line).
"""

import json
from pathlib import Path

from baidu_ocr_extractor import BaiduOCRExtractor
from baidu_sdg_extractor import extract_sdg_notice_with_baidu_ocr
from test_baidu_ocr import OCRComparator


# ============================================================
# Example 1: Simple OCR Text Extraction
# ============================================================

def example_1_simple_extraction():
    """Extract text from PDF using Baidu OCR."""
    print("\n" + "=" * 80)
    print("Example 1: Simple Text Extraction")
    print("=" * 80)

    pdf_path = "sample_pdfs/SDG_290524.pdf"

    # Create extractor with EasyOCR (default)
    extractor = BaiduOCRExtractor(method="easyocr")

    # Extract text from PDF
    text = extractor.extract_text_from_pdf(pdf_path)

    print(f"\nExtracted text (first 500 chars):")
    print(text[:500])
    print(f"\nTotal characters: {len(text)}")


# ============================================================
# Example 2: Extract SDG Notice Fields
# ============================================================

def example_2_sdg_extraction():
    """Extract structured fields from SDG notice."""
    print("\n" + "=" * 80)
    print("Example 2: SDG Notice Field Extraction")
    print("=" * 80)

    pdf_path = "sample_pdfs/SDG_290524.pdf"

    # Extract using Baidu OCR
    result = extract_sdg_notice_with_baidu_ocr(
        pdf_path,
        ocr_method="easyocr",
        use_hybrid=True,
    )

    # Display key fields
    fields = result.get("excel_fields", {})
    validation = result.get("validation", {})

    print(f"\nDocument Type: {result.get('document_type')}")
    print(f"Fund Name: {result.get('fund_name')}")
    print(f"Company: {result.get('company_name')}")
    print(f"Currency: {result.get('currency')}")
    print("\nExtracted Fields:")
    print(f"  Transaction Date: {fields.get('transaction_date')}")
    print(f"  Capital Contribution: ¥{fields.get('capital_contribution_amount'):,.0f}")
    print(f"  Distribution Received: ¥{fields.get('distribution_amount_received'):,.0f}")
    print(f"  Current Unfunded: ¥{fields.get('current_unfunded_commitment'):,.0f}")
    print(f"  Remaining After: ¥{fields.get('remaining_commitment'):,.0f}")
    print("\nValidation:")
    print(f"  Needs Review: {validation.get('needs_review')}")
    print(f"  Missing Fields: {validation.get('missing_fields')}")

    return result


# ============================================================
# Example 3: Compare Multiple OCR Methods
# ============================================================

def example_3_compare_methods():
    """Compare different OCR methods on same PDF."""
    print("\n" + "=" * 80)
    print("Example 3: Compare OCR Methods")
    print("=" * 80)

    pdf_path = "sample_pdfs/SDG_290524.pdf"
    methods = ["easyocr", "paddle"]

    results = {}

    for method in methods:
        print(f"\nTesting {method}...")
        try:
            result = extract_sdg_notice_with_baidu_ocr(
                pdf_path,
                ocr_method=method,
                use_hybrid=True,
            )

            fields = result.get("excel_fields", {})
            results[method] = {
                "capital_contribution": fields.get("capital_contribution_amount"),
                "distribution": fields.get("distribution_amount_received"),
                "transaction_date": fields.get("transaction_date"),
                "extraction_time": result.get("extraction_info", {}).get("text_length"),
            }

            print(f"  ✓ Success")
            print(f"    Capital: ¥{fields.get('capital_contribution_amount'):,.0f}")
            print(f"    Distribution: ¥{fields.get('distribution_amount_received'):,.0f}")

        except Exception as e:
            print(f"  ✗ Error: {e}")
            results[method] = {"error": str(e)}

    # Show comparison
    print("\n" + "-" * 80)
    print("Comparison Results:")
    print("-" * 80)
    for method, result in results.items():
        if "error" not in result:
            print(f"{method}: Capital=¥{result['capital_contribution']:,.0f}, "
                  f"Distribution=¥{result['distribution']:,.0f}")
        else:
            print(f"{method}: Error - {result['error']}")

    return results


# ============================================================
# Example 4: Batch Process Directory
# ============================================================

def example_4_batch_process():
    """Process all PDFs in directory."""
    print("\n" + "=" * 80)
    print("Example 4: Batch Process Directory")
    print("=" * 80)

    pdf_dir = "sample_pdfs"
    comparator = OCRComparator(sample_pdf_dir=pdf_dir)

    # Get all PDFs
    pdf_files = list(Path(pdf_dir).glob("*.pdf"))

    if not pdf_files:
        print(f"\nNo PDFs found in {pdf_dir}")
        print("Please add test PDFs to the sample_pdfs/ directory")
        return

    print(f"\nFound {len(pdf_files)} PDF(s)")

    # Process each PDF
    all_results = {}
    for pdf_path in pdf_files:
        print(f"\nProcessing {pdf_path.name}...")
        result = comparator.test_single_pdf(str(pdf_path), methods=["easyocr"])
        all_results[pdf_path.name] = result

    # Summary
    print("\n" + "-" * 80)
    print("Batch Processing Summary:")
    print("-" * 80)
    for pdf_name, result in all_results.items():
        if "error" not in result:
            print(f"✓ {pdf_name}")
        else:
            print(f"✗ {pdf_name}: {result['error']}")

    return all_results


# ============================================================
# Example 5: Programmatic Extraction with Custom Logic
# ============================================================

def example_5_custom_logic():
    """Extract and process results with custom business logic."""
    print("\n" + "=" * 80)
    print("Example 5: Custom Processing Logic")
    print("=" * 80)

    pdf_path = "sample_pdfs/SDG_290524.pdf"

    # Extract
    result = extract_sdg_notice_with_baidu_ocr(pdf_path, ocr_method="easyocr")

    fields = result.get("excel_fields", {})
    validation = result.get("validation", {})

    # Custom logic: Flag if amounts are suspiciously large
    capital = fields.get("capital_contribution_amount", 0)
    distribution = fields.get("distribution_amount_received", 0)

    print(f"\nCustom Business Logic Processing:")
    print(f"  Capital Contribution: ¥{capital:,.0f}")

    # Example: Flag large amounts
    if capital > 1_000_000_000:  # Over ¥1 billion
        print(f"  ⚠ WARNING: Large capital call detected (¥{capital:,.0f})")

    # Example: Flag if validation needed
    if validation.get("needs_review"):
        print(f"  ⚠ Manual review recommended")
        print(f"    Missing: {', '.join(validation.get('missing_fields', []))}")
    else:
        print(f"  ✓ All required fields present")

    # Example: Generate report line
    print(f"\nReport Line:")
    line = (
        f"{result.get('fund_name')} | "
        f"{result.get('document_type')} | "
        f"¥{capital:,.0f} | "
        f"{fields.get('transaction_date', 'N/A')} | "
        f"{'Needs Review' if validation.get('needs_review') else 'OK'}"
    )
    print(f"  {line}")

    return result


# ============================================================
# Example 6: Save Results for Later Analysis
# ============================================================

def example_6_save_results():
    """Extract and save results as JSON for analysis."""
    print("\n" + "=" * 80)
    print("Example 6: Save Results to JSON")
    print("=" * 80)

    pdf_path = "sample_pdfs/SDG_290524.pdf"

    # Extract
    result = extract_sdg_notice_with_baidu_ocr(pdf_path, ocr_method="easyocr")

    # Save to JSON
    output_file = "output/extraction_result.json"
    Path(output_file).parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved to: {output_file}")
    print(f"File size: {Path(output_file).stat().st_size / 1024:.1f} KB")

    # Show sample of what was saved
    print("\nSample saved fields:")
    fields = result.get("excel_fields", {})
    print(f"  Transaction Date: {fields.get('transaction_date')}")
    print(f"  Capital: ¥{fields.get('capital_contribution_amount'):,.0f}")
    print(f"  Distribution: ¥{fields.get('distribution_amount_received'):,.0f}")


# ============================================================
# Main: Run All Examples
# ============================================================

def main():
    """Run all examples."""
    print("\n" + "█" * 80)
    print("█ BAIDU OCR SDG EXTRACTOR - USAGE EXAMPLES")
    print("█" * 80)

    # Create output directory
    Path("output").mkdir(exist_ok=True)

    try:
        # Example 1: Simple extraction
        example_1_simple_extraction()
    except Exception as e:
        print(f"\n✗ Example 1 failed: {e}")

    try:
        # Example 2: SDG field extraction
        example_2_sdg_extraction()
    except Exception as e:
        print(f"\n✗ Example 2 failed: {e}")

    try:
        # Example 3: Compare methods
        example_3_compare_methods()
    except Exception as e:
        print(f"\n✗ Example 3 failed: {e}")

    try:
        # Example 4: Batch process
        example_4_batch_process()
    except Exception as e:
        print(f"\n✗ Example 4 failed: {e}")

    try:
        # Example 5: Custom logic
        example_5_custom_logic()
    except Exception as e:
        print(f"\n✗ Example 5 failed: {e}")

    try:
        # Example 6: Save results
        example_6_save_results()
    except Exception as e:
        print(f"\n✗ Example 6 failed: {e}")

    print("\n" + "█" * 80)
    print("█ EXAMPLES COMPLETE")
    print("█ * Check output/ directory for saved results")
    print("█ * See README.md for detailed documentation")
    print("█" * 80 + "\n")


if __name__ == "__main__":
    main()
