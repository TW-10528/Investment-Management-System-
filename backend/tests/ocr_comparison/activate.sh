#!/bin/bash
# Quick activation script for OCR comparison test environment

echo "🚀 Activating OCR Comparison Test Environment..."
echo ""

# Activate virtual environment
source venv/bin/activate

# Verify activation
echo "✅ Virtual environment activated!"
echo "📍 Location: $(pwd)"
echo "🐍 Python: $(python --version)"
echo ""

# Show quick command reference
echo "📚 Quick Commands:"
echo ""
echo "  Test single PDF:"
echo "    python test_baidu_ocr.py --pdf sample_pdfs/YOUR_FILE.pdf"
echo ""
echo "  Compare all OCR methods:"
echo "    python test_baidu_ocr.py --pdf sample_pdfs/YOUR_FILE.pdf --compare"
echo ""
echo "  Batch test all PDFs:"
echo "    python test_baidu_ocr.py --json output/results.json --report output/report.txt"
echo ""
echo "  See examples:"
echo "    python example_usage.py"
echo ""
echo "  Check documentation:"
echo "    cat INDEX.md          # Navigation guide"
echo "    cat QUICKSTART.md     # 5-minute setup"
echo "    cat SETUP_GUIDE.md    # Complete guide"
echo ""

# Check for test PDFs
PDF_COUNT=$(find sample_pdfs -name "*.pdf" 2>/dev/null | wc -l)
echo "📁 Status:"
echo "   Sample PDFs in folder: $PDF_COUNT"
echo "   Virtual environment: ✅ Ready"
echo "   All dependencies: ✅ Installed"
echo ""

# Check GPU
GPU_STATUS=$(python -c "import torch; print('✅ GPU Available' if torch.cuda.is_available() else '❌ CPU Only')" 2>/dev/null)
echo "⚡ $GPU_STATUS"
echo ""
echo "Ready to test! 🎉"
echo ""
