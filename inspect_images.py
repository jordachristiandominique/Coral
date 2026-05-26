#!/usr/bin/env python3
"""
Coral Dataset Image Inspection Tool
Analyzes and validates coral training images
"""

import os
import sys
from pathlib import Path
from PIL import Image
import json
from datetime import datetime
import matplotlib.pyplot as plt
import numpy as np

class ImageInspector:
    def __init__(self, image_folder):
        self.image_folder = image_folder
        self.results = {
            'total_images': 0,
            'valid_images': 0,
            'invalid_images': 0,
            'image_details': [],
            'format_distribution': {},
            'size_distribution': {},
            'quality_issues': [],
            'timestamp': datetime.now().isoformat()
        }
    
    def get_image_files(self):
        """Get all image files"""
        valid_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif'}
        image_files = []
        
        for file in os.listdir(self.image_folder):
            if Path(file).suffix.lower() in valid_extensions:
                image_files.append(file)
        
        return sorted(image_files)
    
    def inspect_image(self, filename):
        """Inspect individual image"""
        filepath = os.path.join(self.image_folder, filename)
        
        try:
            img = Image.open(filepath)
            
            # Get details
            width, height = img.size
            format_type = img.format
            file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
            
            # Check quality issues
            issues = []
            if width < 400 or height < 400:
                issues.append("Image too small (< 400x400)")
            if file_size_mb > 10:
                issues.append("File too large (> 10MB)")
            
            # Check if image is mostly blank
            try:
                arr = np.array(img)
                if arr.std() < 10:
                    issues.append("Image appears blank/low contrast")
            except:
                pass
            
            return {
                'filename': filename,
                'valid': True,
                'width': width,
                'height': height,
                'format': format_type,
                'size_mb': round(file_size_mb, 2),
                'issues': issues,
                'mode': img.mode
            }
        
        except Exception as e:
            return {
                'filename': filename,
                'valid': False,
                'error': str(e)
            }
    
    def run_inspection(self):
        """Run full inspection"""
        print("\n" + "="*70)
        print("CORAL DATASET IMAGE INSPECTION")
        print("="*70)
        print(f"\nScanning folder: {self.image_folder}\n")
        
        # Get all images
        image_files = self.get_image_files()
        self.results['total_images'] = len(image_files)
        
        if len(image_files) == 0:
            print("❌ ERROR: No images found in folder!")
            print(f"   Checked: {self.image_folder}")
            return False
        
        print(f"Found {len(image_files)} images\n")
        
        # Inspect each image
        print("Inspecting images...")
        for i, filename in enumerate(image_files, 1):
            result = self.inspect_image(filename)
            self.results['image_details'].append(result)
            
            if result['valid']:
                self.results['valid_images'] += 1
                
                # Track format
                fmt = result['format']
                self.results['format_distribution'][fmt] = \
                    self.results['format_distribution'].get(fmt, 0) + 1
                
                # Track size bucket
                size_key = f"{result['width']}x{result['height']}"
                self.results['size_distribution'][size_key] = \
                    self.results['size_distribution'].get(size_key, 0) + 1
                
                # Track issues
                if result['issues']:
                    self.results['quality_issues'].extend(result['issues'])
                
                status = "✓"
            else:
                self.results['invalid_images'] += 1
                status = "❌"
            
            print(f"  [{i}/{len(image_files)}] {status} {filename}")
        
        return True
    
    def print_summary(self):
        """Print inspection summary"""
        print("\n" + "="*70)
        print("INSPECTION SUMMARY")
        print("="*70)
        
        print(f"\n📊 IMAGE COUNT")
        print(f"  Total:    {self.results['total_images']}")
        print(f"  Valid:    {self.results['valid_images']} ✓")
        print(f"  Invalid:  {self.results['invalid_images']} ❌")
        
        if self.results['valid_images'] > 0:
            print(f"\n📋 FORMAT DISTRIBUTION")
            for fmt, count in sorted(self.results['format_distribution'].items()):
                pct = (count / self.results['valid_images']) * 100
                print(f"  {fmt:8} {count:3} images ({pct:.1f}%)")
            
            print(f"\n📐 SIZE DISTRIBUTION")
            for size, count in sorted(self.results['size_distribution'].items()):
                pct = (count / self.results['valid_images']) * 100
                print(f"  {size:15} {count:3} images ({pct:.1f}%)")
            
            # Get size stats
            sizes = [d['width'] * d['height'] for d in self.results['image_details'] if d['valid']]
            if sizes:
                avg_size = np.mean(sizes)
                min_size = np.min(sizes)
                max_size = np.max(sizes)
                print(f"\n📏 SIZE STATISTICS")
                print(f"  Min pixels: {min_size:,.0f} ({int(np.sqrt(min_size))}x{int(np.sqrt(min_size))})")
                print(f"  Max pixels: {max_size:,.0f} ({int(np.sqrt(max_size))}x{int(np.sqrt(max_size))})")
                print(f"  Avg pixels: {avg_size:,.0f} ({int(np.sqrt(avg_size))}x{int(np.sqrt(avg_size))})")
            
            # File size stats
            file_sizes = [d['size_mb'] for d in self.results['image_details'] if d['valid']]
            if file_sizes:
                print(f"\n💾 FILE SIZE STATISTICS")
                print(f"  Min: {min(file_sizes):.2f} MB")
                print(f"  Max: {max(file_sizes):.2f} MB")
                print(f"  Avg: {np.mean(file_sizes):.2f} MB")
                print(f"  Total: {sum(file_sizes):.2f} MB")
        
        if self.results['quality_issues']:
            print(f"\n⚠️  QUALITY ISSUES ({len(self.results['quality_issues'])} found)")
            for issue in set(self.results['quality_issues']):
                count = self.results['quality_issues'].count(issue)
                print(f"  {issue}: {count} images")
        
        print(f"\n✅ READINESS CHECK")
        self.check_readiness()
    
    def check_readiness(self):
        """Check if dataset is ready for annotation"""
        checks = []
        
        if self.results['valid_images'] < 50:
            checks.append(f"❌ Need at least 50 images (have {self.results['valid_images']})")
        else:
            checks.append(f"✓ Sufficient images ({self.results['valid_images']})")
        
        invalid_pct = (self.results['invalid_images'] / self.results['total_images']) * 100 \
            if self.results['total_images'] > 0 else 0
        
        if invalid_pct > 10:
            checks.append(f"⚠️  {invalid_pct:.1f}% images are invalid")
        else:
            checks.append(f"✓ Low invalid rate ({invalid_pct:.1f}%)")
        
        quality_issue_pct = (len(self.results['quality_issues']) / self.results['valid_images']) * 100 \
            if self.results['valid_images'] > 0 else 0
        
        if quality_issue_pct > 20:
            checks.append(f"⚠️  {quality_issue_pct:.1f}% images have quality issues")
        else:
            checks.append(f"✓ Good image quality ({quality_issue_pct:.1f}% with issues)")
        
        for check in checks:
            print(f"  {check}")
        
        all_good = all(check.startswith("✓") for check in checks)
        
        if all_good:
            print(f"\n🚀 READY FOR ANNOTATION!")
        else:
            print(f"\n⚠️  Address issues before annotation")
    
    def save_report(self, output_file='coral_ml_training/logs/inspection_report.json'):
        """Save detailed report"""
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        
        with open(output_file, 'w') as f:
            json.dump(self.results, f, indent=2)
        
        print(f"\n📄 Report saved: {output_file}")
        return output_file
    
    def visualize_sample(self, num_samples=6):
        """Show sample images"""
        valid_images = [d for d in self.results['image_details'] if d['valid']]
        
        if not valid_images:
            print("No valid images to display")
            return
        
        num_to_show = min(num_samples, len(valid_images))
        
        fig, axes = plt.subplots(2, 3, figsize=(15, 10))
        axes = axes.flatten()
        
        for idx in range(num_to_show):
            img_info = valid_images[idx]
            filepath = os.path.join(self.image_folder, img_info['filename'])
            
            try:
                img = Image.open(filepath)
                axes[idx].imshow(img)
                axes[idx].set_title(
                    f"{img_info['filename']}\n"
                    f"{img_info['width']}x{img_info['height']} | "
                    f"{img_info['size_mb']}MB",
                    fontsize=9
                )
                axes[idx].axis('off')
            except:
                pass
        
        # Hide unused subplots
        for idx in range(num_to_show, len(axes)):
            axes[idx].axis('off')
        
        plt.tight_layout()
        plt.savefig('coral_ml_training/logs/sample_images.png', dpi=100, bbox_inches='tight')
        print(f"📷 Sample images saved: coral_ml_training/logs/sample_images.png")
        plt.close()


def main():
    """Main execution"""
    image_folder = 'coral_ml_training/raw_images'
    
    if not os.path.exists(image_folder):
        print(f"❌ ERROR: Folder not found: {image_folder}")
        print("\nPlease:")
        print("1. Create the folder structure (run: mkdir -p coral_ml_training/raw_images)")
        print("2. Copy your sample images to: coral_ml_training/raw_images/")
        print("3. Run this script again")
        sys.exit(1)
    
    # Run inspection
    inspector = ImageInspector(image_folder)
    
    if inspector.run_inspection():
        inspector.print_summary()
        inspector.save_report()
        inspector.visualize_sample()
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
