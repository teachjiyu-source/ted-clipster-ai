import React, { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { UploadCloud, Video, Scissors, Wand2, Download, Play, Pause, Settings2, Loader2, CheckCircle2, Volume2, VolumeX, Maximize } from 'lucide-react';
import { cn, formatTime } from './lib/utils';
import { trimVideo } from './lib/ffmpeg';
import { generateAiClips, ClipSuggestion } from './lib/ai';

const DURATIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
  { label: '4m', value: 240 },
  { label: '5m', value: 300 },
  { label: '6m', value: 360 },
  { label: '7m', value: 420 },
  { label: '8m', value: 480 },
  { label: '9m', value: 540 },
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [selectedDurations, setSelectedDurations] = useState<number[]>([]);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  
  const [aiSuggestions, setAiSuggestions] = useState<ClipSuggestion[]>([]);
  const [generatedClips, setGeneratedClips] = useState<{id: string, url: string, title: string}[]>([]);

  // Manual trimming state
  const [manualStart, setManualStart] = useState(0);
  const [manualEnd, setManualEnd] = useState(15);
  
  const [activePreview, setActivePreview] = useState<{ id: string, start: number, end: number } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      const f = acceptedFiles[0];
      setFile(f);
      setVideoUrl(URL.createObjectURL(f));
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    maxFiles: 1
  });

  const handleVideoLoad = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
      setManualEnd(Math.min(15, videoRef.current.duration));
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      if (mode === 'manual') {
        if (time > manualEnd) {
          videoRef.current.pause();
          setIsPlaying(false);
          videoRef.current.currentTime = manualEnd;
        } else if (time < manualStart) {
          videoRef.current.pause();
          setIsPlaying(false);
          videoRef.current.currentTime = manualStart;
        }
      } else if (mode === 'auto' && activePreview) {
        if (time >= activePreview.end) {
          videoRef.current.pause();
          setIsPlaying(false);
          videoRef.current.currentTime = activePreview.end;
          setActivePreview(null);
        } else if (time < activePreview.start) {
          videoRef.current.currentTime = activePreview.start;
        }
      }
    }
  };

  const toggleDuration = (val: number) => {
    setSelectedDurations(prev => 
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
    }
    if (val > 0 && isMuted) {
      setIsMuted(false);
      if (videoRef.current) videoRef.current.muted = false;
    } else if (val === 0 && !isMuted) {
      setIsMuted(true);
      if (videoRef.current) videoRef.current.muted = true;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      if (isMuted && volume === 0) {
        setVolume(1);
        videoRef.current.volume = 1;
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const previewClip = (startTime: number, endTime: number, id: string = 'preview') => {
    if (videoRef.current) {
      if (activePreview?.id === id && isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        setActivePreview({ id, start: startTime, end: endTime });
        videoRef.current.currentTime = startTime;
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, type: 'start' | 'end') => {
    setIsDragging(type);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !timelineRef.current || videoDuration === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    const newTime = percent * videoDuration;
    
    if (isDragging === 'start') {
      if (newTime < manualEnd) {
        setManualStart(newTime);
        if (videoRef.current) videoRef.current.currentTime = newTime;
      }
    } else {
      if (newTime > manualStart) {
        setManualEnd(newTime);
        if (videoRef.current) videoRef.current.currentTime = newTime;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleGenerateAI = async () => {
    if (!file || selectedDurations.length === 0) {
      alert("Please select at least one duration.");
      return;
    }
    
    setIsProcessing(true);
    setProgress(0);
    
    // Simulate AI thinking
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.random() * 10 + 5;
      if (currentProgress > 90) currentProgress = 90;
      setProgress(Math.round(currentProgress));
    }, 250);

    setTimeout(() => {
      clearInterval(interval);
      const clips = generateAiClips(videoDuration, selectedDurations);
      setAiSuggestions(clips);
      setProgress(100);
      setIsProcessing(false);
    }, 2500);
  };

  const handleExportClip = async (start: number, end: number, title: string) => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const blob = await trimVideo(file, start, end, 'output.mp4', (p) => {
        setProgress(Math.round(p * 100));
      });
      
      const url = URL.createObjectURL(blob);
      setGeneratedClips(prev => [...prev, { id: Math.random().toString(), url, title }]);
      setProgress(100);
    } catch (e) {
      console.error(e);
      alert("Failed to export video.");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-rose-500/30">
      <header className="border-b border-white/5 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-purple-600 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight text-lg">TED Clips <span className="text-white/50">AI Studio</span></span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-white/60">
            <button className="hover:text-white transition-colors">Projects</button>
            <button className="hover:text-white transition-colors">Settings</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Player & Editor */}
        <div className="lg:col-span-8 space-y-6">
          {!file ? (
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer h-[500px] flex flex-col items-center justify-center",
                isDragActive ? "border-rose-500 bg-rose-500/5 text-rose-500" : "border-white/10 text-white/40 hover:border-white/20 hover:bg-white/5"
              )}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">Drop your video here</h3>
              <p className="max-w-sm mx-auto text-sm">Upload a long-form video (MP4, WEBM) to start extracting highlights using AI.</p>
            </div>
          ) : (
            <div ref={playerContainerRef} className="rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl relative group flex flex-col justify-center max-h-[80vh]">
              <video 
                ref={videoRef}
                src={videoUrl!} 
                className="w-full h-full max-h-[70vh] aspect-video object-contain bg-black"
                onLoadedMetadata={handleVideoLoad}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
              />
              
              {/* Player Controls */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end gap-3 z-30">
                
                {/* Timeline progress bar */}
                <div 
                  className="w-full h-2 bg-white/20 rounded-full cursor-pointer relative group/timeline hover:h-2.5 transition-all"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const newTime = percent * videoDuration;
                    setCurrentTime(newTime);
                    setActivePreview(null);
                    if (videoRef.current) videoRef.current.currentTime = newTime;
                  }}
                >
                  {/* Highlight active preview in auto mode */}
                  {mode === 'auto' && activePreview && videoDuration > 0 && (
                    <div 
                      className="absolute top-0 bottom-0 bg-rose-500/30 z-0 pointer-events-none"
                      style={{ 
                        left: `${(activePreview.start / videoDuration) * 100}%`, 
                        width: `${((activePreview.end - activePreview.start) / videoDuration) * 100}%` 
                      }}
                    />
                  )}
                  <div className="h-full bg-rose-500 rounded-full relative z-10" style={{ width: `${(currentTime / videoDuration) * 100}%` }}>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/timeline:opacity-100 shadow-sm translate-x-1/2" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform flex-shrink-0">
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-1" />}
                    </button>

                    <div className="flex items-center gap-2 group/vol pl-2">
                      <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors cursor-pointer z-10 flex-shrink-0">
                        {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-300 accent-white h-1.5 rounded-full appearance-none bg-white/20 cursor-pointer pointer-events-none group-hover/vol:pointer-events-auto"
                      />
                    </div>

                    <div className="text-white/80 font-mono tracking-wider ml-1 flex-shrink-0">
                      {formatTime(currentTime)} / {formatTime(videoDuration)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <button onClick={toggleFullscreen} className="text-white/80 hover:text-white transition-colors cursor-pointer">
                      <Maximize className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Timeline / Manual Editor placeholder */}
          {file && mode === 'manual' && (
            <motion.div 
              initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}}
              className="p-6 rounded-2xl bg-white/5 border border-white/10"
            >
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Settings2 className="w-5 h-5 text-rose-500" /> Manual Adjustments</h3>
              <div className="space-y-6">
                <div 
                  ref={timelineRef}
                  className="relative h-24 bg-black/40 rounded-xl border border-white/10 overflow-hidden cursor-crosshair select-none pt-4 pb-2"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onPointerDown={(e) => {
                    if (!timelineRef.current || videoDuration === 0) return;
                    const rect = timelineRef.current.getBoundingClientRect();
                    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const newTime = percent * videoDuration;
                    setCurrentTime(newTime);
                    if (videoRef.current) videoRef.current.currentTime = newTime;
                  }}
                >
                  {/* Decorative waveform tracks */}
                  <div className="absolute inset-0 flex items-end px-2 opacity-30 pointer-events-none">
                     {Array.from({length: 80}).map((_, i) => (
                       <div key={i} className="flex-1 bg-white/40 mx-[1px] rounded-t-sm" style={{ height: `${20 + Math.random() * 60}%`}} />
                     ))}
                  </div>

                  {/* Playhead */}
                  {videoDuration > 0 && (
                    <div 
                      className="absolute top-0 bottom-0 w-[2px] bg-white z-0 pointer-events-none shadow-[0_0_8px_white]"
                      style={{ left: `${(currentTime / videoDuration) * 100}%` }}
                    />
                  )}

                  {/* Selected Region Highlight */}
                  {videoDuration > 0 && (
                    <div 
                      className="absolute top-0 bottom-0 bg-gradient-to-r from-rose-500/20 to-purple-500/20 border-y border-rose-500/30 z-10 pointer-events-none backdrop-blur-[1px]"
                      style={{ 
                        left: `${(manualStart / videoDuration) * 100}%`, 
                        width: `${((manualEnd - manualStart) / videoDuration) * 100}%` 
                      }}
                    >
                       <div className="absolute top-1 left-2 text-[10px] font-mono text-rose-300 opacity-90">{formatTime(manualStart)}</div>
                       <div className="absolute top-1 right-2 text-[10px] font-mono text-purple-300 opacity-90">{formatTime(manualEnd)}</div>
                    </div>
                  )}

                  {/* Start Drag Handle */}
                  {videoDuration > 0 && (
                    <div 
                      className="absolute top-0 bottom-0 w-6 -translate-x-1/2 flex justify-center z-20 cursor-ew-resize group"
                      style={{ left: `${(manualStart / videoDuration) * 100}%` }}
                      onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'start'); }}
                    >
                      <div className="w-1.5 h-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)] group-hover:w-2 transition-all rounded-full" />
                    </div>
                  )}

                  {/* End Drag Handle */}
                  {videoDuration > 0 && (
                    <div 
                      className="absolute top-0 bottom-0 w-6 -translate-x-1/2 flex justify-center z-20 cursor-ew-resize group"
                      style={{ left: `${(manualEnd / videoDuration) * 100}%` }}
                      onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'end'); }}
                    >
                      <div className="w-1.5 h-full bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.8)] group-hover:w-2 transition-all rounded-full" />
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <div className="text-sm text-white/60">
                    Selected Duration: <span className="text-white font-mono bg-white/10 px-2 py-1 rounded ml-2">{formatTime(manualEnd - manualStart)}</span>
                  </div>
                  <button 
                    onClick={() => handleExportClip(manualStart, manualEnd, `Manual Clip ${formatTime(manualStart)}`)}
                    disabled={isProcessing}
                    className="px-6 py-2 bg-white text-black rounded-full font-medium hover:bg-white/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                    Export Clip
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Generated Clips Dashboard */}
          {generatedClips.length > 0 && (
             <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="p-6 rounded-2xl bg-slate-900 border border-emerald-500/20">
               <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-5 h-5" /> Ready for Download</h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {generatedClips.map(clip => (
                   <div key={clip.id} className="p-4 rounded-xl bg-black/50 border border-white/5 flex flex-col gap-3 group hover:border-white/20 transition-colors">
                     <span className="font-medium text-sm truncate">{clip.title}.mp4</span>
                     <video src={clip.url} controls className="w-full rounded-lg bg-black/50 aspect-video object-contain" />
                     <a href={clip.url} download={`${clip.title}.mp4`} className="w-full py-2 flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors text-sm font-medium">
                       <Download className="w-4 h-4" /> Download
                     </a>
                   </div>
                 ))}
               </div>
             </motion.div>
          )}

        </div>

        {/* Right Column: AI Tools & Settings */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
             {/* decorative gradient */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[100px] pointer-events-none rounded-full" />
            
            <div className="flex bg-white/5 p-1 rounded-lg mb-8">
              <button 
                onClick={() => { setMode('auto'); setActivePreview(null); }}
                className={cn("flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2", mode === 'auto' ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white/80")}
              >
                <Wand2 className="w-4 h-4" /> Auto AI
              </button>
              <button 
                onClick={() => { setMode('manual'); setActivePreview(null); }}
                className={cn("flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2", mode === 'manual' ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white/80")}
              >
                <Settings2 className="w-4 h-4" /> Manual
              </button>
            </div>

            {mode === 'auto' ? (
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-medium text-white/80 mb-4">Target Durations</h3>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => toggleDuration(d.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                          selectedDurations.includes(d.value) 
                            ? "bg-rose-500/20 border-rose-500/50 text-rose-200" 
                            : "bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleGenerateAI}
                  disabled={!file || isProcessing || selectedDurations.length === 0}
                  className="w-full py-3 bg-gradient-to-r from-rose-500 to-purple-600 rounded-xl font-medium text-white shadow-[0_0_40px_-10px_rgba(230,43,30,0.4)] hover:shadow-[0_0_40px_-5px_rgba(230,43,30,0.6)] disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2 group"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                  ) : (
                    <><Wand2 className="w-5 h-5 group-hover:scale-110 transition-transform" /> Generate Magic Clips</>
                  )}
                </button>

                {isProcessing && progress >= 0 && mode === 'auto' && (
                  <div className="mt-4">
                     <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                       <div className="h-full bg-gradient-to-r from-rose-500 to-purple-500 transition-all duration-300" style={{width: `${progress}%`}} />
                     </div>
                     <div className="text-xs text-white/50 mt-2 text-right">{progress}%</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-white/60 leading-relaxed text-center py-12">
                Use the timeline controls under the video to manually select and export specific segments.
              </div>
            )}
          </div>

          {/* AI Suggestions List */}
          <AnimatePresence>
            {aiSuggestions.length > 0 && mode === 'auto' && (
              <motion.div 
                initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}}
                className="space-y-3"
              >
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-medium text-white/80">AI Suggestions</h3>
                  <span className="text-xs text-white/40">{aiSuggestions.length} items</span>
                </div>
                
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {aiSuggestions.map((clip, i) => (
                    <motion.div 
                      key={clip.id}
                      initial={{opacity: 0, x: -20}} animate={{opacity: 1, x: 0}} transition={{delay: i * 0.1}}
                      className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-purple-500/30 hover:bg-white/[0.05] transition-all group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-sm line-clamp-1">{clip.title}</h4>
                        <div className="flex items-center gap-1 text-xs font-mono text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded">
                          {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                        </div>
                      </div>
                      
                      <p className="text-xs text-white/40 mb-4 line-clamp-2">{clip.reasoning}</p>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => previewClip(clip.startTime, clip.endTime, clip.id)}
                          className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1", activePreview?.id === clip.id ? "bg-rose-500/20 text-rose-300" : "bg-white/5 hover:bg-white/10")}
                        >
                          {activePreview?.id === clip.id && isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />} 
                          {activePreview?.id === clip.id && isPlaying ? 'Pause' : 'Preview'}
                        </button>
                        <button 
                           onClick={() => handleExportClip(clip.startTime, clip.endTime, clip.title)}
                           disabled={isProcessing}
                          className="flex-1 py-1.5 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          <Download className="w-3 h-3" /> Export
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>
    </div>
  );
}
