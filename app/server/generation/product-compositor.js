import fsp from "node:fs/promises";
import sharp from "sharp";
import { ASPECT_RATIOS } from "../config.js";

function singlePlacement(shotType, canvasWidth, canvasHeight, layerWidth, layerHeight) {
  const marginX = Math.round(canvasWidth * 0.07);
  const bottomMargin = Math.round(canvasHeight * 0.1);
  if (["demonstration", "wide", "establishing"].includes(shotType)) {
    return {
      left: canvasWidth - layerWidth - marginX,
      top: Math.max(marginX, Math.round((canvasHeight - layerHeight) / 2)),
    };
  }
  if (["macro", "close-up", "insert"].includes(shotType)) {
    return {
      left: Math.round((canvasWidth - layerWidth) / 2),
      top: Math.max(marginX, canvasHeight - layerHeight - bottomMargin),
    };
  }
  return {
    left: Math.round((canvasWidth - layerWidth) / 2),
    top: Math.round((canvasHeight - layerHeight) / 2),
  };
}

async function productLayer(
  productBuffer,
  canvasWidth,
  canvasHeight,
  shotType,
  count,
) {
  const close = ["macro", "close-up", "insert"].includes(shotType);
  const maxWidthRatio = count > 1 ? Math.min(0.32, 0.78 / count) : close ? 0.72 : 0.5;
  const maxHeightRatio = count > 1 ? 0.56 : close ? 0.76 : 0.62;
  const result = await sharp(productBuffer, { failOn: "warning" })
    .resize({
      width: Math.round(canvasWidth * maxWidthRatio),
      height: Math.round(canvasHeight * maxHeightRatio),
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
  };
}

async function shadowLayer(width, height) {
  const padding = Math.max(16, Math.round(Math.min(width, height) * 0.06));
  const alpha = await sharp({
    create: {
      width: width + padding * 2,
      height: height + padding * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0.55 },
          },
        },
        left: padding,
        top: padding,
      },
    ])
    .blur(Math.max(8, Math.round(padding * 0.75)))
    .png()
    .toBuffer();
  return { buffer: alpha, padding };
}

function multiPositions(layers, canvasWidth, canvasHeight) {
  const gap = Math.round(canvasWidth * 0.035);
  const totalWidth = layers.reduce((sum, layer) => sum + layer.width, 0) + gap * (layers.length - 1);
  let cursor = Math.round((canvasWidth - totalWidth) / 2);
  return layers.map((layer) => {
    const position = {
      left: cursor,
      top: Math.round(canvasHeight * 0.83 - layer.height),
    };
    cursor += layer.width + gap;
    return position;
  });
}

/**
 * Places normalized original-product pixels into a generated scene. Products
 * never pass through a generative edit in this strict mode. Only proportional
 * resizing is performed to fit the selected frame.
 */
export async function compositeExactProducts({
  backgroundPath,
  productBuffers,
  outputPath,
  aspectRatio,
  shotType = "hero",
}) {
  const format = ASPECT_RATIOS[aspectRatio];
  if (!format) throw new Error(`Unsupported aspect ratio: ${aspectRatio}`);
  if (!Array.isArray(productBuffers) || productBuffers.length < 1) {
    throw new Error("Strict product compositing requires at least one product image.");
  }
  if (productBuffers.length > 4) {
    throw new Error("Strict product compositing supports up to four products per scene.");
  }
  const { width, height } = format;

  const background = await sharp(backgroundPath, { failOn: "warning" })
    .resize(width, height, { fit: "cover", position: "centre" })
    .modulate({ brightness: 0.94, saturation: 0.95 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const layers = await Promise.all(
    productBuffers.map((buffer) =>
      productLayer(buffer, width, height, shotType, productBuffers.length),
    ),
  );
  const positions =
    layers.length === 1
      ? [singlePlacement(shotType, width, height, layers[0].width, layers[0].height)]
      : multiPositions(layers, width, height);
  const shadows = await Promise.all(
    layers.map((layer) => shadowLayer(layer.width, layer.height)),
  );

  const composites = [];
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const position = positions[index];
    const shadow = shadows[index];
    composites.push({
      input: shadow.buffer,
      left: Math.max(0, position.left - shadow.padding),
      top: Math.max(0, position.top - shadow.padding + Math.round(height * 0.015)),
      blend: "over",
    });
    composites.push({
      input: layer.buffer,
      left: position.left,
      top: position.top,
      blend: "over",
    });
  }

  await sharp(background)
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toFile(outputPath);

  const stats = await fsp.stat(outputPath);
  return {
    outputPath,
    width,
    height,
    byteSize: stats.size,
    preservationMode: "exact_composite",
    productCount: productBuffers.length,
  };
}

export async function compositeExactProduct(options) {
  return compositeExactProducts({
    ...options,
    productBuffers: [options.productBuffer],
  });
}
