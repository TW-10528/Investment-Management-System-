# OCR Comparison Test Setup Guide

Complete guide for setting up and running the Baidu OCR vs Paddle OCR comparison tests.

## Directory Structure

```
backend/tests/ocr_comparison/
├── baidu_ocr_extractor.py          # Core Baidu OCR implementations
├── baidu_sdg_extractor.py          # SDG extraction logic (Baidu-based)
├── test_baidu_ocr.py               # Test runner and comparison tools
├── example_usage.py                # Example code showing how to use modules
├── requirements.txt                # Python dependencies
├── .gitignore                      # Git ignore patterns
│
├── sample_pdfs/                    # ← Place your test PDFs here
│   ├── .placeholder                # Placeholder for directory
│   ├── SDG_290524.pdf              # Example: capital call notice
│   └── SDG_050625.pdf              # Example: distribution notice
│
├── output/                         # Generated reports and results
│   ├── comparison_results.json     # Detailed JSON results
│   ├── comparison_report.txt       # Text report
│   └── extraction_result.json      # Single extraction result
│
├── README.md                       # Complete documentation
├── QUICKSTART.md                   # 5-minute quick start
└── SETUP_GUIDE.md                  # This file
```

## Installation Steps

### Step 1: Navigate to Test Directory

```bash
cd /home/twr/invfin/backend/tests/ocr_comparison
```

### Step 2: Create Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate (Linux/Mac)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate
```

### Step 3: Install Dependencies

```bash
# Install all OCR methods and dependencies
pip install -r requirements.txt

# Note: First install may take 5-10 minutes
# Models are downloaded on first use (~2-5 GB total)
```

### Step 4: Verify Installation

```bash
# Test that modules can be imported
python -c "import pdfplumber, easyocr, paddleocr; print('✓ All imports OK')"
```

## Adding Test PDFs

### Create Sample PDFs Directory

The `sample_pdfs/` directory is already created. Add your test PDFs here.

### Filename Recommendations

Use format: `SDG_DDMMYY.pdf`

Examples:
- `SDG_290524.pdf` → Auto-detected transaction date: 2024-05-29
- `SDG_020421.pdf` → Auto-detected transaction date: 2021-04-02
- `SDG_150823.pdf` → Auto-detected transaction date: 2023-08-15

Any filename works, but the DDMMYY format enables automatic date extraction.

### Prepare Test Documents

1. **Get SDG PDFs** - Obtain real SDG notices for testing
2. **Ensure readability** - Make sure PDFs are not corrupted
3. **Include mix** - Test both:
   - Capital call notices
   - Distribution notices
   - Native text PDFs (fast path)
   - Scanned PDFs (OCR path)

## Running Tests

### Quick Test (5 minutes)

```bash
# Test single PDF with default settings
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf

# Expected output shows extracted amounts and dates
```

### Full Comparison (10 minutes)

```bash
# Compare all OCR methods for single PDF
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf --compare

# Shows detailed metrics and recommendations
```

### Batch Test All PDFs (30+ minutes)

```bash
# Test all PDFs in sample_pdfs/ directory
python test_baidu_ocr.py \
  --json output/comparison_results.json \
  --report output/comparison_report.txt

# Saves JSON and text reports
```

### Direct SDG Extraction

```bash
# Extract fields using specific OCR method
python baidu_sdg_extractor.py sample_pdfs/SDG_290524.pdf --method easyocr

# Supported methods: easyocr, trocr, paddle
```

### Run Examples

```bash
# See example usage in Python code
python example_usage.py

# Demonstrates 6 different usage patterns
```

## Understanding Test Results

### Console Output Example

```
================================================================================
Testing: SDG_290524.pdf
================================================================================

[EASYOCR] Processing...
  ✓ Success in 8.42s
  Document type: capital_call_notice
  Extraction method: easyocr
  Capital call: ¥363,602,836
  Distribution: ¥0.00

[PADDLE] Processing...
  ✓ Success in 5.21s
  Document type: capital_call_notice
  Extraction method: paddle
  Capital call: ¥363,602,836
  Distribution: ¥0.00

────────────────────────────────────────────────────────────────────────────────
Recommendation: PADDLE
  Best accuracy with 0 missing fields in 5.21s
────────────────────────────────────────────────────────────────────────────────
```

### Key Metrics to Watch

1. **Extraction Method**
   - `pdfplumber`: Native text extraction (fastest, <1s)
   - `easyocr`: Baidu-like OCR (~8-15s)
   - `trocr`: Transformer-based (~15-30s)
   - `paddle`: Production baseline (~3-8s)

2. **Document Type**
   - `capital_call_notice`: Capital call request
   - `distribution_notice`: Distribution payment
   - `unknown_sdg_notice`: Could not be detected

3. **Extracted Fields** (should match expected values)
   - `transaction_date`: YYYY-MM-DD format
   - `capital_contribution_amount`: ¥XXX,XXX,XXX format
   - `distribution_amount_received`: ¥XXX,XXX,XXX format
   - `current_unfunded_commitment`: ¥XXX,XXX,XXX format
   - `remaining_after_payment`: ¥XXX,XXX,XXX format

4. **Validation Status**
   - `needs_review: false` → All fields extracted successfully
   - `needs_review: true` → Manual verification recommended
   - `missing_fields: []` → No missing critical fields

## Troubleshooting

### Issue: "No module named 'easyocr'"

**Solution**: Install dependencies
```bash
pip install -r requirements.txt
```

### Issue: "CUDA out of memory" or "Out of memory"

**Solution**: Process one PDF at a time
```bash
python test_baidu_ocr.py --pdf single_file.pdf --methods easyocr
```

### Issue: Very slow performance (first run)

**Solution**: Normal! Models need to download
- First run: 5-10 minutes (includes model download)
- Subsequent runs: 2-3 minutes per PDF
- Can be reduced to <1 minute with GPU

### Issue: Model download fails

**Solution**: Manual cache setup
```bash
# For EasyOCR
export EASYOCR_USER_AGENT_TOKEN=/path/to/token

# For TrOCR (HuggingFace)
export HF_HOME=/path/to/huggingface/cache

# For PaddleOCR
export PADDLE_CACHE_HOME=/path/to/paddle/cache
```

### Issue: "PDF file not found"

**Solution**: Verify file location
```bash
# Check files in directory
ls -la sample_pdfs/

# Use full path
python test_baidu_ocr.py --pdf /full/path/to/file.pdf
```

## Performance Tuning

### Enable GPU Acceleration

```bash
# Check if GPU is available
python -c "import torch; print(torch.cuda.is_available())"

# Models automatically use GPU if available
# No configuration needed - it just works!
```

### Optimize for Speed

```bash
# Test with fast EasyOCR only
python test_baidu_ocr.py --pdf file.pdf --methods easyocr

# Process multiple PDFs in parallel (manual)
for pdf in sample_pdfs/*.pdf; do
    python baidu_sdg_extractor.py "$pdf" --method easyocr &
done
wait
```

### Optimize for Accuracy

```bash
# Use TrOCR for highest accuracy
python baidu_sdg_extractor.py file.pdf --method trocr

# Or use multiple methods and compare
python test_baidu_ocr.py --pdf file.pdf --compare
```

## File Descriptions

### baidu_ocr_extractor.py (400 lines)
**Core OCR extraction module**
- `BaiduOCRExtractor` class supporting EasyOCR, TrOCR, PaddleOCR
- `extract_text_from_pdf_page()` - Single page extraction
- `extract_text_from_pdf()` - Full PDF extraction
- `compare_methods()` - Compare OCR methods
- Text normalization and amount parsing utilities

**Usage**:
```python
from baidu_ocr_extractor import BaiduOCRExtractor
extractor = BaiduOCRExtractor(method="easyocr")
text = extractor.extract_text_from_pdf("file.pdf")
```

### baidu_sdg_extractor.py (600+ lines)
**SDG-specific extraction logic (Baidu-based)**
- All field extraction patterns from original `sdg_lps_module.py`
- Hybrid extraction combining pdfplumber + Baidu OCR
- Japanese date/amount parsing
- Document type detection
- Excel field mapping
- Validation logic

**Usage**:
```python
from baidu_sdg_extractor import extract_sdg_notice_with_baidu_ocr
result = extract_sdg_notice_with_baidu_ocr("file.pdf", ocr_method="easyocr")
```

### test_baidu_ocr.py (400+ lines)
**Test runner and comparison utilities**
- `OCRComparator` class for batch testing
- Single PDF testing with multiple methods
- Directory batch processing
- Performance metrics collection
- Text and JSON report generation
- Recommendation engine

**Usage**:
```python
from test_baidu_ocr import OCRComparator
comparator = OCRComparator()
results = comparator.test_single_pdf("file.pdf")
```

### example_usage.py (400+ lines)
**6 practical examples**
1. Simple text extraction
2. Field extraction
3. Method comparison
4. Batch processing
5. Custom business logic
6. Saving results as JSON

**Usage**:
```bash
python example_usage.py
```

## Test Scenarios

### Scenario 1: Quick Validation (5 min)
```bash
# Verify setup works
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf
```

### Scenario 2: Single PDF Comparison (10 min)
```bash
# Compare all methods for one PDF
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf --compare
```

### Scenario 3: Full Test Suite (30+ min)
```bash
# Test all PDFs with all methods
python test_baidu_ocr.py --json output/results.json --report output/report.txt
```

### Scenario 4: Specific Method Testing (5 min/PDF)
```bash
# Test only with EasyOCR
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf --methods easyocr
```

### Scenario 5: Production Baseline (3 min/PDF)
```bash
# Test with Paddle (current production)
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf --methods paddle
```

## Expected Results

### Successful Extraction
```
✓ Success in 8.42s
Document type: capital_call_notice
Capital call: ¥363,602,836
needs_review: false
```

### Needs Review
```
⚠ Needs Review
Missing fields: [current_unfunded_commitment]
Document type detected, but commitment missing
```

### Failed Extraction
```
✗ Error: [Error details]
Status: error
Check PDF is readable
```

## Next Steps

1. **Add test PDFs** to `sample_pdfs/` directory
2. **Run quick test**: `python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf`
3. **Review results** - Check extraction accuracy
4. **Run full comparison**: `python test_baidu_ocr.py --compare`
5. **Analyze metrics** - Which method works best?
6. **Plan production rollout** with recommended method

## Support & Documentation

- **Quick Start**: See [QUICKSTART.md](QUICKSTART.md)
- **Full Documentation**: See [README.md](README.md)
- **Examples**: Run `python example_usage.py`
- **CLI Help**: `python test_baidu_ocr.py --help`

## References

Related Files in Production:
- Original Python reference: `backend/reference/sdg_lps_module.py`
- Production JS port: `backend/dist/services/fundParsers/sdgExtractor.js`
- OCR service: `backend/src/services/ocr/`

External Documentation:
- EasyOCR: https://github.com/JaidedAI/EasyOCR
- TrOCR: https://huggingface.co/microsoft/trocr-base-printed
- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR
