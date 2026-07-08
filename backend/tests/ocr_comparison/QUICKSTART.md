# Quick Start Guide

Get up and running with the OCR comparison tests in 5 minutes.

## Step 1: Setup (2 minutes)

```bash
cd backend/tests/ocr_comparison

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Step 2: Add Test PDFs (1 minute)

Create the `sample_pdfs` directory and place your test SDG PDFs:

```bash
mkdir -p sample_pdfs
# Copy your SDG PDFs here (e.g., SDG_290524.pdf)
```

Filename format recommendations:
- `SDG_DDMMYY.pdf` (e.g., `SDG_290524.pdf` for 2024-05-29)
- Any PDF name works, but dated format helps with date extraction

## Step 3: Run Tests (2 minutes)

### Test Single PDF with All Methods:
```bash
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf --compare
```

### Test All PDFs in Directory:
```bash
python test_baidu_ocr.py --json output/results.json
```

### Quick Test with Specific Method:
```bash
python baidu_sdg_extractor.py sample_pdfs/SDG_290524.pdf --method easyocr
```

## Expected Output

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

## Common Commands

```bash
# Test single PDF with EasyOCR
python baidu_sdg_extractor.py sample_pdfs/SDG_290524.pdf

# Compare all methods for single PDF
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf --compare

# Test all PDFs and save results
python test_baidu_ocr.py --json results.json --report report.txt

# Test specific methods only
python test_baidu_ocr.py --methods easyocr,paddle

# Use TrOCR instead
python baidu_sdg_extractor.py sample_pdfs/SDG_290524.pdf --method trocr
```

## Interpreting Results

### Key Fields Extracted:
- `transaction_date`: When the transaction occurred
- `capital_contribution_amount`: JPY amount to contribute
- `distribution_amount_received`: JPY distribution amount
- `current_unfunded_commitment`: Unfunded commitment before call
- `remaining_after_payment`: Unfunded commitment after call

### Success Indicators:
✓ `status: success` - PDF was processed
✓ `missing_fields: []` - All critical fields extracted
✓ Small `elapsed_seconds` - Fast processing

### Review Needed If:
⚠ `needs_review: true` - Manual verification recommended
⚠ `missing_fields: [...]` - Some fields couldn't be extracted
⚠ `text_preview` shows garbled text - OCR quality issues

## Troubleshooting

### "Module not found" errors
```bash
# Ensure all dependencies installed
pip install -r requirements.txt
```

### Slow performance on first run
- First run downloads OCR models (~2-5 GB total)
- Subsequent runs are much faster
- Can take 5-10 minutes on first execution

### No PDFs found in directory
```bash
# Check sample_pdfs folder exists
ls -la sample_pdfs/

# Create if missing
mkdir -p sample_pdfs
```

### OutOfMemory errors
- Process one PDF at a time
- Reduce number of OCR methods tested
- Enable GPU if available

## Next Steps

1. **Add more test PDFs** to improve confidence
2. **Review extraction accuracy** against originals
3. **Check performance** meets production requirements
4. **Compare results** between methods
5. **Plan rollout** of best-performing method

See [README.md](README.md) for detailed documentation and advanced usage.
