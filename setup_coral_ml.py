#!/usr/bin/env python3
"""
Coral ML Training - Project Setup Script
Creates folder structure for dataset organization
"""

import os
from pathlib import Path

def setup_folders():
    """Create all necessary folders"""
    
    folders = [
        'coral_ml_training/raw_images',
        'coral_ml_training/processed_images/train',
        'coral_ml_training/processed_images/val',
        'coral_ml_training/processed_images/test',
        'coral_ml_training/annotations/train',
        'coral_ml_training/annotations/val',
        'coral_ml_training/annotations/test',
        'coral_ml_training/logs',
        'coral_ml_training/models',
    ]
    
    print("="*70)
    print("CORAL ML TRAINING - FOLDER SETUP")
    print("="*70)
    print()
    
    for folder in folders:
        Path(folder).mkdir(parents=True, exist_ok=True)
        print(f"✓ Created: {folder}")
    
    # Create README files
    readme_content = """# Coral ML Training Dataset

This folder contains the coral detection training dataset.

## Structure

- **raw_images/** - Original sample images from advisor
- **processed_images/** - Organized images split into train/val/test
- **annotations/** - Image annotations in YOLO format
- **logs/** - Inspection reports and logs
- **models/** - Trained model weights

## Workflow

1. Place sample images in: raw_images/
2. Run: python inspect_images.py
3. Review report: coral_ml_training/logs/inspection_report.json
4. Upload to Roboflow for annotation
5. Download annotated dataset
6. Prepare for training

## Status

[ ] Step 1: Image Organization (IN PROGRESS)
[ ] Step 2: Image Annotation
[ ] Step 3: Dataset Preparation
[ ] Step 4: Model Training
"""
    
    readme_path = 'coral_ml_training/README.md'
    with open(readme_path, 'w') as f:
        f.write(readme_content)
    print(f"\n✓ Created: {readme_path}")
    
    # Create annotation guide
    guide_content = """# CORAL ANNOTATION GUIDE

## Classes to Use

1. **Live Coral** - Healthy coral polyps (colors visible, tissues intact)
2. **Dead Coral** - Bleached/white coral, skeleton exposed, no living tissue
3. **Non-coral** - Other organisms (anemones, zoanthids, etc.)
4. **Rock/Sand** - Substrate (rocks, sand, rubble)
5. **Algae** - Macroalgae or algae-covered areas
6. **Other** - Unidentifiable or mixed

## Annotation Rules

### Drawing Boxes
- Draw boxes that fit the object snugly (not too loose)
- Include the entire coral/area within the box
- Don't overlap boxes - one box per object
- For clusters: draw one box encompassing the cluster

### Labeling
- Use exact class names (case-sensitive in Roboflow)
- Be consistent throughout dataset
- Don't create variations (e.g., "Live coral" vs "Live Coral")

### Quality Checks
- Verify each box has a label
- Don't label obviously invalid/damaged images
- Skip images that are too blurry to see details
- Flag images with poor lighting

## Estimated Time

- Per image: 2-3 minutes (5-10 boxes average)
- 100 images: 3-5 hours total
- With breaks: 1-2 days of work

## Tools

- **Roboflow** (recommended) - Automatic format conversion
- **LabelImg** - Manual, more control
- **CVAT** - Professional, team collaboration

## Tips

1. Start with 5-10 images to get the hang of it
2. Take breaks every 30 minutes
3. Review your work after completing 10 images
4. Keep class names consistent
5. When in doubt, label carefully and conservative
"""
    
    guide_path = 'coral_ml_training/ANNOTATION_GUIDE.md'
    with open(guide_path, 'w') as f:
        f.write(guide_content)
    print(f"✓ Created: {guide_path}")
    
    # Create dataset.yaml template
    yaml_content = """# YOLO Dataset Configuration
# This will be auto-generated after annotation

path: coral_ml_training  # dataset root
train: processed_images/train
val: processed_images/val
test: processed_images/test

# Classes
nc: 6  # number of classes
names: ['Live Coral', 'Dead Coral', 'Non-coral', 'Rock/Sand', 'Algae', 'Other']
"""
    
    yaml_path = 'coral_ml_training/dataset.yaml'
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
    print(f"✓ Created: {yaml_path}")
    
    print("\n" + "="*70)
    print("✅ SETUP COMPLETE!")
    print("="*70)
    print("\nNext steps:")
    print("1. Copy your sample images to: coral_ml_training/raw_images/")
    print("2. Run: python inspect_images.py")
    print("3. Check the report: coral_ml_training/logs/inspection_report.json")
    print("\nFolder structure:")
    print("""
coral_ml_training/
├── raw_images/                  ← Copy images here
├── processed_images/
│   ├── train/
│   ├── val/
│   └── test/
├── annotations/
├── logs/                        ← Reports saved here
├── models/                      ← Trained models saved here
├── README.md
├── ANNOTATION_GUIDE.md
└── dataset.yaml
""")

if __name__ == '__main__':
    setup_folders()
