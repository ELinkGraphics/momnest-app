const sharp = require('sharp');
const fs = require('fs');

async function createIcon(size) {
  // We want the logo to occupy about 60% of the canvas to be "safe" from maskable crop.
  // 60% of 512 is ~300.
  const padding = Math.floor(size * 0.2); // 20% padding on all sides = 60% size
  const innerSize = size - (padding * 2);

  await sharp('public/lovable-uploads/SerkleMainLogo.svg')
    .resize({
      width: innerSize,
      height: innerSize,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent inside resize
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 255, g: 255, b: 255, alpha: 1 } // White background for the full canvas
    })
    .toFile(`public/icon-${size}.png`);
    
  console.log(`Created icon-${size}.png`);
}

async function main() {
  try {
    await createIcon(512);
    await createIcon(192);
    console.log("Done.");
  } catch (err) {
    console.error(err);
  }
}

main();
