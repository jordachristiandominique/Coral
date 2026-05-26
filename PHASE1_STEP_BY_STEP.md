# PHASE 1: IMAGE ORGANIZATION & INSPECTION
## Complete Step-by-Step Guide

---

## **STEP 1: Set Up Project Folders (5 minutes)**

### 1.1 Open PowerShell Terminal

Go to: `Start Menu` → Search `PowerShell` → Right-click → `Run as Administrator`

### 1.2 Navigate to Your Project

```powershell
cd "c:\Users\Lenovo\Documents\Capstone Project\corals"
```

### 1.3 Run Setup Script

```powershell
python setup_coral_ml.py
```

**Expected Output:**
```
======================================================================
CORAL ML TRAINING - FOLDER SETUP
======================================================================

✓ Created: coral_ml_training/raw_images
✓ Created: coral_ml_training/processed_images/train
✓ Created: coral_ml_training/processed_images/val
✓ Created: coral_ml_training/processed_images/test
✓ Created: coral_ml_training/annotations/train
✓ Created: coral_ml_training/annotations/val
✓ Created: coral_ml_training/annotations/test
✓ Created: coral_ml_training/logs
✓ Created: coral_ml_training/models
✓ Created: coral_ml_training/README.md
✓ Created: coral_ml_training/ANNOTATION_GUIDE.md
✓ Created: coral_ml_training/dataset.yaml

======================================================================
✅ SETUP COMPLETE!
======================================================================
```

### 1.4 Verify Folders Created

```powershell
dir coral_ml_training
```

You should see:
```
Mode                 Name
----                 ----
d-----          annotations
d-----          logs
d-----          models
d-----          processed_images
d-----          raw_images
-a----          ANNOTATION_GUIDE.md
-a----          README.md
-a----          dataset.yaml
```

✅ **If you see all these folders, STEP 1 is complete!**

---

## **STEP 2: Copy Your Sample Images (10 minutes)**

### 2.1 Locate Your Sample Images

Where are your sample images currently stored?
- [ ] Desktop
- [ ] Downloads folder
- [ ] USB drive
- [ ] Google Drive
- [ ] Other: _______________

### 2.2 Copy Images to raw_images Folder

**Option A: Using File Explorer (Easiest)**

1. Open File Explorer
2. Navigate to: `C:\Users\Lenovo\Documents\Capstone Project\corals\coral_ml_training\raw_images`
3. Copy your sample images here
4. Paste them (Ctrl+V)

**Option B: Using PowerShell**

```powershell
# If images are in Downloads:
copy "C:\Users\Lenovo\Downloads\coral_images\*" `
     "coral_ml_training\raw_images" -Recurse

# Or if images are in a specific folder:
copy "D:\YourImageFolder\*" `
     "coral_ml_training\raw_images" -Recurse
```

### 2.3 Verify Images Copied

```powershell
dir coral_ml_training\raw_images | Measure-Object
```

This shows how many files are in the folder.

**Expected Output:**
```
Count    : 120
```

✅ **If you see image files in the folder, STEP 2 is complete!**

---

## **STEP 3: Run Image Inspection (2 minutes)**

### 3.1 Run Inspection Script

```powershell
python inspect_images.py
```

### 3.2 Script Execution

The script will:
1. Find all image files ✓
2. Validate each image ✓
3. Collect statistics ✓
4. Create report ✓
5. Generate sample visualization ✓

**This takes 1-2 minutes for 100+ images**

### 3.3 Expected Output

```
======================================================================
CORAL DATASET IMAGE INSPECTION
======================================================================

Scanning folder: coral_ml_training\raw_images

Found 120 images

Inspecting images...
  [1/120] ✓ coral_001.jpg
  [2/120] ✓ coral_002.jpg
  [3/120] ✓ coral_003.jpg
  ...
  [120/120] ✓ coral_120.jpg

======================================================================
INSPECTION SUMMARY
======================================================================

📊 IMAGE COUNT
  Total:    120
  Valid:    118 ✓
  Invalid:  2 ❌

📋 FORMAT DISTRIBUTION
  JPEG     105 images (89.0%)
  PNG      13 images (11.0%)

📐 SIZE DISTRIBUTION
  3264x2448   45 images (38.1%)
  2560x1920   42 images (35.6%)
  1920x1080   31 images (26.3%)

📏 SIZE STATISTICS
  Min pixels: 1920x1080 (2,073,600)
  Max pixels: 3264x2448 (7,990,272)
  Avg pixels: 2880x2160 (6,220,800)

💾 FILE SIZE STATISTICS
  Min: 0.85 MB
  Max: 5.23 MB
  Avg: 2.14 MB
  Total: 253.56 MB

✅ READINESS CHECK
  ✓ Sufficient images (118)
  ✓ Low invalid rate (1.7%)
  ✓ Good image quality (0.0% with issues)

🚀 READY FOR ANNOTATION!

📄 Report saved: coral_ml_training/logs/inspection_report.json
📷 Sample images saved: coral_ml_training/logs/sample_images.png
```

✅ **If you see "READY FOR ANNOTATION!" then STEP 3 is complete!**

---

## **STEP 4: Review Detailed Report (5 minutes)**

### 4.1 Open Inspection Report

Navigate to: `coral_ml_training/logs/`

You should see:
- `inspection_report.json` - Detailed metrics
- `sample_images.png` - Visual preview of your images

### 4.2 Review JSON Report

**Option A: View in VS Code**
1. Right-click `inspection_report.json`
2. Select "Open with Code"
3. Review the data

**Option B: Pretty Print in PowerShell**

```powershell
Get-Content "coral_ml_training/logs/inspection_report.json" | 
  ConvertFrom-Json | 
  ConvertTo-Json -Depth 10
```

### 4.3 Check Sample Images

**Option A: View in VS Code**
1. Open `coral_ml_training/logs/sample_images.png`
2. Right-click → "Open With" → "Default Photo App"

**Option B: Check in File Explorer**
1. Navigate to `coral_ml_training/logs/`
2. Double-click `sample_images.png`
3. Verify images are visible and clear

✅ **If images look clear and detailed, STEP 4 is complete!**

---

## **STEP 5: Analyze Results (5 minutes)**

### 5.1 Check for Issues

Open the inspection report and look for:

#### ✅ **GOOD SIGNS:**
- [ ] All images are valid (0 invalid)
- [ ] All images are 1920+ pixels wide
- [ ] All images are JPEG or PNG format
- [ ] No quality issues reported
- [ ] Total images >= 100

#### ⚠️ **WARNINGS:**
- [ ] Invalid images: Remove these manually
- [ ] Small images (< 1920px): May need to discard
- [ ] File too large (> 10MB): Compress with Roboflow
- [ ] Blank/low contrast: Mark for manual review

#### ❌ **BLOCKERS:**
- [ ] Less than 50 valid images: Need more data
- [ ] > 20% invalid images: Data quality issue
- [ ] Unreadable/blurry images: Cannot annotate

### 5.2 If Issues Found

**For Invalid Images:**
```powershell
# Delete invalid images manually
# Check the report for which ones failed
# Delete from coral_ml_training/raw_images/
```

**For Small Images:**
```powershell
# You can keep them (Roboflow will resize during augmentation)
# But flag them in your report
```

**For Low Quality:**
```powershell
# Review the problematic images
# Discard those that are unusable
# Keep only clear, coral-visible images
```

### 5.3 Document Your Findings

Create: `coral_ml_training/logs/INSPECTION_NOTES.txt`

```
INSPECTION RESULTS - [DATE]
==========================

Total Images Received: 120
Valid Images: 118
Invalid Images: 2

Image Formats:
- JPEG: 105 images
- PNG: 13 images

Resolution:
- Min: 1920x1080
- Max: 3264x2448
- Avg: 2880x2160

Quality Assessment:
- Clear & Detailed: 110 images (93%)
- Acceptable: 8 images (7%)
- Poor Quality: 0 images

Overall Assessment:
✅ DATASET READY FOR ANNOTATION

Next Step: Upload to Roboflow
```

✅ **If you can answer all questions above, STEP 5 is complete!**

---

## **STEP 6: Readiness Checklist (Completion)**

### Final Checklist

Before moving to Phase 2 (Annotation), verify:

**Image Organization:**
- [x] Folder structure created
- [x] Images copied to raw_images/
- [x] No invalid images
- [x] All images are readable

**Inspection Report:**
- [x] Report generated (inspection_report.json)
- [x] Sample images visualized (sample_images.png)
- [x] All metrics documented
- [x] Issues identified (if any)

**Quality Assurance:**
- [x] >= 100 valid images collected
- [x] Images are clear and detailed
- [x] Coral/seabed features visible
- [x] No major quality issues

**Documentation:**
- [x] Inspection notes written
- [x] Issues documented
- [x] Ready for annotation confirmed

### If All Checkboxes Checked ✅

You are **READY FOR PHASE 2: IMAGE ANNOTATION**

---

## **Troubleshooting**

### Problem: "No images found in folder"

**Solution:**
1. Verify images are in: `coral_ml_training/raw_images/`
2. Check file extensions are: `.jpg`, `.jpeg`, `.png`
3. Copy images again if needed

### Problem: "Permission denied" error

**Solution:**
1. Close any image viewer/editor windows
2. Run PowerShell as Administrator
3. Try again

### Problem: "Script not found"

**Solution:**
```powershell
# Make sure you're in the right directory
pwd  # Should show: C:\Users\Lenovo\Documents\Capstone Project\corals

# Check if script exists
ls inspect_images.py  # Should show the file
```

### Problem: Images too small or blurry

**Solution:**
1. Discard images < 1920x1080 pixels (optional)
2. Remove very blurry images manually
3. Keep only clear, detailed images
4. Proceed if you have >= 50 valid images

---

## **Next: Phase 2 - Image Annotation**

Once PHASE 1 is complete, proceed to:

**PHASE 2: IMAGE ANNOTATION (Google Colab/Roboflow)**

You will:
1. Create Roboflow account
2. Upload processed images
3. Annotate with bounding boxes + class labels
4. Generate YOLO format dataset
5. Download prepared dataset

**Estimated time: 4-6 hours (mostly annotation work)**

---

## **Summary**

### What You've Done:
✅ Set up ML training folder structure
✅ Copied and organized sample images  
✅ Inspected and validated images
✅ Generated detailed inspection report
✅ Verified dataset quality
✅ Documented findings

### Outcomes:
📊 Know exactly how many valid images you have
📐 Understand image dimensions and formats
💾 Have backup inspection report
📷 Visual verification of sample images

### Ready For:
→ Phase 2: Annotation
→ Algorithm comparison training
→ Model deployment

---

## **Estimated Timeline**

- Phase 1 (Inspection): **30 minutes** ✅ (This section)
- Phase 2 (Annotation): **4-6 hours** 
- Phase 3 (Preparation): **1-2 hours**
- Phase 4 (Training): **8-12 hours** (parallel on Colab)
- Phase 5 (Comparison): **2-3 hours**

**Total: ~2-3 weeks** to complete algorithm comparison

---

**Questions? Need help? I'm ready to guide you through Phase 2 next!**
