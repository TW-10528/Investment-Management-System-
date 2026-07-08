# Baidu OCR API Setup Guide

Complete guide for using real Baidu OCR API to test SDG PDF extraction.

---

## 🔐 Prerequisites

### 1. Baidu Cloud Account
- Create account: https://cloud.baidu.com
- Sign up for Baidu OCR service

### 2. Get API Credentials
1. Log in to Baidu Cloud Console
2. Go to: Products → AI Services → OCR
3. Create a new application
4. Copy these credentials:
   - **APP_ID**: Application ID
   - **API_KEY**: API Key
   - **SECRET_KEY**: Secret Key

Example credentials format:
```
APP_ID:      123456789
API_KEY:     1a2b3c4d5e6f7g8h
SECRET_KEY:  a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

---

## 📝 Configuration Methods

### Method 1: Environment Variables (Recommended)
Set these environment variables:
```bash
export BAIDU_APP_ID="your_app_id"
export BAIDU_API_KEY="your_api_key"
export BAIDU_SECRET_KEY="your_secret_key"
```

Then run:
```bash
source venv/bin/activate
python baidu_ocr_api.py sample_pdfs/YOUR_PDF.pdf
```

### Method 2: Config File
Create `baidu_config.json`:
```json
{
  "app_id": "your_app_id",
  "api_key": "your_api_key",
  "secret_key": "your_secret_key"
}
```

Then run:
```bash
python baidu_ocr_api.py sample_pdfs/YOUR_PDF.pdf --config baidu_config.json
```

### Method 3: Command Line Arguments
```bash
python baidu_ocr_api.py sample_pdfs/YOUR_PDF.pdf \
  --app-id "your_app_id" \
  --api-key "your_api_key" \
  --secret-key "your_secret_key"
```

---

## 🧪 Testing Baidu OCR

### Quick Test (with existing credentials)
```bash
source venv/bin/activate

# Set environment variables
export BAIDU_APP_ID="your_app_id"
export BAIDU_API_KEY="your_api_key"
export BAIDU_SECRET_KEY="your_secret_key"

# Run test
python baidu_ocr_api.py sample_pdfs/SDG_201223.pdf
```

### Test with Config File
```bash
python baidu_ocr_api.py sample_pdfs/SDG_201223.pdf --config baidu_config.json
```

### Use Basic Endpoint (Free Tier)
```bash
python baidu_ocr_api.py sample_pdfs/SDG_201223.pdf --basic
```

---

## 📊 Expected Output

```
✅ Baidu OCR API initialized
   Endpoint: general

Processing page 1/2...
Processing page 2/2...

================================================================================
RESULTS:
================================================================================
Status: success
Pages processed: 2
Extraction time: 2.34s
Total text length: 5234 chars

Extracted text (first 1000 chars):
────────────────────────────────────────────────────────────────────────────────
アストマックス・ファンド・マネジメント株式会社

2022年10月27日

SDGs投資事業有限責任組合

... (more text)
```

---

## 🔄 Baidu OCR Endpoints

### General Basic (Free Tier)
- **Endpoint**: `basicGeneral()`
- **Price**: Free
- **Accuracy**: Good for general documents
- **Speed**: Standard
- **Use**: Testing, low-volume processing

```python
client.basicGeneral(image_base64)
```

### General (Standard)
- **Endpoint**: `general()`
- **Price**: Paid per request (¥0.01-0.015/request)
- **Accuracy**: Better (optimized)
- **Speed**: Fast
- **Use**: Production, high-accuracy needs

```python
client.general(image_base64)
```

---

## 💰 Pricing

Baidu OCR API pricing (approximate):
- **General Basic**: Free (1 QPS limit)
- **General**: ¥0.01-0.015 per request
- **Volume discounts**: Available for 10K+ requests/month

For testing: Use **basic** endpoint (free)
For production: Use **general** endpoint (paid, higher accuracy)

---

## 📈 Comparison: EasyOCR vs Baidu OCR

| Feature | EasyOCR | Baidu OCR |
|---------|---------|-----------|
| **Type** | Open-source | Cloud API |
| **Cost** | Free | Paid per request |
| **Accuracy** | Good (85-95%) | Excellent (95%+) |
| **Speed** | 9-15s/page | 0.5-2s/page |
| **Setup** | Simple (local) | Requires credentials |
| **Offline** | ✅ Yes | ❌ No (API required) |
| **Best For** | Local testing | Production use |

---

## 🆘 Troubleshooting

### "Baidu credentials not found!"
**Solution**: Set environment variables or use config file
```bash
export BAIDU_APP_ID="your_app_id"
export BAIDU_API_KEY="your_api_key"
export BAIDU_SECRET_KEY="your_secret_key"
```

### "Invalid APP_ID or API_KEY"
**Solution**: Check credentials in Baidu Cloud console
- Ensure they're correctly copied
- Check for extra spaces or special characters
- Verify application is active

### "Exceeded rate limit"
**Solution**: Use `--basic` flag or add delay between requests
```bash
python baidu_ocr_api.py file.pdf --basic
```

### "Permission denied" or "Unauthorized"
**Solution**: Check if OCR service is enabled for your app
1. Log in to Baidu Cloud Console
2. Go to: Products → OCR
3. Ensure service is activated

### "Network timeout"
**Solution**: Check internet connection and retry
```bash
# Retry with timeout
python baidu_ocr_api.py file.pdf --config baidu_config.json
```

---

## 🔒 Security Best Practices

### ✅ DO
- Store credentials in environment variables
- Use config file with restricted permissions
- Rotate credentials regularly
- Use basic endpoint for testing only

### ❌ DON'T
- Hardcode credentials in source code
- Commit credentials to git
- Share credentials with unauthorized users
- Use production credentials for testing

### Secure Setup
```bash
# Create secure config file
echo '{
  "app_id": "your_app_id",
  "api_key": "your_api_key",
  "secret_key": "your_secret_key"
}' > baidu_config.json

# Restrict permissions
chmod 600 baidu_config.json

# Add to .gitignore
echo "baidu_config.json" >> .gitignore
```

---

## 📚 Integration Example

### Python Code Example
```python
from baidu_ocr_api import BaiduOCRAPI

# Load credentials
credentials = BaiduOCRAPI.load_credentials_from_file("baidu_config.json")

# Initialize
ocr = BaiduOCRAPI(
    app_id=credentials["app_id"],
    api_key=credentials["api_key"],
    secret_key=credentials["secret_key"],
    use_general_basic=True  # Free tier
)

# Extract
result = ocr.extract_text_from_pdf("sample_pdfs/SDG_201223.pdf")

# Use results
print(f"Extracted {result['total_text'][:100]}...")
```

---

## 📊 Monitoring API Usage

### Check Request Quota
1. Log in to Baidu Cloud Console
2. Go to: Overview → Resource Usage
3. View:
   - Daily requests
   - Remaining quota
   - Cost breakdown

### Track Requests
```bash
# Each API call logs:
# - Timestamp
# - Pages processed
# - Characters extracted
# - Extraction time
# - Cost (if applicable)
```

---

## 🚀 Next Steps

1. **Create Baidu Cloud Account** (if not already done)
2. **Get OCR API Credentials**
3. **Set environment variables** or create config file
4. **Run test**: `python baidu_ocr_api.py sample_pdfs/SDG_201223.pdf`
5. **Compare results** with EasyOCR
6. **Analyze accuracy** and performance

---

## 📞 Support

- **Baidu Cloud Console**: https://cloud.baidu.com
- **OCR Documentation**: https://ai.baidu.com/ai-doc/OCR
- **API Reference**: https://ai.baidu.com/ai-doc/OCR/qkuy2ajbt

---

## ✅ Quick Checklist

- [ ] Create Baidu Cloud account
- [ ] Get OCR API credentials
- [ ] Set environment variables OR create config file
- [ ] Test with: `python baidu_ocr_api.py sample_pdfs/YOUR_PDF.pdf`
- [ ] Review extraction results
- [ ] Compare with EasyOCR results
- [ ] Document findings

---

**Ready to test with Baidu OCR!** 🚀
