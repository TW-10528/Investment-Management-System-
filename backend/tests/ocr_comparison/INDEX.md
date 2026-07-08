# OCR Comparison Testing Suite - File Index

**Location**: `/home/twr/invfin/backend/tests/ocr_comparison/`

Complete OCR testing framework comparing Baidu OCR (EasyOCR/TrOCR) with production Paddle OCR for SDG Japanese PDF extraction.

---

## 📋 Quick Navigation

### Start Here
1. **[QUICKSTART.md](QUICKSTART.md)** (5 minutes) - Get up and running immediately
2. **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete installation & configuration
3. **[README.md](README.md)** - Full documentation with all details

### Code Files
- **[baidu_ocr_extractor.py](#baidu_ocr_extractorpy)** - Core OCR implementations
- **[baidu_sdg_extractor.py](#baidu_sdg_extractorpy)** - SDG field extraction logic
- **[test_baidu_ocr.py](#test_baidu_ocrpy)** - Test runner & comparisons
- **[example_usage.py](#example_usagepy)** - 6 practical code examples

### Configuration
- **[requirements.txt](#requirementtxt)** - Python dependencies
- **[.gitignore](#gitignore)** - Git ignore patterns

### Directories
- **[sample_pdfs/](#sample_pdfs)** - Place your test PDFs here
- **[output/](#output)** - Generated reports and results

---

## 📚 File Descriptions

### QUICKSTART.md
**5-minute quick start guide**
- Setup instructions (2 min)
- Adding test PDFs (1 min)
- Running tests (2 min)
- Common commands
- Troubleshooting

**When to read**: First time setup - gets you testing immediately

### SETUP_GUIDE.md
**Complete setup and operation guide**
- Detailed installation steps
- Directory structure explanation
- Test execution scenarios
- Understanding results
- Troubleshooting
- Performance tuning
- File descriptions

**When to read**: Need detailed information about configuration or troubleshooting

### README.md
**Comprehensive documentation**
- Project overview
- Installation with GPU setup
- Usage examples (CLI and Python API)
- OCR method comparison
- Hybrid extraction mode
- Output formats & benchmarks
- Performance metrics
- Accuracy evaluation
- Integration with production

**When to read**: Need full documentation or planning production rollout

### baidu_ocr_extractor.py
**Core OCR extraction module** (~400 lines)

**Provides**:
- `BaiduOCRExtractor` class with support for:
  - EasyOCR (Baidu-like, ~8-15s per page)
  - TrOCR (Transformer-based, ~15-30s per page)
  - PaddleOCR (Production baseline, ~3-8s per page)
- Page-by-page and full PDF extraction
- Text normalization and amount parsing
- Multi-method comparison utilities

**Classes**:
```python
class BaiduOCRExtractor:
    def __init__(method='easyocr')
    def extract_text_from_pdf_page(pdf_path, page_num)
    def extract_text_from_pdf(pdf_path)
    def compare_methods(pdf_path)
```

**Functions**:
- `normalize_text(text)` - Clean OCR output
- `clean_amount(value)` - Parse JPY amounts
- `extract_pdf_text_pdfplumber()` - Fast native text
- `extract_pdf_text_with_ocr()` - Baidu OCR
- `extract_pdf_text_hybrid()` - Both methods

**When to import**:
```python
from baidu_ocr_extractor import BaiduOCRExtractor
```

### baidu_sdg_extractor.py
**SDG-specific extraction logic** (~600 lines)

**Replicates** all functionality from production `sdg_lps_module.py` using Baidu OCR instead of Paddle.

**Main Function**:
```python
def extract_sdg_notice_with_baidu_ocr(
    pdf_path, 
    ocr_method='easyocr',
    use_hybrid=True
) -> Dict[str, Any]
```

**Returns**:
- Document type (capital_call or distribution)
- Extracted fields (dates, amounts, unfunded commitment)
- Excel column mappings
- Validation status (needs_review, missing_fields)

**Extracted Fields**:
- `transaction_date` - YYYY-MM-DD
- `capital_contribution_amount` - JPY
- `distribution_amount_received` - JPY
- `current_unfunded_commitment` - JPY before call
- `remaining_after_payment` - JPY after call

**When to use**:
- Testing SDG PDF extraction with different OCR methods
- Comparing field extraction accuracy
- Integration testing with production logic

### test_baidu_ocr.py
**Test runner and comparison framework** (~400 lines)

**Main Class**:
```python
class OCRComparator:
    def test_single_pdf(pdf_path, methods=['easyocr', 'paddle', 'trocr'])
    def compare_methods_for_pdf(pdf_path)
    def test_all_pdfs_in_directory(directory)
    def generate_report(results, output_file)
    def save_results_json(results, output_file)
```

**CLI Commands**:
```bash
# Single PDF
python test_baidu_ocr.py --pdf file.pdf

# Compare methods
python test_baidu_ocr.py --pdf file.pdf --compare

# Batch process
python test_baidu_ocr.py --dir ./sample_pdfs

# Save results
python test_baidu_ocr.py --json results.json --report report.txt
```

**Outputs**:
- Performance metrics (time, accuracy)
- Comparison tables
- Recommendations
- JSON and text reports

**When to use**:
- Running comprehensive OCR tests
- Comparing multiple PDF samples
- Generating reports for analysis
- Batch validation of extraction quality

### example_usage.py
**6 practical usage examples** (~400 lines)

**Examples**:
1. `example_1_simple_extraction()` - Extract text from PDF
2. `example_2_sdg_extraction()` - Extract SDG fields
3. `example_3_compare_methods()` - Compare OCR methods
4. `example_4_batch_process()` - Process directory
5. `example_5_custom_logic()` - Custom business logic
6. `example_6_save_results()` - Save to JSON

**Run all**:
```bash
python example_usage.py
```

**When to read**:
- Learning how to use modules in your own code
- Implementing custom extraction logic
- Integrating with production systems

### requirements.txt
**Python dependencies**

**OCR Methods**:
- `easyocr>=1.7.0` - Fast Baidu-like OCR
- `transformers>=4.35.0` - TrOCR models
- `torch>=2.0.0` - Deep learning backend
- `paddleocr>=2.7.0.3` - Production baseline
- `paddlepaddle>=2.5.0` - Paddle framework

**PDF & Image**:
- `pdfplumber>=0.10.0` - PDF text extraction
- `Pillow>=10.0.0` - Image processing

**Install**:
```bash
pip install -r requirements.txt
```

### .gitignore
**Git ignore patterns**

Excludes:
- Virtual environments
- Python cache (`__pycache__`, `.pyc`)
- Sample PDFs
- Generated output files
- OCR model caches
- IDE files
- Temporary files

---

## 📁 Directories

### sample_pdfs/
**Place your test SDG PDFs here**

Location: `backend/tests/ocr_comparison/sample_pdfs/`

Add files with naming format:
- `SDG_DDMMYY.pdf` (e.g., `SDG_290524.pdf`)
- Any filename works, but DDMMYY format enables auto-dating

Contents (initially):
- `.placeholder` - Ensures directory structure is preserved in git

### output/
**Generated reports and results**

Location: `backend/tests/ocr_comparison/output/`

Generated files (examples):
- `comparison_results.json` - Detailed JSON results
- `comparison_report.txt` - Human-readable report
- `extraction_result.json` - Single extraction result

---

## 🚀 Getting Started

### Path 1: Impatient (5 minutes)
1. Read **[QUICKSTART.md](QUICKSTART.md)**
2. Run: `pip install -r requirements.txt`
3. Run: `python test_baidu_ocr.py --pdf sample_pdfs/file.pdf`

### Path 2: Thorough (15 minutes)
1. Read **[SETUP_GUIDE.md](SETUP_GUIDE.md)**
2. Follow installation steps exactly
3. Run: `python test_baidu_ocr.py --pdf sample_pdfs/file.pdf --compare`

### Path 3: Complete (30 minutes)
1. Read **[README.md](README.md)** completely
2. Read **[SETUP_GUIDE.md](SETUP_GUIDE.md)**
3. Run `python example_usage.py` to see all capabilities
4. Run: `python test_baidu_ocr.py --dir ./sample_pdfs --json output/results.json`

---

## 🔧 Common Tasks

### Add a Test PDF
```bash
# Copy to sample_pdfs directory
cp ~/Downloads/SDG_290524.pdf sample_pdfs/

# Run test
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf
```

### Compare All OCR Methods
```bash
python test_baidu_ocr.py --pdf sample_pdfs/SDG_290524.pdf --compare
```

### Test All PDFs in Directory
```bash
python test_baidu_ocr.py --json output/results.json --report output/report.txt
```

### Use in Your Code
```python
from baidu_sdg_extractor import extract_sdg_notice_with_baidu_ocr

result = extract_sdg_notice_with_baidu_ocr("path/to/file.pdf")
print(result['excel_fields'])
```

### Check Extraction Quality
```bash
python test_baidu_ocr.py --pdf sample_pdfs/file.pdf --methods easyocr
# Look for: needs_review: false, missing_fields: []
```

---

## 📊 Quick Reference

### Extraction Methods

| Method | Speed | Accuracy | Memory | Best For |
|--------|-------|----------|--------|----------|
| pdfplumber | <1s | N/A | Low | Native text PDFs |
| EasyOCR | 8-15s | 85-95% | Med | Baidu comparison |
| TrOCR | 15-30s | 90%+ | Med | High precision |
| Paddle | 3-8s | 85-95% | High | Production baseline |

### Key Extracted Fields

| Field | Format | Example |
|-------|--------|---------|
| `transaction_date` | YYYY-MM-DD | 2024-05-29 |
| `capital_contribution_amount` | Float (JPY) | 363602836.0 |
| `distribution_amount_received` | Float (JPY) | 59527840.0 |
| `current_unfunded_commitment` | Float (JPY) | 1000000000.0 |
| `remaining_after_payment` | Float (JPY) | 636397164.0 |

### Success Criteria

✓ Document type correctly detected
✓ All amounts extracted exactly
✓ Dates in YYYY-MM-DD format
✓ `needs_review: false`
✓ `missing_fields: []`
✓ Processing time < 20 seconds

---

## 🔗 Related Files in Production

- **Original reference**: `backend/reference/sdg_lps_module.py`
- **Production JS port**: `backend/dist/services/fundParsers/sdgExtractor.js`
- **OCR services**: `backend/src/services/ocr/`

---

## ⚠️ Important Notes

1. **First Run**: Will download ~2-5 GB of OCR models
2. **GPU**: Significantly speeds up processing if available
3. **Test PDFs**: Add realistic SDG documents for accurate testing
4. **Validation**: Always verify extracted amounts match originals

---

## 🆘 Help & Support

| Issue | Solution |
|-------|----------|
| Missing dependencies | `pip install -r requirements.txt` |
| PDF not found | Check `sample_pdfs/` directory exists |
| Out of memory | Process one PDF at a time |
| Slow first run | Models downloading, normal behavior |
| Python import errors | Verify virtual environment activated |

---

## 📞 Next Steps

1. ✅ Read QUICKSTART.md
2. ✅ Install dependencies
3. ✅ Add test PDFs to sample_pdfs/
4. ✅ Run initial test
5. ✅ Review and analyze results
6. ✅ Run full comparison suite
7. ✅ Generate report for analysis

---

**Version**: 1.0
**Last Updated**: 2026-07-08
**Test Suite**: OCR Comparison Framework
**Status**: Ready for Testing
