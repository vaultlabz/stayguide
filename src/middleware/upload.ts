import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../../public/uploads');
const propertiesDir = path.join(uploadsDir, 'properties');
const amenitiesDir = path.join(uploadsDir, 'amenities');

[uploadsDir, propertiesDir, amenitiesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads - using memory storage for Sharp processing
const storage = multer.memoryStorage();

// File filter to only allow images
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Create multer instance with configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Middleware for single image upload
export const uploadPropertyImage = upload.single('property_image');
export const uploadAmenityImage = upload.single('amenity_image');

// Middleware for multiple images
export const uploadImages = upload.fields([
  { name: 'property_image', maxCount: 1 },
  { name: 'amenity_image', maxCount: 1 }
]);

// Image processing configurations
const IMAGE_CONFIGS = {
  property: {
    large: { width: 1200, height: 800, quality: 85 },
    medium: { width: 800, height: 600, quality: 80 },
    small: { width: 400, height: 300, quality: 75 },
    format: 'jpeg' as const
  },
  amenity: {
    large: { width: 600, height: 400, quality: 80 },
    medium: { width: 400, height: 300, quality: 80 },
    small: { width: 200, height: 150, quality: 75 },
    format: 'jpeg' as const
  }
};

// Process and save image with Sharp
export const processAndSaveImage = async (
  buffer: Buffer,
  type: 'property' | 'amenity',
  originalName: string
): Promise<{ filename: string; sizes: { large: string; medium: string; small: string }; originalSize: number; processedSizes: { large: number; medium: number; small: number } }> => {
  const config = IMAGE_CONFIGS[type];
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const baseFilename = `${type}-${uniqueSuffix}`;
  
  const outputDir = type === 'property' ? propertiesDir : amenitiesDir;
  const originalSize = buffer.length;
  
  const sizes = {
    large: `${baseFilename}-large.${config.format}`,
    medium: `${baseFilename}-medium.${config.format}`,
    small: `${baseFilename}-small.${config.format}`
  };
  
  const processedSizes = {
    large: 0,
    medium: 0,
    small: 0
  };
  
  try {
    // Process large size
    const largePath = path.join(outputDir, sizes.large);
    await sharp(buffer)
      .resize(config.large.width, config.large.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: config.large.quality })
      .toFile(largePath);
    
    processedSizes.large = fs.statSync(largePath).size;
    
    // Process medium size
    const mediumPath = path.join(outputDir, sizes.medium);
    await sharp(buffer)
      .resize(config.medium.width, config.medium.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: config.medium.quality })
      .toFile(mediumPath);
    
    processedSizes.medium = fs.statSync(mediumPath).size;
    
    // Process small size
    const smallPath = path.join(outputDir, sizes.small);
    await sharp(buffer)
      .resize(config.small.width, config.small.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: config.small.quality })
      .toFile(smallPath);
    
    processedSizes.small = fs.statSync(smallPath).size;
    
    console.log(`Image processed with multiple sizes: ${baseFilename} (${type})`);
    console.log(`Original: ${(originalSize / 1024).toFixed(1)}KB → Large: ${(processedSizes.large / 1024).toFixed(1)}KB, Medium: ${(processedSizes.medium / 1024).toFixed(1)}KB, Small: ${(processedSizes.small / 1024).toFixed(1)}KB`);
    
    // Return the large size as the primary filename for compatibility
    return {
      filename: sizes.large,
      sizes,
      originalSize,
      processedSizes
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Failed to process image');
  }
};

// Helper function to get image URL
export const getImageUrl = (filename: string, type: 'property' | 'amenity'): string => {
  return `/uploads/${type === 'property' ? 'properties' : 'amenities'}/${filename}`;
};

// Helper function to delete uploaded file
export const deleteImage = (filename: string, type: 'property' | 'amenity'): void => {
  const filePath = path.join(
    __dirname, 
    `../../public/uploads/${type === 'property' ? 'properties' : 'amenities'}/${filename}`
  );
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export default upload;