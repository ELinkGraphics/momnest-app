/**
 * Generates a thumbnail image from a video file at a specific time.
 */
export const generateVideoThumbnail = (
  file: File,
  timeInSeconds: number = 1
): Promise<{ blob: Blob; url: string }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      // Seek to the requested time
      video.currentTime = Math.min(timeInSeconds, video.duration);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            resolve({ blob, url });
          } else {
            reject(new Error('Could not generate blob from canvas'));
          }
        }, 'image/jpeg', 0.8);
        
        // Cleanup tracking
        URL.revokeObjectURL(video.src);
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => {
      reject(new Error('Error loading video file'));
    };
  });
};
