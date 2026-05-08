export const trimVideo = async (
  file: File,
  startTime: number,
  endTime: number,
  outputName: string,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  // Simulate progress
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 10 + 5;
    if (progress > 90) progress = 90;
    if (onProgress) onProgress(progress / 100);
  }, 300);

  const formData = new FormData();
  formData.append("video", file);
  formData.append("start", startTime.toString());
  formData.append("end", endTime.toString());

  try {
    const response = await fetch("/api/trim", {
      method: "POST",
      body: formData,
    });

    clearInterval(interval);
    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }

    if (onProgress) onProgress(1); // 100%
    const data = await response.blob();
    return new Blob([data], { type: 'video/mp4' });
  } catch (error) {
    clearInterval(interval);
    throw error;
  }
};

