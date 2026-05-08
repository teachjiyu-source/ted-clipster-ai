export interface ClipSuggestion {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  reasoning: string;
}

const titles = [
  "The Core Argument",
  "A Surprising Fact",
  "Key Takeaway",
  "The Turning Point",
  "Inspiring Conclusion",
  "The Problem Statement",
  "Fascinating Example",
];

const reasonings = [
  "High energy level and strong vocal emphasis detected.",
  "Clear shift in topic with distinct summary points.",
  "Significant pause followed by a key statement.",
  "Audience reaction (simulated) indicates high engagement.",
  "Visual scene change aligning with narrative peak.",
];

export const generateAiClips = (
  videoDuration: number,
  targetDurations: number[] // durations in seconds
): ClipSuggestion[] => {
  const suggestions: ClipSuggestion[] = [];
  
  if (videoDuration <= 0 || targetDurations.length === 0) return suggestions;

  // We want to generate ~2-3 suggestions per target duration, or at least a few across the board
  targetDurations.forEach((duration) => {
    // If video is shorter than the requested duration, we can't make this clip
    if (videoDuration <= duration) return;

    // Generate 2 random clips for this duration
    for (let i = 0; i < 2; i++) {
      const maxStart = videoDuration - duration;
      const startTime = Math.floor(Math.random() * maxStart);
      const endTime = startTime + duration;
      
      suggestions.push({
        id: Math.random().toString(36).substring(7),
        title: titles[Math.floor(Math.random() * titles.length)],
        startTime,
        endTime,
        duration,
        score: Math.floor(Math.random() * 20) + 80, // 80-99 score
        reasoning: reasonings[Math.floor(Math.random() * reasonings.length)],
      });
    }
  });

  // Sort by score descending
  return suggestions.sort((a, b) => b.score - a.score);
};
