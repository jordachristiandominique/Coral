# Upload Batch Page - Features & Workflow Guide

## Overview
The **Upload Batch Page** is where researchers upload underwater coral images and define analysis parameters. It's a multi-step form with interactive features like map selection and quadrat drawing.

---

## Page Layout

### 1. Header Navigation
- **Logo & Brand**: CoralSense branding with link back to dashboard
- **Search Bar**: Search functionality for the dashboard
- **Profile Menu**: 
  - Shows user's initials in avatar
  - Settings option
  - Logout option
  - Displays user's full name and role

### 2. Sidebar Navigation
Provides quick access to:
- **Overview** → Researcher Dashboard
- **Upload New Batch** → Current page (highlighted as active)
- **Batches** → View user's batches (admin sees dropdown with "My Batches" and "All Batches")
- **Analysis Results** → View analysis data
- **Map View** → Interactive map visualization
- **Reports** → View/generate reports
- **User Management** (Admin only) → Manage users and accept researchers

---

## Main Workflow: 3-Step Form

### **Step 1: Batch Information**
Collects metadata about the survey session.

#### Fields:
| Field | Type | Purpose |
|-------|------|---------|
| **Batch Name** | Text | Identifier for this upload batch |
| **Survey Date** | Date | When the survey was conducted (defaults to today) |
| **Area Name** | Text | Location/reef area name |
| **Surveyor Name(s)** | Textarea | Person(s) who conducted the survey (supports multiple names separated by commas) |
| **Latitude** | Number | Geographic latitude (default: 7.0731) |
| **Longitude** | Number | Geographic longitude (default: 125.6128) |

#### Special Features:
- **Auto-comma on Enter**: Press Enter in the Surveyor Names field to auto-add commas between names
- **Map Selection**: 
  - "Select on Map" button opens interactive Leaflet map
  - Click on map to place survey pin at exact coordinates
  - Coordinates auto-populate Latitude/Longitude fields
  - Displays survey location visually

---

### **Step 2: Image Upload**
Upload and classify coral images with precise area marking.

#### Image Upload Interface:
- **Drag & Drop Zone**: Drag image files directly or click to browse
- **File Requirements**: JPG, PNG formats | Max 10MB per file
- **Thumbnail Preview**: Shows all uploaded images with:
  - Filename
  - File size
  - Remove button (×) to delete individual files

#### Quadrat Selection (Coral Analysis Area):
The **Quadrat** is a defined rectangular area within the image used for coral analysis.

**How it works:**
1. **Draw the Quadrat**: 
   - Click and drag on the image to create a rectangle around the coral area
   - 10 random points are automatically generated inside the quadrat

2. **Adjust the Quadrat**:
   - Drag corners to resize the box
   - Drag inside the box to move it
   - Points adjust automatically with box movement

3. **Classify Points**:
   - Each of the 10 points needs a classification (coral type, rock, sand, etc.)
   - "Point Classes" panel shows progress: "0/10 classified"
   - User assigns a class to each point (dropdown or selection)

#### Analysis Flow:
- **"Analyze All Images" Button**: 
  - Disabled until at least one image has a complete quadrat
  - Clicking triggers automated analysis on all selected images
  - Shows confirmation modal if re-analyzing (warns about overwriting previous classifications)

---

### **Step 3: Review & Submit**
Final review before uploading batch.

#### Summary Box Shows:
- **Batch**: Name of the batch
- **Surveyors**: Names of surveyors
- **Location**: Coordinates and area name
- **Images**: Total number of files selected

#### Submission:
- **Cancel Button**: Return to dashboard without saving
- **Upload Button**: 
  - Sends batch data to server
  - Triggers processing modal showing progress
  - Each image analysis shows percentage complete and class

---

## Interactive Modals (Pop-up Windows)

### 1. **Logout Modal**
- Triggered when user clicks logout in profile menu
- Confirms user wants to end session
- Options: Cancel or Log out

### 2. **Process Modal**
- Shows after clicking "Upload"
- Displays real-time progress:
  - Progress bar with percentage
  - List of images being processed
  - Class percentages for each image (e.g., "58.3% Class B")
  - Status indicators (dots) showing completion
- **"View Results"** button to navigate to analysis results

### 3. **Analyze Modal**
- Shows during image analysis phase
- Displays:
  - Current status message (e.g., "Preparing analysis...")
  - Progress bar with percentage
  - Progress counter (e.g., "0/4")
  - List of images being analyzed
- **"Done"** button enabled when analysis completes

### 4. **Analyze Confirm Modal**
- Appears when "Analyze All Images" clicked on previously analyzed images
- Warning: "This will overwrite any point classes you already edited"
- Options: Cancel or Yes, re-analyze

---

## Data Flow Summary

```
1. Enter Batch Info (name, date, location, surveyor)
   ↓
2. Select location on map (optional)
   ↓
3. Upload image files (JPG/PNG)
   ↓
4. Draw quadrat box on each image
   ↓
5. Classify 10 random points in quadrat
   ↓
6. Optionally: Analyze all images for automated classification
   ↓
7. Review batch summary
   ↓
8. Click Upload → Process modal shows real-time progress
   ↓
9. Batch saved to server with analysis results
```

---

## Technical Details

### Form Submission:
- **Method**: POST with multipart/form-data (supports file upload)
- **CSRF Protection**: Django {% csrf_token %} included
- **File Handling**: Images stored in `/media/batch_images/`
- **Supported File Types**: .jpg, .jpeg, .png

### Interactive Libraries:
- **Leaflet.js**: Interactive map for location selection
- **Lucide Icons**: SVG icons throughout the page
- **Custom JavaScript**: 
  - `upload_batch.js` - Main form logic and image handling
  - `custom.js` - Shared utilities

### Accessibility Features:
- ARIA labels for screen readers
- Semantic HTML (role="dialog", aria-hidden, etc.)
- Keyboard navigation support
- Descriptive button labels

---

## Key Features Summary

✅ **Multi-step wizard** for organized data collection  
✅ **Interactive map** for precise location marking  
✅ **Image preview** with file management  
✅ **Quadrat drawing tool** for defining analysis area  
✅ **Point classification** with progress tracking  
✅ **Real-time progress** during upload/analysis  
✅ **Admin-specific options** for user management  
✅ **Responsive design** with professional styling  
✅ **Accessibility** compliant with ARIA standards  
