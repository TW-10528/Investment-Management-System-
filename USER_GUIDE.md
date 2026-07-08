# Investment Management System - User Guide

A comprehensive guide for non-technical users to navigate and use the Investment Management System.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Dashboard Overview](#dashboard-overview)
- [Managing Funds](#managing-funds)
- [Uploading Documents](#uploading-documents)
- [Understanding Reports](#understanding-reports)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

Welcome to the Investment Management System. This guide will help you navigate the system step by step, even if you've never used similar software before.

### Logging In

To access the system, you'll need your login credentials (username and password).

1. Open the system in your web browser by entering the address provided to you
2. Enter your **username** (usually your email address)
3. Enter your **password**
4. Click the **"Login"** button

> **💡 Tip:** If you forget your password, ask your administrator for help to reset it.

### Understanding the Main Menu

Once logged in, you'll see the main navigation menu on the left side of the screen. Here's what each section does:

| Menu Item | What It Does |
|-----------|-------------|
| **Dashboard** | Shows an overview of all your funds and key information at a glance |
| **Funds** | View and manage all investment funds in the system |
| **Reports** | View documents and reports related to your funds |
| **FX Rates** | Check currency exchange rates for currency conversions |
| **Alerts & Notifications** | View important messages and alerts about your funds |
| **Users** | Manage team members and their access (admin only) |
| **Settings** | Adjust system preferences and your account settings |

---

## Dashboard Overview

The Dashboard is your starting point when you log in. It provides a quick summary of all your investment funds and important metrics.

### What You'll See

1. **Key Metrics at the Top** — Shows total commitment, amount invested, and other important numbers
2. **List of All Funds** — Each fund is shown with its key information (name, type, status)
3. **Recent Activity** — Shows the latest documents uploaded or changes made

### Fund Status Colors

Each fund shows a status that helps you quickly understand its condition:

| Status Color | Meaning |
|-------------|---------|
| **Green** | Fund is active and working normally |
| **Yellow/Orange** | Fund needs your attention (missing documents, pending items) |
| **Gray** | Fund is inactive or archived |

---

## Managing Funds

A "fund" is an investment vehicle. In this section, you'll learn how to view, create, and manage funds.

### Viewing a Fund

1. Click **"Funds"** in the left menu
2. You'll see a list of all funds. Click on any fund name to view its details
3. You'll now see the fund's detailed page with information like:
   - Total committed amount
   - Amount paid in
   - Remaining unfunded commitment
   - All documents related to this fund

### Understanding Fund Information

Each fund has several important pieces of information. Here's what they mean:

| Term | What It Means |
|------|---------------|
| **Total Commitment** | The total amount you promised to invest in this fund |
| **Paid In (E)** | The amount of money you have actually paid to the fund so far |
| **Unfunded (F)** | The amount still remaining that you might need to pay in the future |
| **Dry Power** | Cash that's available in the fund to invest (not yet deployed) |
| **DPI** | Distribution to Paid-In ratio — shows how much profit you've made |

> **⚠️ Important:** Always review your unfunded commitment — this is money you may be required to pay in the future.

---

## Uploading Documents

Documents are how you provide important information to the system. This might include capital call notices, distribution statements, or other fund documents.

### How to Upload a Document

1. Navigate to the fund where you want to upload a document
2. Scroll down to the **"Documents / Reports"** section
3. Click the **"Upload Document"** button
4. Select the PDF file from your computer by clicking the upload area
5. The system will automatically read the document and extract key information
6. Review the extracted information and click **"Save"** to complete the upload

> **💡 Tip:** The system can read both regular PDFs and scanned documents (images). Make sure your document is clear and readable for the best results.

### Types of Documents

Documents are organized into different types based on what they contain:

| Document Type | Description |
|---------------|-------------|
| **Capital Call** | Request to pay additional money into the fund |
| **Distribution** | Statement showing money you're receiving from the fund |
| **Capital & Distribution** | Document that includes both capital call and distribution information |
| **Viewing Documents** | Other informational documents (reports, statements, notices) |

---

## Understanding Reports

Reports show detailed information about your fund's performance and the documents you've uploaded.

### Viewing Fund Reports

1. Go to a specific fund by clicking **"Funds"** → select a fund name
2. Click on the **"Documents / Reports"** tab
3. You'll see two sections:
   - **Files** — Transaction documents (Capital Calls, Distributions)
   - **Viewing Documents** — Other informational documents

### Understanding Document Information

Each document shows the following information:

| Column | What It Shows |
|--------|---------------|
| **File** | The name of the document |
| **Type** | What kind of document it is (Capital Call, Distribution, etc.) |
| **Notice Date** | When the document was issued |
| **Due Date** | When action is required (if applicable) |
| **Amount** | The money involved (capital to pay or distribution to receive) |
| **Confidence** | How confident the system is in the extracted data |

> **💡 Tip:** Click **"View"** next to any document to see the original PDF or get more details.

---

## Common Tasks

Here are step-by-step guides for the most common things you'll do in the system.

### Task: Upload a Capital Call Notice

1. Click **"Funds"** in the left menu and select the fund
2. Scroll to **"Documents / Reports"** section
3. Click **"Upload Document"** button
4. Select your Capital Call PDF file
5. The system will automatically detect it's a Capital Call and extract the amount due
6. Review the information and click **"Save"**

### Task: Check How Much You Owe

1. Click **"Funds"** and select your fund
2. Look at the top of the page where it says **"Unfunded (F)"**
3. This number is the amount you may still need to pay into the fund

### Task: Find When a Document Was Issued

1. Go to the fund and click **"Documents / Reports"**
2. Look in the **"Notice Date"** column to see when each document was issued
3. Documents are sorted with the oldest first

---

## Troubleshooting

Having trouble? Here are solutions to common problems.

### I Can't Log In

**Solution:** Check that you're entering your username and password correctly. If you still can't log in, contact your administrator to reset your password.

### My Document Didn't Upload Properly

**Check:** Make sure your file is a PDF and is under 100 MB. Try uploading again. If the problem continues, the document might be corrupt — try scanning or exporting it again.

### The System Extracted the Wrong Information

**Solution:** The system sometimes makes mistakes, especially with scanned documents. You can manually correct the information by editing the document details after upload. Look for an **"Edit"** button next to the document.

### I See a "Confidence: Low" Warning

**What it means:** The system is less certain about the information it extracted. Review the details carefully and correct any errors if needed.

### I Can't Find a Document

**Solution:** Go to the fund, click **"Documents / Reports"**, and look in both the **"Files"** and **"Viewing Documents"** sections. Documents are sorted by date — the oldest appears first. Try scrolling down to find older documents.

### Still Need Help?

Contact your system administrator or support team. They can help with issues this manual doesn't cover.

---

## Version Information

- **Version:** 1.0
- **Last Updated:** July 2026
- **System:** Investment Management System
- **Audience:** Non-technical users

---

For the interactive version of this guide, visit: **http://localhost:5176/user-manual.html**
